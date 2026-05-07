const fetch = require('node-fetch');
const pool = require('../config/database');

const HF_API_URL = 'https://router.huggingface.co/v1/chat/completions';
const DEFAULT_MODEL = process.env.HF_MODEL || 'openai/gpt-oss-120b:cheapest';
const DEFAULT_MAX_TOKENS = Number(process.env.HF_MAX_TOKENS || 900);
const DEFAULT_TEMPERATURE = Number(process.env.HF_TEMPERATURE || 0.2);
const PROVIDER_STATUS_TTL_MS = 5 * 60 * 1000;
let providerStatusCache = null;

function normalizeText(value) {
    return String(value || '').trim();
}

function safeJsonParse(value, fallback = null) {
    if (!value) return fallback;
    if (typeof value === 'object') return value;
    try {
        return JSON.parse(value);
    } catch (error) {
        return fallback;
    }
}

function extractJsonBlock(text) {
    const raw = normalizeText(text);
    if (!raw) return null;

    const fencedMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fencedMatch && fencedMatch[1]) {
        const parsed = safeJsonParse(fencedMatch[1].trim());
        if (parsed) return parsed;
    }

    const firstBrace = raw.indexOf('{');
    const lastBrace = raw.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace > firstBrace) {
        const parsed = safeJsonParse(raw.slice(firstBrace, lastBrace + 1));
        if (parsed) return parsed;
    }

    return null;
}

function truncate(value, max = 1200) {
    const text = normalizeText(value);
    if (text.length <= max) return text;
    return `${text.slice(0, max - 3)}...`;
}

function formatDateOnly(dateValue) {
    if (!dateValue) return null;
    const date = new Date(dateValue);
    if (Number.isNaN(date.getTime())) return null;
    return date.toISOString().slice(0, 10);
}

function daysUntil(dateValue) {
    const date = new Date(dateValue);
    if (Number.isNaN(date.getTime())) return null;
    const now = new Date();
    const diffMs = date.getTime() - now.getTime();
    return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

function asNumber(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

async function callHuggingFaceChat(messages, options = {}) {
    const token = process.env.HF_TOKEN || process.env.HUGGINGFACE_API_KEY || process.env.HUGGINGFACEHUB_API_TOKEN;
    if (!token) {
        throw new Error('HF_TOKEN nao configurado no backend.');
    }

    const response = await fetch(HF_API_URL, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            model: options.model || DEFAULT_MODEL,
            messages,
            temperature: typeof options.temperature === 'number' ? options.temperature : DEFAULT_TEMPERATURE,
            max_tokens: Number(options.maxTokens || DEFAULT_MAX_TOKENS),
            stream: false
        })
    });

    const rawText = await response.text();
    let payload = {};
    try {
        payload = rawText ? JSON.parse(rawText) : {};
    } catch (error) {
        payload = { raw: rawText };
    }

    if (!response.ok) {
        const reason = payload?.error?.message || payload?.error || payload?.message || rawText || `HTTP ${response.status}`;
        throw new Error(`Hugging Face retornou erro: ${reason}`);
    }

    const text =
        payload?.choices?.[0]?.message?.content
        || payload?.choices?.[0]?.text
        || payload?.generated_text
        || '';

    if (!normalizeText(text)) {
        throw new Error('A IA nao devolveu conteudo utilizavel.');
    }

    return text;
}

async function getProviderStatus({ forceRefresh = false } = {}) {
    const now = Date.now();
    if (!forceRefresh && providerStatusCache && (now - providerStatusCache.cachedAt) < PROVIDER_STATUS_TTL_MS) {
        return providerStatusCache.payload;
    }

    const token = process.env.HF_TOKEN || process.env.HUGGINGFACE_API_KEY || process.env.HUGGINGFACEHUB_API_TOKEN;
    if (!token) {
        const payload = {
            available: false,
            provider: 'huggingface',
            model: DEFAULT_MODEL,
            checked_at: new Date().toISOString(),
            reason: 'HF_TOKEN ausente'
        };
        providerStatusCache = { cachedAt: now, payload };
        return payload;
    }

    const startedAt = Date.now();
    try {
        const reply = await callHuggingFaceChat([
            { role: 'system', content: 'Answer with exactly one word: ok' },
            { role: 'user', content: 'ping' }
        ], {
            maxTokens: 8,
            temperature: 0,
            model: DEFAULT_MODEL
        });

        const payload = {
            available: true,
            provider: 'huggingface',
            model: DEFAULT_MODEL,
            checked_at: new Date().toISOString(),
            latency_ms: Date.now() - startedAt,
            response_preview: truncate(reply, 40)
        };
        providerStatusCache = { cachedAt: now, payload };
        return payload;
    } catch (error) {
        const payload = {
            available: false,
            provider: 'huggingface',
            model: DEFAULT_MODEL,
            checked_at: new Date().toISOString(),
            latency_ms: Date.now() - startedAt,
            reason: String(error.message || error)
        };
        providerStatusCache = { cachedAt: now, payload };
        return payload;
    }
}

