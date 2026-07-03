import api from '../api.js';
import aiLocal from '../ai-local.js';

const GENERATED_QUIZ_STORAGE_KEY = 'cerebrum_generated_quizzes';
const GENERATED_EXERCISE_STORAGE_KEY = 'cerebrum_generated_exercises';
const QUIZ_CREATED_EVENT = 'cerebrum:quiz-created';
const EXERCISE_CREATED_EVENT = 'cerebrum:exercise-created';

function toHumanError(error) {
    if (!error) return 'Ocorreu um erro inesperado.';
    if (typeof error === 'string') return error;
    return error.message || 'Ocorreu um erro inesperado.';
}

async function withMinimumDelay(task, minMs = 320) {
    const startedAt = Date.now();
    const result = await task();
    const elapsed = Date.now() - startedAt;
    if (elapsed < minMs) {
        await new Promise((resolve) => setTimeout(resolve, minMs - elapsed));
    }
    return result;
}

function normalizeQuizScope(value) {
    return String(value || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9._-]+/g, '_')
        .replace(/^_+|_+$/g, '');
}

function getGeneratedQuizStorageKey() {
    const currentUser = window.dashboard && window.dashboard.user ? window.dashboard.user : null;
    const scopedUser =
        currentUser?.id
        || currentUser?.email
        || currentUser?.username
        || localStorage.getItem('user_name')
        || 'guest';

    return `${GENERATED_QUIZ_STORAGE_KEY}:${normalizeQuizScope(scopedUser) || 'guest'}`;
}

function getGeneratedExerciseStorageKey() {
    const currentUser = window.dashboard && window.dashboard.user ? window.dashboard.user : null;
    const scopedUser =
        currentUser?.id
        || currentUser?.email
        || currentUser?.username
        || localStorage.getItem('user_name')
        || 'guest';

    return `${GENERATED_EXERCISE_STORAGE_KEY}:${normalizeQuizScope(scopedUser) || 'guest'}`;
}

function persistGeneratedQuiz(quiz) {
    try {
        const current = JSON.parse(localStorage.getItem(getGeneratedQuizStorageKey()) || '[]');
        const list = Array.isArray(current) ? current : [];
        list.unshift(quiz);
        localStorage.setItem(getGeneratedQuizStorageKey(), JSON.stringify(list.slice(0, 20)));
        window.dispatchEvent(new CustomEvent(QUIZ_CREATED_EVENT, { detail: { quiz } }));
    } catch (error) {
        console.warn('Falha ao guardar quiz gerado', error);
    }
}

function persistGeneratedExercises(exercises) {
    try {
        const current = JSON.parse(localStorage.getItem(getGeneratedExerciseStorageKey()) || '[]');
        const list = Array.isArray(current) ? current : [];
        list.unshift(exercises);
        localStorage.setItem(getGeneratedExerciseStorageKey(), JSON.stringify(list.slice(0, 20)));
        window.dispatchEvent(new CustomEvent(EXERCISE_CREATED_EVENT, { detail: { exercises } }));
    } catch (error) {
        console.warn('Falha ao guardar exercicios gerados', error);
    }
}

