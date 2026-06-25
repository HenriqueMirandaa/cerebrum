const express = require('express');
let multer;
let multerAvailable = true;
try {
  multer = require('multer');
} catch (error) {
  console.warn('multer not available; upload endpoint will be disabled until you run `npm install multer`');
  multerAvailable = false;
}
const path = require('path');
const fs = require('fs');
const fetch = require('node-fetch');
const pool = require('../config/database');
const auth = require('../middleware/auth');
const {
  askForTextReply,
  sanitizeAssistantTextReply,
  generateQuiz,
  generateExercises,
  generateRecommendations,
  analyzeProgress,
  callHuggingFaceChat,
  getProviderStatus,
  createEventFromMessage
} = require('../services/aiAssistantService');

const uploadDir = path.join(__dirname, '..', '..', 'backend_uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

function normalizeIntentText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function parseQuizPrompt(message) {
  const raw = String(message || '').trim();
  const normalized = normalizeIntentText(raw);

  if (!/\b(quiz|quizz|questionario|teste rapido)\b/.test(normalized)) return null;
  if (!/\b(gera|gerar|gere|cria|criar|faz|fazer|monte|monta|produz)\b/.test(normalized)) return null;

  const countMatch = normalized.match(/(\d+)\s+(?:perguntas?|questoes?)/);
  const questionCount = Math.max(3, Math.min(10, Number(countMatch?.[1] || 5)));
  const subjectMatch = raw.match(/\b(?:quiz|quizz|question[aá]rio|teste r[aá]pido)\s+de\s+(?:\d+\s+perguntas?\s+de\s+)?(.+?)(?=\s+sobre\s+|\s+com\s+\d+\s+perguntas?|$)/i);
  const topicMatch = raw.match(/\bsobre\s+(.+?)(?=\s+com\s+\d+\s+perguntas?|$)/i);

  return {
    subjectName: subjectMatch ? subjectMatch[1].trim() : '',
    topic: topicMatch ? topicMatch[1].trim() : '',
    questionCount
  };
}

let upload = null;
if (multerAvailable) {
  const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
  });
  upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } });
}

const router = express.Router();

router.get('/provider-status', auth, async (req, res) => {
  try {
    const forceRefresh = String(req.query?.refresh || '').toLowerCase() === 'true';
    const status = await getProviderStatus({ forceRefresh });
    res.json(status);
  } catch (error) {
    console.error('/api/ai/provider-status error', error);
    res.status(500).json({ available: false, provider: 'huggingface', model: process.env.HF_MODEL || 'unknown', reason: String(error.message || error) });
  }
});

router.post('/assistant', auth, async (req, res) => {
  try {
    const message = String(req.body?.message || '').trim();
    if (!message) return res.status(400).json({ error: 'Mensagem obrigatoria.' });

    const quizRequest = parseQuizPrompt(message);
    if (quizRequest) {
      const quiz = await generateQuiz({ userId: req.user.id, options: quizRequest });
      return res.json({
        answer: `Criei um quiz de ${quiz.questionCount || 5} perguntas de ${quiz.subject || 'Geral'} sobre ${quiz.topic || 'revisao geral'}. Ele ja esta disponivel em Ferramentas > Quizzes.`,
        quiz
      });
    }

    // Detectar se o pedido é para marcar um evento
    const isEventRequest = /(?:marca|schedule|marca-me|agendar|exame|prova|teste|reunião)\s+(?:o\s+)?(?:exame|prova|teste|reunião|aula|trabalho)/i.test(message);

    const shouldCreateEvent = isEventRequest
      || /(?:marc|agend|schedule)/i.test(message.normalize('NFD').replace(/[\u0300-\u036f]/g, ''))
      || /(?:exame|prova|teste|reuniao|aula|trabalho|entrega)\s+(?:de|do|da)?\s+\S+/i.test(message.normalize('NFD').replace(/[\u0300-\u036f]/g, ''));

    let eventResult = null;
    if (shouldCreateEvent) {
      eventResult = await createEventFromMessage({ userId: req.user.id, message });
    }

    const rawAnswer = await askForTextReply({
      userId: req.user.id,
      message,
      extraInstruction: 'Responde como tutor do Cerebrum. Se o utilizador pedir um plano de estudo, organiza a resposta por prioridade, carga e proximo passo.'
    });

    const eventMessage = eventResult && eventResult.success
      ? `Evento "${eventResult.title}" marcado com sucesso para ${new Date(eventResult.start_iso).toLocaleString('pt-PT')}.`
      : '';

    const cleanedAnswer = sanitizeAssistantTextReply(rawAnswer);
    const answer = eventMessage || cleanedAnswer || (eventResult && eventResult.error) || 'Pedido processado com sucesso.';
    const response = { answer };
    if (eventResult && eventResult.success) {
      response.event = eventResult;
      response.eventMessage = eventMessage;
    } else if (eventResult && !eventResult.success) {
      response.eventError = eventResult.error;
    }

    res.json(response);
  } catch (error) {
    console.error('/api/ai/assistant error', error);
    res.status(500).json({ error: 'Erro ao gerar resposta do assistente.', details: String(error.message || error) });
  }
});