async function getUserStudyContext(userId) {
    const [subjectRows] = await pool.execute(
        `SELECT s.id, s.name, s.description, up.hours_studied, up.last_studied, up.progress
         FROM user_progress up
         JOIN subjects s ON up.subject_id = s.id
         WHERE up.user_id = ?
         ORDER BY up.last_studied DESC, s.name ASC`,
        [userId]
    );

    const subjectIds = subjectRows.map((row) => row.id);
    const latestMetaBySubject = {};
    const sessionsBySubject = {};
    const upcomingEvents = [];

    if (subjectIds.length > 0) {
        const placeholders = subjectIds.map(() => '?').join(',');

        try {
            const [metaRows] = await pool.execute(
                `SELECT meta
                 FROM activity_logs
                 WHERE user_id = ?
                   AND type = 'subject_meta'
                   AND JSON_EXTRACT(meta, '$.subject_id') IN (${placeholders})
                 ORDER BY created_at DESC`,
                [userId, ...subjectIds]
            );

            for (const row of metaRows) {
                const parsed = safeJsonParse(row.meta, {});
                const subjectId = String(parsed?.subject_id || '');
                if (subjectId && !latestMetaBySubject[subjectId]) {
                    latestMetaBySubject[subjectId] = parsed;
                }
            }
        } catch (error) {
            console.warn('[ai] Falha ao carregar metadata das materias:', error.message || error);
        }

        try {
            const [sessionRows] = await pool.execute(
                `SELECT description, meta, created_at
                 FROM activity_logs
                 WHERE user_id = ?
                   AND type = 'study_session'
                   AND JSON_EXTRACT(meta, '$.subject_id') IN (${placeholders})
                 ORDER BY created_at DESC`,
                [userId, ...subjectIds]
            );

            for (const row of sessionRows) {
                const parsed = safeJsonParse(row.meta, {});
                const subjectId = String(parsed?.subject_id || '');
                if (!subjectId) continue;
                if (!sessionsBySubject[subjectId]) sessionsBySubject[subjectId] = [];
                if (sessionsBySubject[subjectId].length >= 4) continue;
                sessionsBySubject[subjectId].push({
                    topics: truncate(parsed?.topics || row.description || '', 220),
                    hours: asNumber(parsed?.hours_increment, 0),
                    created_at: row.created_at || null
                });
            }
        } catch (error) {
            console.warn('[ai] Falha ao carregar sessoes de estudo:', error.message || error);
        }

        try {
            const [eventRows] = await pool.execute(
                `SELECT title, materia_id, start_iso, end_iso, notes
                 FROM events
                 WHERE user_id = ?
                   AND start_iso >= NOW()
                 ORDER BY start_iso ASC
                 LIMIT 8`,
                [userId]
            );
            for (const row of eventRows) {
                upcomingEvents.push({
                    title: row.title,
                    subject_id: row.materia_id,
                    start_iso: row.start_iso,
                    end_iso: row.end_iso,
                    notes: truncate(row.notes || '', 180)
                });
            }
        } catch (error) {
            console.warn('[ai] Falha ao carregar eventos do cronograma:', error.message || error);
        }
    }

    const subjects = subjectRows.map((row) => {
        const meta = latestMetaBySubject[String(row.id)] || {};
        const examDate = meta.exam_date || null;
        const totalHours = meta.total_hours != null ? asNumber(meta.total_hours, null) : null;
        const hoursStudied = asNumber(row.hours_studied, 0);
        return {
            id: row.id,
            name: row.name,
            description: truncate(row.description || '', 250),
            progress: asNumber(row.progress, 0),
            hours_studied: Number(hoursStudied.toFixed(2)),
            total_hours: totalHours,
            remaining_hours: totalHours != null ? Number(Math.max(totalHours - hoursStudied, 0).toFixed(2)) : null,
            exam_date: examDate,
            days_until_exam: examDate ? daysUntil(examDate) : null,
            goals: Array.isArray(meta.metas) ? meta.metas.slice(0, 6) : [],
            recent_sessions: sessionsBySubject[String(row.id)] || []
        };
    });

    const totalProgress = subjects.length
        ? Math.round(subjects.reduce((sum, subject) => sum + asNumber(subject.progress, 0), 0) / subjects.length)
        : 0;
    const urgentSubjects = subjects
        .filter((subject) => subject.days_until_exam != null)
        .sort((a, b) => a.days_until_exam - b.days_until_exam)
        .slice(0, 4)
        .map((subject) => ({
            name: subject.name,
            exam_date: subject.exam_date,
            days_until_exam: subject.days_until_exam,
            progress: subject.progress
        }));

    return {
        generated_at: new Date().toISOString(),
        summary: {
            subject_count: subjects.length,
            average_progress: totalProgress,
            urgent_subjects: urgentSubjects
        },
        subjects,
        upcoming_events: upcomingEvents
    };
}