function parseQuizPrompt(text) {
    const raw = String(text || '').trim();
    const normalized = raw
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();

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

async function requestAi(endpoint, body = {}) {
    return api.request(endpoint, {
        method: 'POST',
        timeoutMs: 30000,
        body: JSON.stringify(body)
    });
}

export function createAssistantService() {
    return {
        async getProviderStatus(forceRefresh = false) {
            try {
                const response = await withMinimumDelay(
                    () => api.request(`/ai/provider-status${forceRefresh ? '?refresh=true' : ''}`, { method: 'GET', timeoutMs: 12000 }),
                    120
                );
                return { ok: true, status: response };
            } catch (error) {
                return { ok: false, text: toHumanError(error), status: { available: false } };
            }
        },

        async ask(message) {
            const quizRequest = parseQuizPrompt(message);
            if (quizRequest) {
                return this.generateQuizWithOptions(quizRequest);
            }

            try {
                const response = await withMinimumDelay(() => requestAi('/ai/assistant', { message }));
                if (response.quiz) {
                    persistGeneratedQuiz(response.quiz);
                    const quiz = response.quiz;
                    const text = response.answer || `Criei um quiz de ${quiz.questionCount || 5} perguntas de ${quiz.subject || 'Geral'} sobre ${quiz.topic || 'revisão geral'}. Ele já está disponível em Ferramentas > Quizzes.`;
                    return { ok: true, text, quiz };
                }
                if (response.exercises) {
                    persistGeneratedExercises(response.exercises);
                    const exercises = response.exercises;
                    const text = response.answer || `Criei uma lista de ${exercises.questionCount || 6} exercicios de ${exercises.subject || 'Geral'} sobre ${exercises.topic || 'revisao geral'}. Ela ja esta disponivel em Ferramentas > Exercicios.`;
                    return { ok: true, text, exercises };
                }
                return { ok: true, text: response.answer || 'Sem resposta.' };
            } catch (error) {
                try {
                    if (quizRequest) {
                        const fallbackQuiz = await withMinimumDelay(() => aiLocal.generateQuiz(quizRequest));
                        return {
                            ok: true,
                            text: `Criei um quiz de ${fallbackQuiz.questionCount || 5} perguntas de ${fallbackQuiz.subject || 'Geral'} sobre ${fallbackQuiz.topic || 'revisão geral'}. Ele já está disponível em Ferramentas > Quizzes.`,
                            quiz: fallbackQuiz
                        };
                    }
                    const fallback = await withMinimumDelay(() => aiLocal.chatResponder(message));
                    return { ok: true, text: fallback };
                } catch (fallbackError) {
                    return { ok: false, text: toHumanError(error) };
                }
            }
        },

        async analyzeProgress() {
            try {
                const response = await withMinimumDelay(() => requestAi('/ai/analyze'));
                return { ok: true, text: `${response.message}\n\n${response.plan}\n\n${response.next}` };
            } catch (error) {
                try {
                    const fallback = await withMinimumDelay(() => aiLocal.analyzeProgress());
                    return { ok: true, text: `${fallback.message}\n\n${fallback.plan}\n\n${fallback.next}` };
                } catch (fallbackError) {
                    return { ok: false, text: toHumanError(error) };
                }
            }
        },

        async getRecommendations(options = {}) {
            try {
                const response = await withMinimumDelay(() => requestAi('/ai/recommendations', options));
                const items = Array.isArray(response.recommendations) ? response.recommendations : [];
                const text = items.map((item) => `${item.title}: ${item.message}`).join('\n\n');
                return { ok: true, text: text || 'Sem recomendações disponíveis.' };
            } catch (error) {
                try {
                    const fallback = await withMinimumDelay(() => aiLocal.getRecommendations(options));
                    const text = fallback.map((item) => `${item.title}: ${item.message}`).join('\n\n');
                    return { ok: true, text };
                } catch (fallbackError) {
                    return { ok: false, text: toHumanError(error) };
                }
            }
        },

        async generateQuiz() {
            try {
                const response = await withMinimumDelay(() => requestAi('/ai/quiz'));
                const quiz = response.quiz;
                if (quiz) persistGeneratedQuiz(quiz);
                const text = `Criei um quiz de ${quiz?.questionCount || 5} perguntas de ${quiz?.subject || 'Geral'} sobre ${quiz?.topic || 'revisão geral'}. Ele já está disponível em Ferramentas > Quizzes.`;
                return { ok: true, text };
            } catch (error) {
                try {
                    const fallback = await withMinimumDelay(() => aiLocal.generateQuiz());
                    return { ok: true, text: `Criei um quiz de ${fallback.questionCount || 5} perguntas de ${fallback.subject || 'Geral'} sobre ${fallback.topic || 'revisão geral'}. Ele já está disponível em Ferramentas > Quizzes.` };
                } catch (fallbackError) {
                    return { ok: false, text: toHumanError(error) };
                }
            }
        },

        async generateQuizWithOptions(options = {}) {
            try {
                const response = await withMinimumDelay(() => requestAi('/ai/quiz', options));
                const quiz = response.quiz;
                if (quiz) persistGeneratedQuiz(quiz);
                const text = `Criei um quiz de ${quiz?.questionCount || 5} perguntas de ${quiz?.subject || 'Geral'} sobre ${quiz?.topic || 'revisão geral'}. Ele já está disponível em Ferramentas > Quizzes.`;
                return { ok: true, text, quiz };
            } catch (error) {
                try {
                    const fallback = await withMinimumDelay(() => aiLocal.generateQuiz(options));
                    return {
                        ok: true,
                        text: `Criei um quiz de ${fallback.questionCount || 5} perguntas de ${fallback.subject || 'Geral'} sobre ${fallback.topic || 'revisão geral'}. Ele já está disponível em Ferramentas > Quizzes.`,
                        quiz: fallback
                    };
                } catch (fallbackError) {
                    return { ok: false, text: toHumanError(error) };
                }
            }
        },

        async generateExercisesWithOptions(options = {}) {
            try {
                const response = await withMinimumDelay(() => requestAi('/ai/exercises', options));
                const exercises = response.exercises;
                if (exercises) persistGeneratedExercises(exercises);
                const text = `Criei uma lista de ${exercises?.questionCount || 6} exercícios de ${exercises?.subject || 'Geral'} sobre ${exercises?.topic || 'revisão geral'}. Ela já está disponível em Ferramentas > Exercícios.`;
                return { ok: true, text, exercises };
            } catch (error) {
                try {
                    const fallback = await withMinimumDelay(() => aiLocal.generateExercises(options));
                    const text = `Criei uma lista de ${fallback.questionCount || 6} exercicios de ${fallback.subject || 'Geral'} sobre ${fallback.topic || 'revisao geral'}. Ela ja esta disponivel em Ferramentas > Exercicios.`;
                    return { ok: true, text, exercises: fallback };
                } catch (fallbackError) {
                    return { ok: false, text: toHumanError(error) };
                }
            }
        },

        async getQuizSubjects() {
            try {
                const response = await withMinimumDelay(() => api.getMinhasMaterias(), 120);
                const subjects = Array.isArray(response)
                    ? response.map((subject) => ({ id: subject.id, name: subject.name })).filter((subject) => subject.name)
                    : [];
                return { ok: true, subjects };
            } catch (error) {
                try {
                    const fallback = await withMinimumDelay(() => aiLocal.getQuizSubjects(), 120);
                    return { ok: true, subjects: fallback };
                } catch (fallbackError) {
                    return { ok: false, text: toHumanError(error), subjects: [] };
                }
            }
        },

        getQuizTopicSuggestions(subjectName) {
            try {
                return { ok: true, topics: aiLocal.getQuizTopicSuggestions(subjectName) };
            } catch (error) {
                return { ok: false, text: toHumanError(error), topics: [] };
            }
        },

        async showHelp() {
            return this.ask('ajuda');
        },

        async addSubjectFromPrompts() {
            try {
                const name = prompt('Nome da matéria (ex: Cálculo)');
                if (!name) return { ok: false, cancelled: true, text: 'Operação cancelada.' };

                const hoursRaw = prompt('Horas totais planeadas (ex: 40)');
                const hours = hoursRaw ? Number(hoursRaw.replace(',', '.')) : 0;

                const examDate = prompt('Data do exame (AAAA-MM-DD) ou deixe em branco');
                const created = await withMinimumDelay(() =>
                    aiLocal.addSubject({ name, total_hours: hours, exam_date: examDate || null })
                );

                return { ok: true, text: `Matéria adicionada: ${created.name} (ID: ${created.id})` };
            } catch (error) {
                return { ok: false, text: toHumanError(error) };
            }
        }
    };
}
