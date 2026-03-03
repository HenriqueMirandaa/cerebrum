import * as db from './data.js';
import api from './api.js';
import { formatHours } from './utils/helpers.js';

// IA local, totalmente client-side. Sem chaves, sem rede.
// Objetivo: ajudar nos estudos com uma conversa mais natural.

const chatState = {
    awaitingSubjectName: false,
    lastSubjectId: null
};

async function safeGetSubjects() {
    try { return await db.getSubjects(); } catch (e) { return []; }
}

async function safeGetSessions() {
    try { return await db.getSessions(); } catch (e) { return []; }
}

function normalizeText(value) {
    return String(value || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function includesAny(text, terms) {
    return terms.some((term) => text.includes(term));
}

function toIsoDate(rawDate) {
    if (!rawDate) return null;

    const isoMatch = rawDate.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
    if (isoMatch) return isoMatch[0];

    const brMatch = rawDate.match(/\b(\d{2})\/(\d{2})\/(\d{4})\b/);
    if (brMatch) {
        const [, dd, mm, yyyy] = brMatch;
        return `${yyyy}-${mm}-${dd}`;
    }

    const brShortYearMatch = rawDate.match(/\b(\d{2})\/(\d{2})\/(\d{2})\b/);
    if (brShortYearMatch) {
        const [, dd, mm, yy] = brShortYearMatch;
        const yearNum = Number(yy);
        const fullYear = yearNum >= 70 ? 1900 + yearNum : 2000 + yearNum;
        return `${String(fullYear)}-${mm}-${dd}`;
    }

    return null;
}

function extractHours(rawText) {
    if (!rawText) return null;
    const match = rawText.match(/\b(\d+(?:[.,]\d+)?)\s*(h|hora|horas)\b/i);
    if (!match) return null;
    return Number(match[1].replace(',', '.'));
}

function parseDurationToHours(rawText) {
    const text = String(rawText || '');
    if (!text) return null;

    const full = text.match(/(\d+(?:[.,]\d+)?)\s*(?:h|hora|horas)\s*(?:e\s*)?(\d{1,2})?\s*(?:m|min|mins|minuto|minutos)?/i);
    if (full) {
        const h = Number(full[1].replace(',', '.'));
        const m = full[2] ? Number(full[2]) : 0;
        return h + (Math.max(0, Math.min(59, m)) / 60);
    }

    const compact = text.match(/(\d{1,2})\s*h\s*(\d{1,2})\s*min/i);
    if (compact) {
        const h = Number(compact[1]);
        const m = Number(compact[2]);
        return h + (Math.max(0, Math.min(59, m)) / 60);
    }

    const onlyMinutes = text.match(/(\d{1,3})\s*(?:m|min|mins|minuto|minutos)\b/i);
    if (onlyMinutes) {
        return Number(onlyMinutes[1]) / 60;
    }

    return null;
}

function extractTargetLoadHours(rawText) {
    const text = String(rawText || '');
    if (!text) return null;

    const loadMatch = text.match(
        /\b(?:carga\s*horaria|carga|total\s*de\s*estudo|quero\s*(?:uma\s*)?carga)\s*(?:de|:)?\s*([^\n,.!;]{1,40})/i
    );
    if (loadMatch) {
        const parsed = parseDurationToHours(loadMatch[1]);
        if (parsed) return parsed;
    }

    const totalMatch = text.match(/\b(?:total|somando)\s*(?:de|:)?\s*([^\n,.!;]{1,35})\s*(?:de\s*estudo)?/i);
    if (totalMatch) {
        const parsed = parseDurationToHours(totalMatch[1]);
        if (parsed) return parsed;
    }

    return null;
}

function cleanExtractedName(value) {
    if (!value) return '';
    return String(value)
        .replace(/\s+(com|para|prova|exame|em|dia|na|no)\b.*$/i, '')
        .replace(/[.,;:!?]+$/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function extractSubjectName(rawText) {
    if (!rawText) return '';

    const quoted = rawText.match(/["']([^"']{2,80})["']/);
    if (quoted) return cleanExtractedName(quoted[1]);

    const afterKeyword = rawText.match(
        /\b(?:materia|disciplina|assunto)\s*(?:de|da|do|chamada|nomeada|nome|:|=)?\s*([a-zA-Z0-9\u00C0-\u017F _-]{2,80})/i
    );
    if (afterKeyword) return cleanExtractedName(afterKeyword[1]);

    const generic = rawText.match(/\b(?:adicionar|criar|incluir|registrar|cadastrar)\s+([a-zA-Z0-9\u00C0-\u017F _-]{2,80})/i);
    if (generic) return cleanExtractedName(generic[1]);

    const planFor = rawText.match(/\b(?:plano de estudo|plano)\s+para\s+([a-zA-Z0-9\u00C0-\u017F _-]{2,80})/i);
    if (planFor) return cleanExtractedName(planFor[1]);

    const examOf = rawText.match(/\b(?:exame|prova)\s+de\s+([a-zA-Z0-9\u00C0-\u017F _-]{2,80})/i);
    if (examOf) return cleanExtractedName(examOf[1]);

    return '';
}

function daysBetweenTodayAnd(isoDate) {
    if (!isoDate) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const exam = new Date(`${isoDate}T00:00:00`);
    const diff = Math.ceil((exam - today) / (1000 * 60 * 60 * 24));
    return diff;
}

function toTwoDecimals(value) {
    return Math.round(Number(value || 0) * 100) / 100;
}

function formatHoursWithMinutes(decimalHours) {
    const totalMinutes = Math.max(0, Math.round(Number(decimalHours || 0) * 60));
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${hours}h${minutes}min`;
}

const WEEKDAY_PATTERNS = [
    { key: 'segunda', regex: /\b(seg|segunda)\b/g },
    { key: 'terca', regex: /\b(ter|terca|terça)\b/g },
    { key: 'quarta', regex: /\b(qua|quarta)\b/g },
    { key: 'quinta', regex: /\b(qui|quinta)\b/g },
    { key: 'sexta', regex: /\b(sex|sexta)\b/g },
    { key: 'sabado', regex: /\b(sab|sabado|sábado)\b/g },
    { key: 'domingo', regex: /\b(dom|domingo)\b/g }
];

function parseAvailability(rawText) {
    const text = normalizeText(rawText);
    const dayHours = {};
    const dailyMatch = text.match(/((?:\d+(?:[.,]\d+)?\s*h(?:oras?)?(?:\s*e\s*\d{1,2}\s*(?:m|min|minutos)?)?)|(?:\d{1,2}\s*h\s*\d{1,2}\s*min))\s*(?:disponiveis?\s*)?(?:por dia|diari[oa]mente|todo dia)/i);
    const altDailyMatch = text.match(/((?:\d+(?:[.,]\d+)?\s*h(?:oras?)?(?:\s*e\s*\d{1,2}\s*(?:m|min|minutos)?)?)|(?:\d{1,2}\s*h\s*\d{1,2}\s*min))\s*(?:disponiveis?\s*)?(?:por|em)\s*\d+\s*dias?\s*(?:por semana|da semana|na semana)/i);
    const dailyHours = dailyMatch ? parseDurationToHours(dailyMatch[1]) : (altDailyMatch ? parseDurationToHours(altDailyMatch[1]) : null);
    const weeklyDaysMatch = text.match(/(\d+)\s*dias?\s*(?:por semana|na semana)/i);
    const daysPerWeek = weeklyDaysMatch ? Math.max(1, Math.min(7, Number(weeklyDaysMatch[1]))) : null;
    const weeklyHoursMatch = text.match(/((?:\d+(?:[.,]\d+)?\s*h(?:oras?)?(?:\s*e\s*\d{1,2}\s*(?:m|min|minutos)?)?)|(?:\d{1,2}\s*h\s*\d{1,2}\s*min))\s*(?:por semana|na semana)/i);
    const explicitWeeklyHours = weeklyHoursMatch ? parseDurationToHours(weeklyHoursMatch[1]) : null;

    const hourMentions = [];
    const hourRegex = /(\d+(?:[.,]\d+)?)\s*h(?:oras?)?/gi;
    let hm = hourRegex.exec(text);
    while (hm) {
        hourMentions.push({ value: Number(hm[1].replace(',', '.')), index: hm.index });
        hm = hourRegex.exec(text);
    }

    WEEKDAY_PATTERNS.forEach(({ key, regex }) => {
        regex.lastIndex = 0;
        let dm = regex.exec(text);
        while (dm) {
            const closest = hourMentions
                .map((h) => ({ h, distance: Math.abs(h.index - dm.index) }))
                .filter((x) => x.distance <= 36)
                .sort((a, b) => a.distance - b.distance)[0];

            if (closest) {
                dayHours[key] = closest.h.value;
            }
            dm = regex.exec(text);
        }
    });

    const weeklyFromWeekdays = Object.values(dayHours).reduce((acc, value) => acc + Number(value || 0), 0);
    const weeklyHours = explicitWeeklyHours
        || (dailyHours && daysPerWeek ? dailyHours * daysPerWeek : null)
        || (dailyHours ? dailyHours * 7 : null)
        || (weeklyFromWeekdays > 0 ? weeklyFromWeekdays : null);

    return { dailyHours, dayHours, weeklyHours, daysPerWeek, explicitWeeklyHours };
}

function getDefaultHoursByTimeWindow(daysLeft) {
    if (daysLeft <= 10) return 16;
    if (daysLeft <= 20) return 24;
    if (daysLeft <= 45) return 32;
    return 40;
}

function buildAvailabilityLines(availability) {
    if (!availability) return [];
    const lines = [];
    if (availability.dailyHours && availability.daysPerWeek) {
        lines.push(`- Disponibilidade declarada: ${formatHoursWithMinutes(availability.dailyHours)} por dia por ${availability.daysPerWeek} dias/semana (~${formatHoursWithMinutes(availability.dailyHours * availability.daysPerWeek)} por semana)`);
    } else if (availability.dailyHours) {
        lines.push(`- Disponibilidade declarada: ${formatHoursWithMinutes(availability.dailyHours)} por dia (~${formatHoursWithMinutes(availability.dailyHours * 7)} por semana)`);
    } else if (availability.explicitWeeklyHours) {
        lines.push(`- Disponibilidade declarada: ~${formatHoursWithMinutes(availability.explicitWeeklyHours)} por semana`);
    } else if (availability.weeklyHours) {
        lines.push(`- Disponibilidade declarada: ~${formatHoursWithMinutes(availability.weeklyHours)} por semana`);
    }

    const dayEntries = Object.entries(availability.dayHours || {});
    if (dayEntries.length) {
        const formatted = dayEntries.map(([day, hours]) => `${day} ${formatHoursWithMinutes(hours)}`).join(', ');
        lines.push(`- Dias informados: ${formatted}`);
    }
    return lines;
}

function buildPlanText({ subjectName, examDate, daysLeft, totalHours, availability, capacityUntilExam }) {
    const safeDays = Math.max(daysLeft, 1);
    const safeHours = Math.max(toTwoDecimals(totalHours || 0), 1);
    const dailyHours = toTwoDecimals(safeHours / safeDays);
    const weeklyHours = toTwoDecimals(dailyHours * 7);
    const baseSessionsPerWeek = availability?.daysPerWeek || 7;
    const sessionMinutes = Math.max(30, Math.round((weeklyHours / baseSessionsPerWeek) * 60));
    const reviewPercent = 0.2;
    const practicePercent = 0.5;
    const theoryPercent = 0.3;

    const theoryHours = toTwoDecimals(safeHours * theoryPercent);
    const practiceHours = toTwoDecimals(safeHours * practicePercent);
    const reviewHours = toTwoDecimals(safeHours * reviewPercent);

    const availabilityLines = buildAvailabilityLines(availability);

    const lines = [
        `Plano de estudo para ${subjectName}:`,
        `- Exame: ${examDate} (${daysLeft} dias restantes)`,
        `- Carga sugerida: ${formatHoursWithMinutes(safeHours)} ate o exame`,
        `- Ritmo diario: ~${formatHoursWithMinutes(dailyHours)} por dia`,
        `- Ritmo semanal: ~${formatHoursWithMinutes(weeklyHours)} por semana`
    ];

    if (availabilityLines.length) {
        lines.push(...availabilityLines);
    }

    if (typeof capacityUntilExam === 'number') {
        lines.push(`- Capacidade total ate o exame: ~${formatHoursWithMinutes(capacityUntilExam)}`);
    }

    lines.push(
        '',
        'Distribuicao recomendada:',
        `- Teoria: ${formatHoursWithMinutes(theoryHours)}`,
        `- Exercicios: ${formatHoursWithMinutes(practiceHours)}`,
        `- Revisao: ${formatHoursWithMinutes(reviewHours)}`,
        '',
        `Execucao pratica (semanal):`,
        `- ${baseSessionsPerWeek} sessoes por semana`,
        `- ${sessionMinutes} minutos por sessao`,
        '- 1 bloco final de revisao ativa + simulacao curta',
        '',
        'Se quiser, eu ajusto esse plano para o teu horario real (dias/horas disponiveis).'
    );

    return lines.join('\n');
}

function findMentionedSubject(rawText, subjects) {
    const normalizedInput = normalizeText(rawText);
    if (!normalizedInput) return null;

    for (const subject of subjects) {
        const name = subject?.name || subject?.nome || '';
        if (!name) continue;
        const normalizedName = normalizeText(name);
        if (normalizedName && normalizedInput.includes(normalizedName)) {
            return subject;
        }
    }

    return null;
}

function getGreetingReply() {
    return 'Ola! Posso te ajudar com plano de estudo, progresso, quiz ou cadastro de materia. Me diz o que voce precisa.';
}

function getCapabilityReply() {
    return [
        'Posso conversar de forma natural com voce sobre estudos.',
        'Exemplos:',
        '- "quero adicionar materia de fisica com 30 horas"',
        '- "como esta meu progresso?"',
        '- "me sugere o que estudar hoje"',
        '- "gera um quiz da materia de matematica"'
    ].join('\n');
}

async function addSubjectFromNaturalText(rawText, explicitName = '') {
    const name = cleanExtractedName(explicitName || extractSubjectName(rawText));
    if (!name) {
        chatState.awaitingSubjectName = true;
        return 'Perfeito. Qual e o nome da materia que voce quer adicionar?';
    }

    const totalHours = extractHours(rawText) || 0;
    const examDate = toIsoDate(rawText);
    const subject = {
        name,
        total_hours: totalHours,
        exam_date: examDate,
        color: null,
        icon: 'fas fa-book',
        progress: 0
    };

    const id = await db.addSubject(subject);
    chatState.awaitingSubjectName = false;
    chatState.lastSubjectId = id;

    const details = [];
    if (totalHours > 0) details.push(`${formatHoursWithMinutes(totalHours)} planejadas`);
    if (examDate) details.push(`prova em ${examDate}`);

    return `Materia adicionada com sucesso: ${name}${details.length ? ` (${details.join(', ')})` : ''}.`;
}

async function tryCreateExamEvent({ subjectName, examDate, subjectId }) {
    try {
        const start = new Date(`${examDate}T09:00:00`);
        const end = new Date(`${examDate}T10:00:00`);
        const payload = {
            title: `Exame de ${subjectName}`,
            materia_id: subjectId || null,
            start_iso: start.toISOString(),
            end_iso: end.toISOString(),
            all_day: 1,
            notes: 'Criado automaticamente pelo Assistente IA.'
        };
        await api.createEvent(payload);
        return { ok: true };
    } catch (error) {
        console.warn('Nao foi possivel criar evento de exame no cronograma', error);
        return { ok: false };
    }
}

const aiLocal = {
    // Adiciona uma materia localmente (IndexedDB)
    async addSubject({ name, total_hours = 0, exam_date = null, color = null, icon = 'fas fa-book' } = {}) {
        if (!name || !name.trim()) throw new Error('Nome da materia obrigatorio');
        const subj = { name: String(name).trim(), total_hours: Number(total_hours) || 0, exam_date: exam_date || null, color, icon, progress: 0 };
        try {
            const id = await db.addSubject(subj);
            subj.id = id;
            chatState.lastSubjectId = id;
            return subj;
        } catch (e) {
            console.error('addSubject failed', e);
            throw e;
        }
    },

    // Retorna lista de recomendacoes curtas
    async getRecommendations() {
        const subjects = await safeGetSubjects();
        if (!subjects.length) return [{ title: 'Sem materias', message: 'Adicione materias para receber recomendacoes.' }];

        const now = new Date();
        const scored = subjects.map((s) => {
            const progress = Number(s.progress || 0);
            let proximity = 0;
            if (s.exam_date) {
                const d = new Date(s.exam_date);
                const days = Math.max(0, Math.round((d - now) / (1000 * 60 * 60 * 24)));
                proximity = Math.max(0, 60 - days);
            }
            const score = (100 - progress) + proximity;
            return { s, score };
        }).sort((a, b) => b.score - a.score);

        const recs = scored.slice(0, 5).map((item) => ({
            title: `Estude: ${item.s.name}`,
            message: `Progresso: ${item.s.progress || 0}%. Sugestao: 25-50 minutos focados e revisao semanal.`
        }));

        recs.push({ title: 'Tecnica', message: 'Use Pomodoro: 25min foco + 5min pausa. A cada 4 ciclos, pausa longa.' });
        return recs;
    },

    // Retorna analise simples do progresso e plano de acao
    async analyzeProgress() {
        const subjects = await safeGetSubjects();
        const sessions = await safeGetSessions();
        const total = subjects.length;
        const avg = total ? Math.round(subjects.reduce((a, b) => a + Number(b.progress || 0), 0) / total) : 0;
        const completed = sessions.filter((s) => s.completed).length;

        const low = subjects.filter((s) => Number(s.progress || 0) < 50).map((s) => s.name).slice(0, 3);
        const next = sessions
            .filter((s) => !s.completed && new Date(s.start_time) > new Date())
            .sort((a, b) => new Date(a.start_time) - new Date(b.start_time))[0];

        const message = `Materias: ${total}. Progresso medio: ${avg}%. Sessoes completadas: ${completed}.` + (low.length ? ` Foque em: ${low.join(', ')}.` : '');
        const plan = 'Plano sugerido: 3 sessoes semanais de 45min nas materias prioritarias, com revisao curta no fim.';
        const nextInfo = next ? `Proxima sessao: ${next.name || next.subject_id} em ${new Date(next.start_time).toLocaleString()}.` : 'Sem proximas sessoes agendadas.';

        return { message, plan, next: nextInfo };
    },

    // Gera um mini-quiz (1 pergunta) para uma materia prioritaria
    async generateQuiz(targetSubjectName = null) {
        const subjects = await safeGetSubjects();
        if (!subjects.length) return { question: 'Sem materias para gerar quiz.', choices: [], answer: null };

        let target = null;
        if (targetSubjectName) {
            target = findMentionedSubject(targetSubjectName, subjects);
        }
        if (!target) {
            target = subjects.sort((a, b) => Number(a.progress || 0) - Number(b.progress || 0))[0];
        }

        const question = `Explique em 1-2 frases o conceito principal de ${target.name}.`;
        return { subject: target.name, question, hint: 'Resuma em poucas frases e foque nos pilares do assunto.' };
    },

    async getSubjectStatus(subjectNameText) {
        const subjects = await safeGetSubjects();
        if (!subjects.length) return 'Voce ainda nao tem materias cadastradas.';

        const matched = findMentionedSubject(subjectNameText, subjects);
        if (!matched) return 'Nao consegui identificar a materia. Escreva o nome exato para eu analisar.';

        const progress = Number(matched.progress || 0);
        const hours = Number(matched.total_hours || 0);
        const exam = matched.exam_date ? `Prova em ${matched.exam_date}.` : 'Sem data de prova definida.';
        chatState.lastSubjectId = matched.id;

        return `Materia: ${matched.name}. Progresso atual: ${progress}%. Carga planejada: ${formatHoursWithMinutes(hours)}. ${exam}`;
    },

    async buildStudyPlanFromPrompt(rawText) {
        const subjects = await safeGetSubjects();
        const matched = findMentionedSubject(rawText, subjects);
        const extractedName = extractSubjectName(rawText);
        const subjectName = matched?.name || extractedName || 'a sua materia';
        const availability = parseAvailability(rawText);

        let examDate = toIsoDate(rawText) || matched?.exam_date || null;
        if (!examDate) {
            return `Consigo montar o plano para ${subjectName}, mas preciso da data do exame. Exemplo: 20/02/2026.`;
        }

        const daysLeft = daysBetweenTodayAnd(examDate);
        if (daysLeft <= 0) {
            return `A data ${examDate} ja passou ou e hoje. Envia uma nova data de exame futura para eu montar o plano.`;
        }

        const targetLoadHours = extractTargetLoadHours(rawText);
        const defaultHours = getDefaultHoursByTimeWindow(daysLeft);
        const totalHours = targetLoadHours || Number(matched?.total_hours || 0) || defaultHours;
        const weeksLeft = Math.max(daysLeft / 7, 0.14);
        const capacityUntilExam = availability.weeklyHours ? availability.weeklyHours * weeksLeft : null;

        let plan = buildPlanText({
            subjectName,
            examDate,
            daysLeft,
            totalHours,
            availability,
            capacityUntilExam
        });

        const eventResult = await tryCreateExamEvent({
            subjectName,
            examDate,
            subjectId: matched?.id || null
        });
        if (eventResult.ok) {
            plan += `\n\nA data do exame (${examDate}) foi adicionada ao cronograma com sucesso.`;
        } else {
            plan += `\n\nNao consegui adicionar automaticamente no cronograma, mas o plano ja esta pronto.`;
        }

        if (typeof capacityUntilExam === 'number' && capacityUntilExam < totalHours) {
            return `${plan}\n\nAlerta: com a disponibilidade informada, pode faltar tempo para cobrir as ${formatHoursWithMinutes(totalHours)}. Posso te sugerir uma versao otimizada por prioridade de topicos.`;
        }

        return plan;
    },

    // Responde mensagens por intencao em linguagem natural
    async chatResponder(text) {
        const raw = String(text || '').trim();
        const t = normalizeText(raw);
        if (!t) return 'Me diz o que voce precisa e eu te ajudo.';

        if (chatState.awaitingSubjectName) {
            try {
                return await addSubjectFromNaturalText(raw, raw);
            } catch (e) {
                return `Falha ao adicionar materia: ${e.message || e}`;
            }
        }

        if (t === 'comandos' || t === 'help' || t === 'ajuda') {
            return [
                'Comandos disponiveis:',
                '- recomendacoes',
                '- analisar',
                '- quiz',
                '- proxima sessao',
                '- adicionar <Nome> | <horas> | <AAAA-MM-DD>'
            ].join('\n');
        }

        if (includesAny(t, ['oi', 'ola', 'bom dia', 'boa tarde', 'boa noite'])) {
            return getGreetingReply();
        }

        if (includesAny(t, ['o que voce faz', 'como voce pode ajudar', 'o que podes fazer'])) {
            return getCapabilityReply();
        }

        const wantsToAddSubject =
            includesAny(t, ['adicionar', 'criar', 'incluir', 'cadastrar', 'registar', 'registrar']) &&
            includesAny(t, ['materia', 'disciplina', 'assunto']);

        if (wantsToAddSubject || t.startsWith('add ')) {
            try {
                return await addSubjectFromNaturalText(raw);
            } catch (e) {
                return `Falha ao adicionar materia: ${e.message || e}`;
            }
        }

        if (includesAny(t, ['pomodoro'])) {
            return 'Pomodoro: 25 minutos de estudo focado + 5 minutos de pausa. A cada 4 ciclos, faca uma pausa longa de 15-30 minutos.';
        }

        if (includesAny(t, ['recomend', 'sugere', 'sugestao', 'o que estudar hoje'])) {
            const recs = await this.getRecommendations();
            return recs.map((r) => `${r.title}: ${r.message}`).slice(0, 4).join('\n\n');
        }

        if (includesAny(t, ['analise', 'progresso geral', 'como estou', 'resumo do progresso'])) {
            const an = await this.analyzeProgress();
            return `${an.message}\n\n${an.plan}\n\n${an.next}`;
        }

        if (includesAny(t, ['plano de estudo', 'plano para', 'organizar estudo', 'cronograma de estudo'])) {
            return this.buildStudyPlanFromPrompt(raw);
        }

        if (includesAny(t, ['progresso da materia', 'status da materia', 'como esta a materia', 'como esta minha materia'])) {
            return this.getSubjectStatus(raw);
        }

        if (includesAny(t, ['quiz', 'pergunta de revisao', 'teste rapido'])) {
            const q = await this.generateQuiz(raw);
            return `Quiz (${q.subject}): ${q.question}\nDica: ${q.hint}`;
        }

        if (includesAny(t, ['cronograma', 'proxima sessao', 'proxima revisao', 'sessoes'])) {
            const sessions = await safeGetSessions();
            const next = sessions
                .filter((s) => !s.completed && new Date(s.start_time) > new Date())
                .sort((a, b) => new Date(a.start_time) - new Date(b.start_time))[0];
            if (next) return `Proxima sessao: ${next.name || next.subject_id} - ${new Date(next.start_time).toLocaleString()} (${formatHours(next.duration || 0)})`;
            return 'Nenhuma sessao futura encontrada.';
        }

        const subjects = await safeGetSubjects();
        const subjectMention = findMentionedSubject(raw, subjects);
        if (subjectMention) {
            const progress = Number(subjectMention.progress || 0);
            chatState.lastSubjectId = subjectMention.id;
            return `Entendi que voce quer falar sobre ${subjectMention.name}. Progresso atual: ${progress}%. Se quiser, eu posso gerar um quiz ou sugerir um plano curto para essa materia.`;
        }

        return 'Entendi. Posso te ajudar com recomendacoes, analise de progresso, quiz, cronograma ou cadastro de materia. Se quiser, escreva de forma natural o que voce precisa.';
    }
};

export default aiLocal;
