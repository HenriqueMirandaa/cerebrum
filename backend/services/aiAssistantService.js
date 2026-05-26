const fetch = require('node-fetch');
const pool = require('../config/database');

const HF_API_URL = 'https://router.huggingface.co/v1/chat/completions';
const DEFAULT_MODEL = process.env.HF_MODEL || 'openai/gpt-oss-120b:cheapest';
const DEFAULT_MAX_TOKENS = Number(process.env.HF_MAX_TOKENS || 900);
const DEFAULT_TEMPERATURE = Number(process.env.HF_TEMPERATURE || 0.2);
const PROVIDER_STATUS_TTL_MS = 5 * 60 * 1000;
const API_TIMEOUT_MS = Number(process.env.HF_API_TIMEOUT || 60000); // 60s default
const MAX_RETRIES = Number(process.env.HF_MAX_RETRIES || 2); // Retry failed requests
const RETRY_DELAY_MS = 1000; // 1 second between retries
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

    // Tentar com backticks JSON
    const fencedMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fencedMatch && fencedMatch[1]) {
        const parsed = safeJsonParse(fencedMatch[1].trim());
        if (parsed && typeof parsed === 'object') return parsed;
    }

    // Tentar com backticks sem language
    const simpleFenced = raw.match(/```([\s\S]*?)```/);
    if (simpleFenced && simpleFenced[1]) {
        const parsed = safeJsonParse(simpleFenced[1].trim());
        if (parsed && typeof parsed === 'object') return parsed;
    }

    // Procurar JSON entre chaves
    const firstBrace = raw.indexOf('{');
    const lastBrace = raw.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace > firstBrace) {
        const candidate = raw.slice(firstBrace, lastBrace + 1);
        const parsed = safeJsonParse(candidate);
        if (parsed && typeof parsed === 'object') return parsed;
    }

    // Procurar arrays JSON (para casos específicos)
    const firstBracket = raw.indexOf('[');
    const lastBracket = raw.lastIndexOf(']');
    if (firstBracket !== -1 && lastBracket > firstBracket) {
        const candidate = raw.slice(firstBracket, lastBracket + 1);
        const parsed = safeJsonParse(candidate);
        if (Array.isArray(parsed) && parsed.length > 0) {
            return { items: parsed }; // Envolver array em objeto
        }
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

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function callHuggingFaceChat(messages, options = {}) {
    const token = process.env.HF_TOKEN || process.env.HUGGINGFACE_API_KEY || process.env.HUGGINGFACEHUB_API_TOKEN;
    if (!token) {
        throw new Error('HF_TOKEN nao configurado no backend.');
    }

    let lastError = null;
    const maxRetries = options.maxRetries !== undefined ? options.maxRetries : MAX_RETRIES;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            const fetchPromise = fetch(HF_API_URL, {
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
                }),
                timeout: API_TIMEOUT_MS
            });

            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error(`Timeout na API da IA (${API_TIMEOUT_MS}ms). Tente novamente com uma pergunta mais simples.`)), API_TIMEOUT_MS)
            );

            const response = await Promise.race([fetchPromise, timeoutPromise]);

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
        } catch (error) {
            lastError = error;
            console.warn(`[ai] Tentativa ${attempt + 1}/${maxRetries + 1} falhou:`, error.message);
            
            // Não fazer retry em erros de configuração
            if (error.message.includes('HF_TOKEN')) {
                throw error;
            }

            // Esperar antes de tentar novamente
            if (attempt < maxRetries) {
                const delayMs = RETRY_DELAY_MS * Math.pow(2, attempt); // Exponential backoff
                await sleep(delayMs);
            }
        }
    }

    throw lastError || new Error('Falha ao conectar com a IA após múltiplas tentativas.');
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
        'Tu es o assistente academico do Cerebrum. Objetivo: ajudar o utilizador a estudar e a preparar-se para exames.',
        'Responde sempre em portugues europeu simples, direto e sem floreados.',
        'REGRAS ESSENCIAIS:',
        '1. Analisa CUIDADOSAMENTE o pedido do utilizador antes de responder.',
        '2. Se menciona datas de exame, use essas datas para contextualizar urgencia e planeamento.',
        '3. Se pede quiz, exercicios ou json: devolve APENAS JSON valido, sem texto extra.',
        '4. Nao repitas sempre a mesma resposta "posso ajudar com quiz ou recomendacoes".',
        '5. Nao inventes datas, percentagens, materias ou dados inexistentes.',
        '6. Se falta info critica, diz exatamente o que falta antes de responder.',
        '7. Quando o pedido peca clarificacao (ex: "exame de matematica"), oferece sugestoes concretas, nao genéricas.',
        '8. Prioriza as disciplinas mais urgentes (proximas de exame) nas sugestoes.'
    ].join(' ');
}

