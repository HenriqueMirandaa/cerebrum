Local Python service for embeddings, FAISS index and local LLM generation.

Requirements
- Python 3.10+
- Install dependencies in a virtualenv:

```bash
python -m venv .venv
source .venv/bin/activate   # on Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

Models
- Embeddings: by default uses `sentence-transformers/all-MiniLM-L6-v2` which will be downloaded automatically.
- Local LLM: set `LLAMA_PATH` env var to the path of a local Llama/GGML model file (for `llama-cpp-python`). Example:

```bash
export LLAMA_PATH=/path/to/llama-model.bin
```

Run

```bash
python app.py
# service listens on http://127.0.0.1:5000 by default
```

Endpoints
- POST /index_document — body: { document_id, filename, chunks: [{id, text, meta}] }
- POST /search — body: { query, k }
- POST /generate — body: { prompt, max_tokens }

Notes
- FAISS index and metadata are persisted to `backend/py_service/data/`.
- If you cannot run a Llama-like model, the `/generate` endpoint will return an error instructing how to provide `LLAMA_PATH`.
