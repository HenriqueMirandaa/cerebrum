const fs = require('fs');
const path = require('path');
const pool = require('../config/database');
const fetch = require('node-fetch');
const pdf = require('pdf-parse');
const mammoth = require('mammoth');

const POLL_INTERVAL = parseInt(process.env.WORKER_POLL_MS || '5000', 10);
const PY_BASE = process.env.PY_SERVICE_URL || 'http://127.0.0.1:5000';

async function extractText(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.pdf') {
    const data = fs.readFileSync(filePath);
    const r = await pdf(data);
    return r.text;
  }
  if (ext === '.docx' || ext === '.doc') {
    const result = await mammoth.extractRawText({ path: filePath });
    return result.value;
  }
  // fallback: read as text
  return fs.readFileSync(filePath, 'utf-8');
}

function chunkText(text, maxChars = 3000) {
  const chunks = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(text.length, start + maxChars);
    // try to break at nearest newline or sentence end
    const nl = text.lastIndexOf('\n', end);
    if (nl > start && nl > end - 200) end = nl;
    const chunk = text.slice(start, end).trim();
    if (chunk) chunks.push(chunk);
    start = end;
  }
  return chunks;
}

async function processDocument(doc) {
  console.log('Processing document', doc.id, doc.path);
  try {
    const text = await extractText(doc.path);
    const chunks = chunkText(text, 3500);

    // prepare payload for Python service
    const payload = {
      document_id: doc.id,
      filename: doc.filename,
      chunks: chunks.map((c, i) => ({ id: `${doc.id}_${i}`, text: c, meta: { source: doc.filename, index: i } }))
    };

    const resp = await fetch(`${PY_BASE}/index_document`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!resp.ok) {
      const txt = await resp.text();
      throw new Error('Python index failed: ' + txt);
    }

    // mark document processed
    await pool.execute('UPDATE ai_documents SET status = ?, processed_at = NOW() WHERE id = ?', ['processed', doc.id]);
    console.log('Indexed', doc.id, 'chunks:', chunks.length);
  } catch (err) {
    console.error('Error processing document', doc.id, err);
    await pool.execute('UPDATE ai_documents SET status = ?, last_error = ? WHERE id = ?', ['error', String(err), doc.id]);
  }
}

async function pollOnce() {
  try {
    const [rows] = await pool.execute('SELECT id, filename, path FROM ai_documents WHERE status = ? LIMIT 5', ['pending']);
    for (const r of rows) {
      await processDocument(r);
    }
  } catch (err) {
    console.error('Worker poll failed', err);
  }
}

async function run() {
  console.log('AI indexer worker started. Poll interval', POLL_INTERVAL);
  while (true) {
    await pollOnce();
    await new Promise(res => setTimeout(res, POLL_INTERVAL));
  }
}

run().catch(err => {
  console.error('Worker fatal error', err);
  process.exit(1);
});