async function askForTextReply({ userId, message, extraInstruction = '' }) {
    const context = await getUserStudyContext(userId);
    
    // Detectar se o pedido menciona datas de exame
    const examinationDateMatch = message.match(/(\d{1,2})[\/\-\.]?(\d{1,2})[\/\-\.]?(\d{2,4})/);
    let dateHint = '';
    if (examinationDateMatch) {
        dateHint = `\n\nNota: O utilizador mencionou uma data de exame. Use-a para contextualizar o planeamento.`;
    }

    const messages = [
        { role: 'system', content: buildAssistantSystemPrompt() },
        {
            role: 'user',
            content: [
                extraInstruction ? `Instrucao adicional: ${extraInstruction}` : '',
                `Contexto do utilizador:\n${JSON.stringify(context, null, 2)}`,
                `Pedido do utilizador: ${message}${dateHint}`
            ].filter(Boolean).join('\n\n')
        }
    ];

    // Usar retry para text reply também
    return callHuggingFaceChat(messages, { maxTokens: 800, temperature: 0.3, maxRetries: 2 });
}

function sanitizeAssistantTextReply(text) {
    const raw = String(text || '').trim();
    if (!raw) return '';

    const withoutJsonFences = raw
        .replace(/```json[\s\S]*?```/gi, '')
        .replace(/```[\s\S]*?```/g, '')
        .trim();

    if (withoutJsonFences) return withoutJsonFences;

    const parsed = extractJsonBlock(raw);
    if (parsed && typeof parsed === 'object') return '';

    return raw;
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

function sanitizeExercisePayload(payload, fallback = {}) {
    const subject = normalizeText(payload?.subject || fallback.subject || 'Geral');
    const topic = normalizeText(payload?.topic || fallback.topic || 'revisao geral');
    const rawExercises = Array.isArray(payload?.exercises)
        ? payload.exercises
        : (Array.isArray(payload?.questions) ? payload.questions : []);

    const sanitizedExercises = rawExercises.slice(0, 10).map((exercise, index) => {
        const options = Array.isArray(exercise?.options)
            ? exercise.options.map((option) => truncate(option, 180)).filter(Boolean).slice(0, 4)
            : [];
        while (options.length < 4) {
            options.push(`Opcao ${options.length + 1}`);
        }

        let answerIndex = Number(exercise?.answerIndex);
        if (!Number.isInteger(answerIndex) || answerIndex < 0 || answerIndex >= options.length) {
            const answerText = normalizeText(exercise?.answer || '');
            const matchedIndex = answerText ? options.findIndex((option) => normalizeText(option) === answerText) : -1;
            answerIndex = matchedIndex >= 0 ? matchedIndex : 0;
        }

        return {
            id: normalizeText(exercise?.id) || `ex_${index + 1}`,
            prompt: truncate(exercise?.prompt || exercise?.question || `Exercicio ${index + 1} sobre ${topic}.`, 260),
            options,
            answerIndex,
            solution: truncate(exercise?.solution || exercise?.explanation || 'Revise a regra usada nesta derivada antes de comparar com a resolucao.', 320)
        };
    });

    return {
        title: normalizeText(payload?.title || `Exercicios de ${subject}`),
        subject,
        topic,
        questionCount: sanitizedExercises.length,
        exercises: sanitizedExercises
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
                'TAREFA: Gera um quiz pedagogico em JSON puro. Responde APENAS com JSON valido, nada mais.',
                'Formato obrigatorio (exato):',
                '{"title":"string","subject":"string","topic":"string","questions":[{"id":"q_1","prompt":"string","options":["a","b","c","d"],"answerIndex":0,"explanation":"string"}]}',
                '',
                'Regras OBRIGATORIAS:',
                '- exatamente 5 perguntas numeradas (q_1 ate q_5)',
                '- cada pergunta tem exatamente 4 opcoes',
                '- answerIndex e um numero entre 0-3 (a posicao correta)',
                '- explicacao e curta e precisa (max 150 chars)',
                '- usa o contexto do utilizador para escolher materia e topico',
                '- sem markdown, sem backticks, sem comentarios',
                '',
                `Preferencias do pedido:\n${JSON.stringify(quizBrief, null, 2)}`,
                `Contexto do utilizador:\n${JSON.stringify(context, null, 2)}`
            ].join('\n\n')
        }
    ];

    const raw = await callHuggingFaceChat(messages, { maxTokens: 1200, temperature: 0.2, maxRetries: 2 });
    const parsed = extractJsonBlock(raw);
    
    if (!parsed) {
        console.error('[generateQuiz] Resposta invalida:', raw.substring(0, 200));
        throw new Error('Nao foi possivel converter a resposta da IA em quiz estruturado. A resposta nao era JSON valido.');
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

async function generateExercises({ userId, options = {} }) {
    const context = await getUserStudyContext(userId);
    const requestedSubject = normalizeText(options.subjectName || options.subject || '');
    const requestedTopic = normalizeText(options.topic || '');
    const requestedCount = Math.max(3, Math.min(10, Number(options.questionCount || options.count || 6) || 6));
    const exerciseBrief = {
        requestedSubject,
        requestedTopic,
        requestedCount
    };

    const messages = [
        { role: 'system', content: buildAssistantSystemPrompt() },
        {
            role: 'user',
            content: [
                'TAREFA: Gera exercicios de escolha multipla em JSON puro. Responde APENAS com JSON valido, nada mais.',
                'Formato obrigatorio (exato):',
                '{"title":"string","subject":"string","topic":"string","exercises":[{"id":"ex_1","prompt":"string","options":["a","b","c","d"],"answerIndex":0,"solution":"string"}]}',
                '',
                'Regras OBRIGATORIAS:',
                `- exatamente ${requestedCount} exercicios`,
                '- cada exercicio tem exatamente 4 opcoes',
                '- answerIndex e um numero entre 0-3 (a posicao correta)',
                '- solution explica por que a resposta esta certa (max 200 chars)',
                '- usa um nivel apropriado para estudo individual',
                '- sem markdown, sem backticks, sem comentarios',
                '',
                `Preferencias do pedido:\n${JSON.stringify(exerciseBrief, null, 2)}`,
                `Contexto do utilizador:\n${JSON.stringify(context, null, 2)}`
            ].join('\n\n')
        }
    ];

    const raw = await callHuggingFaceChat(messages, { maxTokens: 1600, temperature: 0.2, maxRetries: 2 });
    const parsed = extractJsonBlock(raw);
    
    if (!parsed) {
        console.error('[generateExercises] Resposta invalida:', raw.substring(0, 200));
        throw new Error('Nao foi possivel converter a resposta da IA em exercicios estruturados. A resposta nao era JSON valido.');
    }

    const exercises = sanitizeExercisePayload(parsed, {
        subject: requestedSubject || context.subjects[0]?.name || 'Geral',
        topic: requestedTopic || 'revisao geral'
    });

    if (!exercises.exercises.length) {
        throw new Error('A IA devolveu exercicios vazios.');
    }

    return {
        id: `exercise_${Date.now()}`,
        createdAt: new Date().toISOString(),
        source: 'huggingface',
        ...exercises
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

function parseDateTimeForSQL(iso) {
    if (!iso) return null;
    const d = new Date(iso);
    if (isNaN(d.getTime())) return null;
    return d.toISOString().slice(0, 19).replace('T', ' ');
}

function normalizeMonthToken(value) {
    return String(value || '')
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
}

async function createEventFromMessage({ userId, message }) {
    const monthsMap = {
        janeiro: 1, fevereiro: 2, marco: 3, abril: 4, maio: 5, junho: 6,
        julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12,
        january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
        july: 7, august: 8, september: 9, october: 10, november: 11, december: 12
    };
    const rawMessage = normalizeText(message);
    const normalizedForDetection = rawMessage.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const isExamEvent = /(?:exame|prova|teste|avaliacao)/i.test(normalizedForDetection);
    const titleMatchNormalized = rawMessage.match(/(?:exame|prova|teste|avalia(?:c|ç)ao|reuni(?:a|ã)o|aula|trabalho|entrega)\s+(?:de|do|da)?\s+(.+?)(?=\s+no\s+dia|\s+dia\b|\s+em\b|\s+(?:a|as|at)\b|$)/i);
    const subjectLabelNormalized = titleMatchNormalized ? normalizeText(titleMatchNormalized[1]) : '';
    const normalizedTitle = subjectLabelNormalized ? (isExamEvent ? `Exame de ${subjectLabelNormalized}` : subjectLabelNormalized) : (isExamEvent ? 'Exame' : 'Evento');

    let parsedStartDate = null;
    let parsedAllDay = false;

    const numericWithTime = rawMessage.match(/(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})\s+(?:Ã s|às|as|at)?\s*(\d{1,2})[:\.](\d{2})/i);
    if (numericWithTime) {
        const [, day, month, year, hour, min] = numericWithTime;
        const fullYear = year.length === 2 ? `20${year}` : year;
        parsedStartDate = new Date(`${fullYear}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:${min}:00Z`);
    }

    if (!parsedStartDate) {
        const wordsWithTime = rawMessage.match(/(\d{1,2})\s+de\s+(\w+)\s+(?:de\s+)?(\d{4})\s+(?:Ã s|às|as|at)?\s*(\d{1,2})[:\.](\d{2})/i);
        if (wordsWithTime) {
            const [, day, monthName, year, hour, min] = wordsWithTime;
            const monthNum = monthsMap[normalizeMonthToken(monthName)];
            if (monthNum) {
                parsedStartDate = new Date(`${year}-${String(monthNum).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:${min}:00Z`);
            }
        }
    }

    if (!parsedStartDate) {
        const numericDateOnly = rawMessage.match(/(?:no\s+dia|dia|em)?\s*(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})(?!\s*\d)/i);
        if (numericDateOnly) {
            const [, day, month, year] = numericDateOnly;
            const fullYear = year.length === 2 ? `20${year}` : year;
            parsedStartDate = new Date(`${fullYear}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T00:00:00Z`);
            parsedAllDay = true;
        }
    }

    if (!parsedStartDate) {
        const wordsDateOnly = rawMessage.match(/(\d{1,2})\s+de\s+(\w+)\s+(?:de\s+)?(\d{4})(?!\s*(?:[:\.]|\d))/i);
        if (wordsDateOnly) {
            const [, day, monthName, year] = wordsDateOnly;
            const monthNum = monthsMap[normalizeMonthToken(monthName)];
            if (monthNum) {
                parsedStartDate = new Date(`${year}-${String(monthNum).padStart(2, '0')}-${String(day).padStart(2, '0')}T00:00:00Z`);
                parsedAllDay = true;
            }
        }
    }

    if (!parsedStartDate) {
        const wordsDateCurrentYear = rawMessage.match(/(\d{1,2})\s+de\s+(\w+)(?!\s*(?:[:\.]|\d))/i);
        if (wordsDateCurrentYear) {
            const [, day, monthName] = wordsDateCurrentYear;
            const monthNum = monthsMap[normalizeMonthToken(monthName)];
            if (monthNum) {
                const now = new Date();
                let year = now.getFullYear();
                const thisYearDate = new Date(`${year}-${String(monthNum).padStart(2, '0')}-${String(day).padStart(2, '0')}T00:00:00Z`);
                if (thisYearDate < now) year++;
                parsedStartDate = new Date(`${year}-${String(monthNum).padStart(2, '0')}-${String(day).padStart(2, '0')}T00:00:00Z`);
                parsedAllDay = true;
            }
        }
    }

    if (parsedStartDate && !isNaN(parsedStartDate.getTime())) {
        const parsedEndDate = parsedAllDay
            ? new Date(parsedStartDate.getTime() + (24 * 60 * 60 * 1000) - 1000)
            : new Date(parsedStartDate.getTime() + (isExamEvent ? 3 : 1) * 60 * 60 * 1000);

        let linkedMateriaId = null;
        try {
            if (subjectLabelNormalized) {
                const [rows] = await pool.execute(
                    `SELECT s.id
                     FROM user_progress up
                     JOIN subjects s ON s.id = up.subject_id
                     WHERE up.user_id = ? AND LOWER(s.name) LIKE ?
                     ORDER BY CHAR_LENGTH(s.name) ASC
                     LIMIT 1`,
                    [userId, `%${subjectLabelNormalized.toLowerCase()}%`]
                );
                if (rows?.[0]) linkedMateriaId = rows[0].id;
            }
        } catch (lookupError) {
            console.warn('[ai] Erro ao buscar matéria para o evento:', lookupError.message || lookupError);
        }

        try {
            const startSQL = parseDateTimeForSQL(parsedStartDate.toISOString());
            const endSQL = parseDateTimeForSQL(parsedEndDate.toISOString());
            const [insertResult] = await pool.execute(
                'INSERT INTO events (user_id, title, materia_id, start_iso, end_iso, all_day, color, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, NOW())',
                [userId, normalizedTitle, linkedMateriaId, startSQL, endSQL, parsedAllDay ? 1 : 0]
            );

            return {
                success: true,
                eventId: insertResult.insertId,
                title: normalizedTitle,
                start_iso: parsedStartDate.toISOString(),
                end_iso: parsedEndDate.toISOString(),
                materia_id: linkedMateriaId,
                all_day: parsedAllDay
            };
        } catch (insertError) {
            console.error('[ai] Erro ao criar evento:', insertError.message || insertError);
            return { success: false, error: 'Erro ao salvar evento no banco de dados.' };
        }
    }
    // Detecta padrões como:
    // "exame de matemática B no dia 23 de junho as 9:30"
    // "prova de física em 15/06/26 às 14:00"
    // "reunião no dia 25 de maio às 10:00"
    
    const datePatterns = [
        // DD/MM/YYYY HH:MM
        /(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})\s+(?:às|at)?\s*(\d{1,2})[:\.](\d{2})/i,
        // DD de mês de YYYY HH:MM
        /(\d{1,2})\s+de\s+(\w+)\s+(?:de\s+)?(\d{4})\s+(?:às|at)?\s*(\d{1,2})[:\.](\d{2})/i,
        // DD de mês às HH:MM (assume ano corrente/próximo)
        /(\d{1,2})\s+de\s+(\w+)\s+(?:às|at)?\s*(\d{1,2})[:\.](\d{2})/i,
    ];

    const months = {
        'janeiro': 1, 'fevereiro': 2, 'março': 3, 'abril': 4, 'maio': 5, 'junho': 6,
        'julho': 7, 'agosto': 8, 'setembro': 9, 'outubro': 10, 'novembro': 11, 'dezembro': 12,
        'january': 1, 'february': 2, 'march': 3, 'april': 4, 'may': 5, 'june': 6,
        'july': 7, 'august': 8, 'september': 9, 'october': 10, 'november': 11, 'december': 12,
    };

    const titleMatch = message.match(/(?:exame|prova|teste|avaliação|reunião|aula|trabalho|entrega)\s+(?:de|do|da)?\s+([^n]+?)(?:\s+no\s+dia|\s+em|\s+às|at|$)/i);
    const title = titleMatch ? titleMatch[1].trim() : 'Evento';

    let startDate = null;
    let endDate = null;

    // Tentar pattern 1: DD/MM/YYYY HH:MM
    const match1 = message.match(/(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})\s+(?:às|at)?\s*(\d{1,2})[:\.](\d{2})/i);
    if (match1) {
        const [, day, month, year, hour, min] = match1;
        const y = year.length === 2 ? `20${year}` : year;
        const dateStr = `${y}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:${min}:00Z`;
        startDate = new Date(dateStr);
    }

    // Tentar pattern 2: DD de mês de YYYY HH:MM
    if (!startDate) {
        const match2 = message.match(/(\d{1,2})\s+de\s+(\w+)\s+(?:de\s+)?(\d{4})\s+(?:às|at)?\s*(\d{1,2})[:\.](\d{2})/i);
        if (match2) {
            const [, day, monthName, year, hour, min] = match2;
            const monthNum = months[monthName.toLowerCase()];
            if (monthNum) {
                const dateStr = `${year}-${String(monthNum).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:${min}:00Z`;
                startDate = new Date(dateStr);
            }
        }
    }

    // Tentar pattern 3: DD de mês às HH:MM (ano corrente)
    if (!startDate) {
        const match3 = message.match(/(\d{1,2})\s+de\s+(\w+)\s+(?:às|at)?\s*(\d{1,2})[:\.](\d{2})/i);
        if (match3) {
            const [, day, monthName, hour, min] = match3;
            const monthNum = months[monthName.toLowerCase()];
            if (monthNum) {
                const now = new Date();
                let year = now.getFullYear();
                // Se a data já passou este ano, assume próximo ano
                const testDate = new Date(`${year}-${String(monthNum).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
                if (testDate < now) year++;
                
                const dateStr = `${year}-${String(monthNum).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:${min}:00Z`;
                startDate = new Date(dateStr);
            }
        }
    }

    if (!startDate || isNaN(startDate.getTime())) {
        return { success: false, error: 'Não consegui extrair a data e hora da mensagem.' };
    }

    // Assumir duração de 3 horas para exames, 1 hora para outros
    const durationHours = message.match(/exame|prova/i) ? 3 : 1;
    endDate = new Date(startDate.getTime() + durationHours * 60 * 60 * 1000);

    // Detectar matéria/disciplina
    let materiId = null;
    try {
        const subjectMatch = message.match(/(?:de|do|da)\s+([^n]+?)(?:\s+no\s+dia|\s+em|\s+às|$)/i);
        if (subjectMatch) {
            const subjectName = subjectMatch[1].trim().toLowerCase();
            const [[row]] = await pool.execute(
                'SELECT id FROM materias WHERE user_id = ? AND LOWER(name) LIKE ?',
                [userId, `%${subjectName}%`]
            );
            if (row) materiId = row.id;
        }
    } catch (err) {
        console.warn('[ai] Erro ao buscar matéria:', err.message);
    }

    // Inserir evento
    try {
        const startISO = parseDateTimeForSQL(startDate.toISOString());
        const endISO = parseDateTimeForSQL(endDate.toISOString());

        const [result] = await pool.execute(
            'INSERT INTO events (user_id, title, materia_id, start_iso, end_iso, all_day, color, notes, created_at) VALUES (?, ?, ?, ?, ?, 0, NULL, NULL, NOW())',
            [userId, title, materiId, startISO, endISO]
        );

        return {
            success: true,
            eventId: result.insertId,
            title,
            start_iso: startDate.toISOString(),
            end_iso: endDate.toISOString(),
            materia_id: materiId
        };
    } catch (err) {
        console.error('[ai] Erro ao criar evento:', err.message);
        return { success: false, error: 'Erro ao salvar evento no banco de dados.' };
    }
}

module.exports = {
    callHuggingFaceChat,
    getProviderStatus,
    getUserStudyContext,
    askForTextReply,
    sanitizeAssistantTextReply,
    generateQuiz,
    generateExercises,
    generateRecommendations,
    analyzeProgress,
    createEventFromMessage
};
