import aiLocal from '../ai-local.js';

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

export function createAssistantService() {
    return {
        async ask(message) {
            try {
                const response = await withMinimumDelay(() => aiLocal.chatResponder(message));
                return { ok: true, text: response };
            } catch (error) {
                return { ok: false, text: toHumanError(error) };
            }
        },

        async analyzeProgress() {
            try {
                const response = await withMinimumDelay(() => aiLocal.analyzeProgress());
                return { ok: true, text: `${response.message}\n\n${response.plan}\n\n${response.next}` };
            } catch (error) {
                return { ok: false, text: toHumanError(error) };
            }
        },

        async getRecommendations(options = {}) {
            try {
                const response = await withMinimumDelay(() => aiLocal.getRecommendations(options));
                const text = response.map((item) => `${item.title}: ${item.message}`).join('\n\n');
                return { ok: true, text };
            } catch (error) {
                return { ok: false, text: toHumanError(error) };
            }
        },

        async generateQuiz() {
            try {
                const response = await withMinimumDelay(() => aiLocal.generateQuiz());
                const text = `Criei um quiz de ${response.questionCount || 5} perguntas de ${response.subject || 'Geral'} sobre ${response.topic || 'revisão geral'}. Ele já está disponível em Ferramentas > Quizzes.`;
                return { ok: true, text };
            } catch (error) {
                return { ok: false, text: toHumanError(error) };
            }
        },

        async generateQuizWithOptions(options = {}) {
            try {
                const response = await withMinimumDelay(() => aiLocal.generateQuiz(options));
                const text = `Criei um quiz de ${response.questionCount || 5} perguntas de ${response.subject || 'Geral'} sobre ${response.topic || 'revisão geral'}. Ele já está disponível em Ferramentas > Quizzes.`;
                return { ok: true, text, quiz: response };
            } catch (error) {
                return { ok: false, text: toHumanError(error) };
            }
        },

        async getQuizSubjects() {
            try {
                const response = await withMinimumDelay(() => aiLocal.getQuizSubjects(), 120);
                return { ok: true, subjects: response };
            } catch (error) {
                return { ok: false, text: toHumanError(error), subjects: [] };
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
            return this.ask('comandos');
        },

        async addSubjectFromPrompts() {
            try {
                const name = prompt('Nome da matéria (ex: Cálculo)');
                if (!name) return { ok: false, cancelled: true, text: 'Operação cancelada.' };

                const hoursRaw = prompt('Horas totais planejadas (ex: 40)');
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