router.post('/recommendations', auth, async (req, res) => {
  try {
    const focus = String(req.body?.focus || 'today').trim().toLowerCase();
    const recommendations = await generateRecommendations({ userId: req.user.id, focus });
    res.json({ recommendations });
  } catch (error) {
    console.error('/api/ai/recommendations error', error);
    res.status(500).json({ error: 'Erro ao gerar recomendacoes.', details: String(error.message || error) });
  }
});

router.post('/analyze', auth, async (req, res) => {
  try {
    const analysis = await analyzeProgress({ userId: req.user.id });
    res.json(analysis);
  } catch (error) {
    console.error('/api/ai/analyze error', error);
    res.status(500).json({ error: 'Erro ao analisar progresso.', details: String(error.message || error) });
  }
});

router.post('/quiz', auth, async (req, res) => {
  try {
    const quiz = await generateQuiz({ userId: req.user.id, options: req.body || {} });
    res.json({ quiz });
  } catch (error) {
    console.error('/api/ai/quiz error', error);
    res.status(500).json({ error: 'Erro ao gerar quiz.', details: String(error.message || error) });
  }
});

router.post('/exercises', auth, async (req, res) => {
  try {
    const exercises = await generateExercises({ userId: req.user.id, options: req.body || {} });
    res.json({ exercises });
  } catch (error) {
    console.error('/api/ai/exercises error', error);
    res.status(500).json({ error: 'Erro ao gerar exercicios.', details: String(error.message || error) });
  }
});

router.post('/upload', (req, res) => {
  if (!multerAvailable) {
    return res.status(503).json({ error: 'Upload unavailable: multer not installed. Run `npm install multer` in backend.' });
  }

  return upload.single('file')(req, res, async (error) => {
    if (error) return res.status(400).json({ error: String(error) });
    try {
      if (!req.file) return res.status(400).json({ error: 'Arquivo nao enviado.' });
      const userId = req.user ? req.user.id : null;
      const [result] = await pool.execute(
        'INSERT INTO ai_documents (user_id, filename, path, status, created_at) VALUES (?, ?, ?, ?, NOW())',
        [userId, req.file.originalname, req.file.path, 'pending']
      );
      res.json({ ok: true, documentId: result.insertId, filename: req.file.originalname });
    } catch (saveError) {
      console.error('Erro em /api/ai/upload', saveError);
      res.status(500).json({ error: 'Erro ao salvar arquivo.' });
    }
  });
});

router.post('/chat', async (req, res) => {
  try {
    const { question, top_k = 5 } = req.body || {};
    if (!question) return res.status(400).json({ error: 'Pergunta obrigatoria.' });

    const pyBase = process.env.PY_SERVICE_URL || 'http://127.0.0.1:5000';
    const searchResp = await Promise.race([
      fetch(`${pyBase}/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: question, k: top_k }),
        timeout: 30000
      }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Timeout ao buscar contextos (30s). Tente novamente.')), 30000)
      )
    ]);

    if (!searchResp.ok) {
      const txt = await searchResp.text();
      throw new Error(`Busca falhou: ${txt}`);
    }

    const searchData = await searchResp.json();
    const contexts = (searchData.results || [])
      .map((item) => `Source: ${item?.meta?.source || 'documento'}\n${item.text}`)
      .join('\n\n');

    const answer = await callHuggingFaceChat([
      {
        role: 'system',
        content: 'Voce e um assistente didatico. Usa os contextos fornecidos quando forem relevantes e deixa isso claro na resposta.'
      },
      {
        role: 'user',
        content: `Contextos:\n${contexts || 'Sem contexto recuperado.'}\n\nPergunta: ${question}`
      }
    ], { maxTokens: 700, temperature: 0.2 });

    try {
      await pool.execute(
        'INSERT INTO ai_chats (user_id, question, answer, created_at) VALUES (?, ?, ?, NOW())',
        [req.user ? req.user.id : null, question, answer]
      );
    } catch (dbError) {
      console.warn('Nao foi possivel salvar chat', dbError);
    }

    res.json({ answer, sources: searchData.results || [] });
  } catch (error) {
    console.error('/api/ai/chat error', error);
    res.status(500).json({ error: 'Erro ao processar pergunta', details: String(error.message || error) });
  }
});

router.post('/create-event', auth, async (req, res) => {
  try {
    const { message } = req.body || {};
    if (!message) return res.status(400).json({ error: 'Mensagem obrigatoria.' });

    const result = await createEventFromMessage({ userId: req.user.id, message });
    
    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.json({ 
      success: true, 
      message: `Evento "${result.title}" marcado para ${new Date(result.start_iso).toLocaleString('pt-PT')}`,
      event: result 
    });
  } catch (error) {
    console.error('/api/ai/create-event error', error);
    res.status(500).json({ error: 'Erro ao criar evento', details: String(error.message || error) });
  }
});

module.exports = router;
