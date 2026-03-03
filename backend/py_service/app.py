import os
import json
import sqlite3
from flask import Flask, request, jsonify
from sentence_transformers import SentenceTransformer
import numpy as np
import faiss

app = Flask(__name__)

BASE_DIR = os.path.dirname(__file__)
DATA_DIR = os.path.join(BASE_DIR, 'data')
os.makedirs(DATA_DIR, exist_ok=True)
META_DB = os.path.join(DATA_DIR, 'meta.db')
FAISS_INDEX_PATH = os.path.join(DATA_DIR, 'faiss_index.bin')

# Load embedding model
EMB_MODEL_NAME = os.environ.get('EMB_MODEL', 'all-MiniLM-L6-v2')
print('Loading embedding model', EMB_MODEL_NAME)
emb_model = SentenceTransformer(EMB_MODEL_NAME)

# determine embedding dimension
_dim = emb_model.encode('hello').shape[0]
print('Embedding dim', _dim)

# open or create sqlite db for metadata
conn = sqlite3.connect(META_DB, check_same_thread=False)
cur = conn.cursor()
cur.execute('''CREATE TABLE IF NOT EXISTS chunks (faiss_id INTEGER PRIMARY KEY, chunk_id TEXT UNIQUE, document_id INTEGER, meta TEXT, text TEXT)''')
conn.commit()

# create or load faiss index
if os.path.exists(FAISS_INDEX_PATH):
    try:
        index = faiss.read_index(FAISS_INDEX_PATH)
        print('FAISS index loaded, ntotal=', index.ntotal)
    except Exception as e:
        print('Failed loading FAISS index, creating new. Error:', e)
        index = faiss.IndexFlatIP(_dim)
else:
    index = faiss.IndexFlatIP(_dim)

def normalize(v):
    v = np.array(v, dtype='float32')
    norm = np.linalg.norm(v)
    if norm == 0:
        return v
    return v / norm

def persist_index():
    try:
        faiss.write_index(index, FAISS_INDEX_PATH)
    except Exception as e:
        print('Failed to persist index', e)

@app.route('/index_document', methods=['POST'])
def index_document():
    data = request.get_json()
    document_id = data.get('document_id')
    chunks = data.get('chunks', [])
    if not chunks:
        return jsonify({'error': 'no chunks provided'}), 400

    texts = [c['text'] for c in chunks]
    ids = [c['id'] for c in chunks]
    metas = [c.get('meta', {}) for c in chunks]

    emb = emb_model.encode(texts, show_progress_bar=False, convert_to_numpy=True)
    # normalize
    norms = np.linalg.norm(emb, axis=1, keepdims=True)
    norms[norms == 0] = 1
    emb = emb / norms

    # add to faiss
    index.add(emb.astype('float32'))
    start = index.ntotal - emb.shape[0]

    # persist metadata mapping
    for i, chunk_id in enumerate(ids):
        faiss_id = start + i
        cur.execute('INSERT OR REPLACE INTO chunks (faiss_id, chunk_id, document_id, meta, text) VALUES (?, ?, ?, ?, ?)',
                    (faiss_id, chunk_id, document_id, json.dumps(metas[i]), texts[i]))
    conn.commit()
    persist_index()
    return jsonify({'ok': True, 'added': len(ids)})

@app.route('/search', methods=['POST'])
def search():
    data = request.get_json()
    query = data.get('query')
    k = int(data.get('k', 5))
    if not query:
        return jsonify({'error': 'query required'}), 400

    q_emb = emb_model.encode([query], convert_to_numpy=True)
    q_emb = q_emb / (np.linalg.norm(q_emb, axis=1, keepdims=True) + 1e-10)
    if index.ntotal == 0:
        return jsonify({'results': []})
    D, I = index.search(q_emb.astype('float32'), k)
    results = []
    for score, faiss_id in zip(D[0], I[0]):
        if faiss_id < 0:
            continue
        cur.execute('SELECT chunk_id, document_id, meta, text FROM chunks WHERE faiss_id = ?', (int(faiss_id),))
        row = cur.fetchone()
        if not row:
            continue
        chunk_id, document_id, meta_json, text = row
        results.append({'id': chunk_id, 'score': float(score), 'meta': json.loads(meta_json or '{}'), 'text': text})
    return jsonify({'results': results})

def generate_with_llama(prompt, max_tokens=256):
    # try to use llama-cpp-python
    try:
        from llama_cpp import Llama
    except Exception:
        raise RuntimeError('llama-cpp-python not installed or not available; install it and provide a local model via LLAMA_PATH')
    model_path = os.environ.get('LLAMA_PATH')
    if not model_path or not os.path.exists(model_path):
        raise RuntimeError('LLAMA_PATH not set or model not found. Set LLAMA_PATH env var to local llama-compatible model file')
    llm = Llama(model_path=model_path)
    out = llm(prompt=prompt, max_tokens=max_tokens)
    return out['choices'][0]['text'] if 'choices' in out else out.get('text', '')

@app.route('/generate', methods=['POST'])
def generate():
    data = request.get_json()
    prompt = data.get('prompt')
    max_tokens = int(data.get('max_tokens', 256))
    if not prompt:
        return jsonify({'error': 'prompt required'}), 400
    try:
        text = generate_with_llama(prompt, max_tokens=max_tokens)
        return jsonify({'text': text})
    except Exception as e:
        return jsonify({'error': 'generation failed', 'details': str(e)}), 500

if __name__ == '__main__':
    app.run(host='127.0.0.1', port=int(os.environ.get('PY_SERVICE_PORT', 5000)))