function buildAssistantSystemPrompt() {
    return [
        'Tu es o assistente academico do Cerebrum.',
        'Responde sempre em portugues europeu simples e natural.',
        'Usa apenas informacao presente no contexto do utilizador e no pedido atual.',
        'Nao inventes datas, horas, progresso ou materias inexistentes.',
        'Se faltar informacao critica, diz exatamente o que falta.',
        'Quando sugerires estudo, da prioridades concretas, curtas e acionaveis.',
        'Quando o pedido for para quiz ou estrutura JSON, devolve apenas JSON valido.'
    ].join(' ');
}

async function askForTextReply({ userId, message, extraInstruction = '' }) {
    const context = await getUserStudyContext(userId);
    const messages = [
        { role: 'system', content: buildAssistantSystemPrompt() },
        {
            role: 'user',
            content: [
                extraInstruction ? `Instrucao adicional: ${extraInstruction}` : '',
                `Contexto do utilizador:\n${JSON.stringify(context, null, 2)}`,
                `Pedido do utilizador: ${message}`
            ].filter(Boolean).join('\n\n')
        }
    ];

    return callHuggingFaceChat(messages, { maxTokens: 750, temperature: 0.25 });
}

function sanitizeQuizPayload(payload, fallback = {}) {
    const subject = normalizeText(payload?.subject || fallback.subject || 'Geral');
    const topic = normalizeText(payload?.topic || fallback.topic || 'revisao geral');
    const rawQuestions = Array.isArray(payload?.questions) ? payload.questions : [];
    const sanitizedQuestions = rawQuestions.slice(0, 8).map((question, index) => {
        const options = Array.isArray(question?.options)
            ? question.options.map((option) => truncate(option, 180)).filter(Boolean).slice(0, 4)
            : [];
        while (options.length < 4) {
            options.push(`Opcao ${options.length + 1}`);
        }

        let answerIndex = Number(question?.answerIndex);
        if (!Number.isInteger(answerIndex) || answerIndex < 0 || answerIndex >= options.length) {
            answerIndex = 0;
        }

        return {
            id: normalizeText(question?.id) || `q_${index + 1}`,
            prompt: truncate(question?.prompt || `Pergunta ${index + 1} sobre ${topic}.`, 260),
            options,
            answerIndex,
            explanation: truncate(question?.explanation || 'Revise o conceito central deste tema.', 260)
        };
    });

    return {
        title: normalizeText(payload?.title || `Quiz de ${subject}`),
        subject,
        topic,
        questionCount: sanitizedQuestions.length,
        questions: sanitizedQuestions
    };
}

