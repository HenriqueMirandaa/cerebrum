const express = require('express');
let multer;
let multerAvailable = true;
try {
  multer = require('multer');
} catch (e) {
  console.warn('multer not available; upload endpoint will be disabled until you run `npm install multer`');
  multerAvailable = false;
}
const path = require('path');
const fs = require('fs');
const pool = require('../config/database');

const uploadDir = path.join(__dirname, '..', '..', 'backend_uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

let upload = null;
if (multerAvailable) {
  const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
  });
  upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } }); // 50MB
}

const router = express.Router();

// POST /api/ai/upload
router.post('/upload', (req, res, next) => {
  if (!multerAvailable) return res.status(503).json({ error: 'Upload unavailable: multer not installed. Run `npm install multer` in backend.' });
  // delegate to multer handler
  return upload.single('file')(req, res, async (err) => {
    if (err) return res.status(400).json({ error: String(err) });
    try {
      if (!req.file) return res.status(400).json({ error: 'Arquivo não enviado' });
      const userId = req.user ? req.user.id : null; // auth middleware optional
      const [result] = await pool.execute(
        'INSERT INTO ai_documents (user_id, filename, path, status, created_at) VALUES (?, ?, ?, ?, NOW())',
        [userId, req.file.originalname, req.file.path, 'pending']
      );
      const docId = result.insertId;
      res.json({ ok: true, documentId: docId, filename: req.file.originalname });
    } catch (err2) {
      console.error('Erro em /api/ai/upload', err2);
      res.status(500).json({ error: 'Erro ao salvar arquivo' });
    }
  });
});

// POST /api/ai/chat
router.post('/chat', async (req, res) => {
  try {
    const { question, top_k = 5 } = req.body;
    if (!question) return res.status(400).json({ error: 'Pergunta obrigatória' });

    // Call local Python service for search + generation
    const pyBase = process.env.PY_SERVICE_URL || 'http://127.0.0.1:5000';
    const fetch = require('node-fetch');

    // 1) search
    const searchResp = await fetch(`${pyBase}/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: question, k: top_k })
    });
    if (!searchResp.ok) {
      const txt = await searchResp.text();
      throw new Error('Busca falhou: ' + txt);
    }
    const searchData = await searchResp.json();

    // 2) build prompt with retrieved contexts
    const contexts = (searchData.results || []).map(r => `Source: ${r.meta.source}\n${r.text}`).join('\n\n');
    const system = 'Você é um assistente didático que responde com clareza e exemplos. Baseie-se apenas nos trechos do material fornecido quando relevante.';
    const prompt = `${system}\n\nContextos:\n${contexts}\n\nPergunta: ${question}\nResposta:`;

    // 3) generate
    const genResp = await fetch(`${pyBase}/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, max_tokens: 512 })
    });
    if (!genResp.ok) {
      const txt = await genResp.text();
      throw new Error('Geração falhou: ' + txt);
    }
    const genData = await genResp.json();

    // save chat to DB
    try {
      await pool.execute('INSERT INTO ai_chats (user_id, question, answer, created_at) VALUES (?, ?, ?, NOW())', [req.user ? req.user.id : null, question, genData.text]);
    } catch (e) { console.warn('Não foi possível salvar chat', e); }

    res.json({ answer: genData.text, sources: searchData.results });
  } catch (err) {
    console.error('/api/ai/chat error', err);
    res.status(500).json({ error: 'Erro ao processar pergunta', details: String(err) });
  }
});

module.exports = router;