async function generateQuiz({ userId, options = {} }) {
    const context = await getUserStudyContext(userId);
    const requestedSubject = normalizeText(options.subjectName || options.subject || '');
    const requestedTopic = normalizeText(options.topic || '');
    const quizBrief = {
        requestedSubject,
        requestedTopic,
        random: Boolean(options.random)
    };

    const messages = [
        { role: 'system', content: buildAssistantSystemPrompt() },
        {
            role: 'user',
            content: [
                'Gera um quiz pedagogico em JSON puro.',
                'Formato obrigatorio:',
                '{"title":"string","subject":"string","topic":"string","questions":[{"id":"q_1","prompt":"string","options":["a","b","c","d"],"answerIndex":0,"explanation":"string"}]}',
                'Regras:',
                '- exatamente 5 perguntas',
                '- 4 opcoes por pergunta',
                '- apenas uma opcao correta',
                '- explicacao curta e precisa',
                '- usa o contexto do utilizador para escolher materia e foco',
                `Preferencias do pedido:\n${JSON.stringify(quizBrief, null, 2)}`,
                `Contexto do utilizador:\n${JSON.stringify(context, null, 2)}`
            ].join('\n\n')
        }
    ];

    const raw = await callHuggingFaceChat(messages, { maxTokens: 1200, temperature: 0.3 });
    const parsed = extractJsonBlock(raw);
    if (!parsed) {
        throw new Error('Nao foi possivel converter a resposta da IA em quiz estruturado.');
    }

    const quiz = sanitizeQuizPayload(parsed, {
        subject: requestedSubject || context.subjects[0]?.name || 'Geral',
        topic: requestedTopic || 'revisao geral'
    });

    if (!quiz.questions.length) {
        throw new Error('A IA devolveu um quiz vazio.');
    }

    return {
        id: `quiz_${Date.now()}`,
        createdAt: new Date().toISOString(),
        source: 'huggingface',
        ...quiz
    };
}

async function generateRecommendations({ userId, focus = 'today' }) {
    const text = await askForTextReply({
        userId,
        message: `Quero recomendacoes de estudo com foco em "${focus}".`,
        extraInstruction: 'Devolve entre 3 e 5 recomendacoes. Cada uma deve comecar com um titulo curto seguido de dois pontos.'
    });

    const items = text
        .split(/\n+/)
        .map((line) => normalizeText(line))
        .filter(Boolean)
        .slice(0, 5)
        .map((line, index) => {
            const separator = line.indexOf(':');
            if (separator > 0) {
                return {
                    title: line.slice(0, separator).trim(),
                    message: line.slice(separator + 1).trim() || line.trim()
                };
            }
            return {
                title: `Sugestao ${index + 1}`,
                message: line
            };
        });

    return items.length ? items : [{ title: 'Sugestao', message: text }];
}

async function analyzeProgress({ userId }) {
    const text = await askForTextReply({
        userId,
        message: 'Analisa o progresso geral do utilizador e sugere o proximo passo.',
        extraInstruction: 'Estrutura em 3 blocos curtos com os rotulos: Resumo:, Plano:, Proximo passo:.'
    });

    const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);
    const sections = { message: '', plan: '', next: '' };
    let currentKey = 'message';

    for (const line of lines) {
        const lower = line.toLowerCase();
        if (lower.startsWith('resumo:')) {
            currentKey = 'message';
            sections.message = line.slice(7).trim();
            continue;
        }
        if (lower.startsWith('plano:')) {
            currentKey = 'plan';
            sections.plan = line.slice(6).trim();
            continue;
        }
        if (lower.startsWith('proximo passo:') || lower.startsWith('próximo passo:')) {
            currentKey = 'next';
            sections.next = line.split(':').slice(1).join(':').trim();
            continue;
        }
        sections[currentKey] = normalizeText(`${sections[currentKey]} ${line}`);
    }

    return {
        message: sections.message || text,
        plan: sections.plan || 'Sem plano detalhado devolvido pela IA.',
        next: sections.next || 'Sem proximo passo claro devolvido pela IA.'
    };
}

module.exports = {
    callHuggingFaceChat,
    getProviderStatus,
    getUserStudyContext,
    askForTextReply,
    generateQuiz,
    generateRecommendations,
    analyzeProgress
};
