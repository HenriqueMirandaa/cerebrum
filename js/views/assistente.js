import { escapeHtml } from '../utils/helpers.js';
import { createAssistantService } from '../services/assistant-service.js';
import { setButtonLoading, showToast } from '../services/ui-service.js';

const assistantService = createAssistantService();
const HISTORY_KEY_PREFIX = 'cerebrum_chat_history';
const MAX_HISTORY_ITEMS = 200;
const AI_CAPABILITIES = [
    'Conversa natural sobre estudos.',
    'Entende pedidos de plano de estudo com data de exame.',
    'Extrai nome da matéria, horas e data automaticamente.',
    'Ajusta plano por disponibilidade real.',
    'Calcula carga diária e semanal até ao exame.',
    'Sinaliza quando a disponibilidade é insuficiente.',
    'Gera recomendações personalizadas de estudo.',
    'Faz análise de progresso geral.',
    'Mostra estado de matéria específica.',
    'Gera quiz rápido por matéria.',
    'Gera exercícios com resolução na aba Ferramentas.',
    'Consulta cronograma e próxima sessão.'
];

function renderAssistantLayout() {
    return `
        <section class="assistant-workspace">
            <div class="assistant-header">
                <h2 class="assistant-title">Assistente IA</h2>
                <div id="assistantProviderBadge" class="hidden mt-3 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-sm text-emerald-700"></div>
                <p class="assistant-subtitle">Assistente com IA remota para apoio ao estudo diário.</p>
            </div>
            <div class="assistant-grid">
                <article class="card assistant-panel">
                    <header class="card-header">
                        <h3 class="text-xl font-semibold">Chat do Assistente</h3>
                        <div class="assistant-chat-actions">
                            <button type="button" class="btn btn-secondary" id="chatClearBtn">Limpar Chat</button>
                            <span class="assistant-status" id="assistantStatus">Pronto</span>
                        </div>
                    </header>
                    <div class="card-body">
                        <div id="chatContainer" class="chat-area">
                            <div class="chat-container" id="chatContent"></div>
                        </div>
                        <div class="chat-input-container">
                            <form id="chatForm" class="flex gap-2 w-full">
                                <input
                                    type="text"
                                    id="messageInput"
                                    class="form-input flex-1"
                                    placeholder="Pergunte algo sobre o seu plano de estudo..."
                                    autocomplete="off"
                                    required
                                >
                                <button type="submit" class="btn btn-primary" id="chatSubmitBtn">
                                    <i class="fas fa-paper-plane mr-2"></i>Enviar
                                </button>
                            </form>
                        </div>
                    </div>
                </article>
                <aside class="card card-body assistant-actions">
                    <h3 class="text-lg font-semibold mb-3">Ações Rápidas</h3>
                    <div class="space-y-2" id="assistantQuickActions">
                        <button data-action="suggest" class="btn w-full">Sugestões de Estudo</button>
                        <button data-action="quiz" class="btn w-full">Gerar Quiz Rápido</button>
                        <button data-action="exercise" class="btn w-full">Gerar Exercícios</button>
                        <button data-action="help" class="btn w-full">Mostrar Comandos</button>
                    </div>
                    <div class="assistant-capabilities-bubble hidden" id="capabilitiesBubble" role="dialog" aria-label="Capacidades da IA">
                        <div class="assistant-capabilities-card">
                            <div class="assistant-capabilities-header">
                                <h4 class="assistant-capabilities-title">Capacidades da IA</h4>
                                <div class="assistant-capabilities-controls">
                                    <button type="button" class="btn btn-secondary" id="closeCapabilitiesBtn">Fechar</button>
                                </div>
                            </div>
                            <ul id="capabilitiesList" class="assistant-capabilities-list">
                                ${AI_CAPABILITIES.map((item) => `<li>${item}</li>`).join('')}
                            </ul>
                        </div>
                    </div>
                </aside>
            </div>

            <div class="modal hidden" id="assistantQuizModal" aria-hidden="true">
                <div class="modal-overlay">
                    <div class="modal-card assistant-quiz-modal" role="dialog" aria-modal="true" aria-labelledby="assistantQuizModalTitle">
                        <div class="assistant-quiz-modal__header">
                            <div>
                                <h3 class="assistant-quiz-modal__title" id="assistantQuizModalTitle">Configurar Quiz Rápido</h3>
                                <p class="assistant-quiz-modal__subtitle">Escolhe como queres gerar o quiz antes de enviar para a IA.</p>
                            </div>
                            <button type="button" class="assistant-quiz-modal__close" id="assistantQuizModalClose" aria-label="Fechar">
                                <i class="fas fa-times"></i>
                            </button>
                        </div>
                        <form id="assistantQuizForm" class="assistant-quiz-modal__body">
                            <div class="assistant-quiz-mode">
                                <button type="button" class="assistant-quiz-choice is-active" data-quiz-mode="specific">
                                    <span class="assistant-quiz-choice__title">Quiz específico</span>
                                    <span class="assistant-quiz-choice__text">Escolhes a matéria e o tema.</span>
                                </button>
                                <button type="button" class="assistant-quiz-choice" data-quiz-mode="random">
                                    <span class="assistant-quiz-choice__title">Quiz aleatório</span>
                                    <span class="assistant-quiz-choice__text">A IA escolhe um tema coerente automaticamente.</span>
                                </button>
                            </div>
                            <input type="hidden" id="assistantQuizMode" value="specific">
                            <div class="assistant-quiz-fields" id="assistantQuizFields">
                                <label class="assistant-quiz-field">
                                    <span class="assistant-quiz-field__label">Matéria</span>
                                    <select id="assistantQuizSubject" class="form-input"></select>
                                </label>
                                <label class="assistant-quiz-field">
                                    <span class="assistant-quiz-field__label">Tema</span>
                                    <select id="assistantQuizTopic" class="form-input"></select>
                                </label>
                            </div>
                            <div class="assistant-quiz-summary hidden" id="assistantQuizSummary">
                                No modo aleatório, a IA escolhe uma matéria prioritária e um tema curto para revisão.
                            </div>
                            <div class="assistant-quiz-modal__actions">
                                <button type="button" class="btn btn-secondary" id="assistantQuizCancelBtn">Cancelar</button>
                                <button type="submit" class="btn btn-primary" id="assistantQuizSubmitBtn">Gerar Quiz</button>
                            </div>
                        </form>
                    </div>
                </div>
            </div>

            <div class="modal hidden" id="assistantSuggestModal" aria-hidden="true">
                <div class="modal-overlay">
                    <div class="modal-card assistant-quiz-modal" role="dialog" aria-modal="true" aria-labelledby="assistantSuggestModalTitle">
                        <div class="assistant-quiz-modal__header">
                            <div>
                                <h3 class="assistant-quiz-modal__title" id="assistantSuggestModalTitle">Sugestões de Estudo</h3>
                                <p class="assistant-quiz-modal__subtitle">Escolhe o foco das recomendações para a IA ajustar a resposta.</p>
                            </div>
                            <button type="button" class="assistant-quiz-modal__close" id="assistantSuggestModalClose" aria-label="Fechar">
                                <i class="fas fa-times"></i>
                            </button>
                        </div>
                        <form id="assistantSuggestForm" class="assistant-quiz-modal__body">
                            <div class="assistant-quiz-mode assistant-suggest-mode">
                                <button type="button" class="assistant-quiz-choice is-active" data-suggest-focus="today">
                                    <span class="assistant-quiz-choice__title">Hoje</span>
                                    <span class="assistant-quiz-choice__text">O que vale mais a pena estudar agora.</span>
                                </button>
                                <button type="button" class="assistant-quiz-choice" data-suggest-focus="week">
                                    <span class="assistant-quiz-choice__title">Esta semana</span>
                                    <span class="assistant-quiz-choice__text">Distribuição de foco para os próximos dias.</span>
                                </button>
                                <button type="button" class="assistant-quiz-choice" data-suggest-focus="exam">
                                    <span class="assistant-quiz-choice__title">Próxima prova</span>
                                    <span class="assistant-quiz-choice__text">Prioridade guiada pela prova mais urgente.</span>
                                </button>
                            </div>
                            <input type="hidden" id="assistantSuggestFocus" value="today">
                            <div class="assistant-quiz-modal__actions">
                                <button type="button" class="btn btn-secondary" id="assistantSuggestCancelBtn">Cancelar</button>
                                <button type="submit" class="btn btn-primary" id="assistantSuggestSubmitBtn">Ver Sugestões</button>
                            </div>
                        </form>
                    </div>
                </div>
            </div>

            <div class="modal hidden" id="assistantExerciseModal" aria-hidden="true">
                <div class="modal-overlay">
                    <div class="modal-card assistant-quiz-modal" role="dialog" aria-modal="true" aria-labelledby="assistantExerciseModalTitle">
                        <div class="assistant-quiz-modal__header">
                            <div>
                                <h3 class="assistant-quiz-modal__title" id="assistantExerciseModalTitle">Gerar Exercícios</h3>
                                <p class="assistant-quiz-modal__subtitle">Escolhe a matéria, o tema e a quantidade antes de enviar para a IA.</p>
                            </div>
                            <button type="button" class="assistant-quiz-modal__close" id="assistantExerciseModalClose" aria-label="Fechar">
                                <i class="fas fa-times"></i>
                            </button>
                        </div>
                        <form id="assistantExerciseForm" class="assistant-quiz-modal__body">
                            <div class="assistant-quiz-fields">
                                <label class="assistant-quiz-field">
                                    <span class="assistant-quiz-field__label">Matéria</span>
                                    <select id="assistantExerciseSubject" class="form-input"></select>
                                </label>
                                <label class="assistant-quiz-field">
                                    <span class="assistant-quiz-field__label">Tema</span>
                                    <input id="assistantExerciseTopic" class="form-input" placeholder="Ex: Derivadas" />
                                </label>
                                <label class="assistant-quiz-field">
                                    <span class="assistant-quiz-field__label">Quantidade</span>
                                    <input id="assistantExerciseCount" type="number" min="3" max="10" value="6" class="form-input" />
                                </label>
                            </div>
                            <div class="assistant-quiz-modal__actions">
                                <button type="button" class="btn btn-secondary" id="assistantExerciseCancelBtn">Cancelar</button>
                                <button type="submit" class="btn btn-primary" id="assistantExerciseSubmitBtn">Gerar Exercícios</button>
                            </div>
                        </form>
                    </div>
                </div>
            </div>
        </section>
    `;
}

function getInitialState() {
    return {
        busy: false,
        quizSubjects: [],
        quizTopics: [],
        exerciseSubjects: [],
        quizPanelOpen: false,
        suggestPanelOpen: false,
        exercisePanelOpen: false,
        providerStatus: null
    };
}

function renderProviderBadge(status) {
    const badge = document.getElementById('assistantProviderBadge');
    if (!badge) return;

    if (!status || !status.available || !status.provider || !status.model) {
        badge.classList.add('hidden');
        badge.textContent = '';
        return;
    }

    badge.innerHTML = `<i class="fas fa-circle text-[10px]"></i><span>IA ativa: ${escapeHtml(status.provider)} - ${escapeHtml(status.model)}</span>`;
    badge.classList.remove('hidden');
}

async function loadProviderBadge(state) {
    const result = await assistantService.getProviderStatus();
    state.providerStatus = result.ok ? result.status : { available: false };
    renderProviderBadge(state.providerStatus);
}

function normalizeHistoryScope(value) {
    return String(value || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9._-]+/g, '_')
        .replace(/^_+|_+$/g, '');
}

function getHistoryKey() {
    const currentUser = window.dashboard && window.dashboard.user ? window.dashboard.user : null;
    const scopedUser =
        currentUser?.id
        || currentUser?.email
        || currentUser?.username
        || localStorage.getItem('user_name')
        || 'guest';

    return `${HISTORY_KEY_PREFIX}:${normalizeHistoryScope(scopedUser) || 'guest'}`;
}

function setAssistantStatus(text, busy = false) {
    const status = document.getElementById('assistantStatus');
    if (!status) return;
    status.textContent = text;
    status.classList.toggle('is-busy', busy);
}

function persistMessage(who, text) {
    try {
        const history = JSON.parse(localStorage.getItem(getHistoryKey()) || '[]');
        history.push({ who, text, timestamp: new Date().toISOString() });
        if (history.length > MAX_HISTORY_ITEMS) {
            history.splice(0, history.length - MAX_HISTORY_ITEMS);
        }
        localStorage.setItem(getHistoryKey(), JSON.stringify(history));
    } catch (error) {
        console.warn('Failed to persist chat history', error);
    }
}

function getHistory() {
    try {
        const history = JSON.parse(localStorage.getItem(getHistoryKey()) || '[]');
        return Array.isArray(history) ? history : [];
    } catch (error) {
        return [];
    }
}

function appendChatMessage(who, text) {
    const chatContent = document.getElementById('chatContent');
    if (!chatContent) return;

    const wrapper = document.createElement('div');
    wrapper.className = who === 'user' ? 'flex items-start gap-3 justify-end' : 'flex items-start gap-3';

    const safeText = escapeHtml(text).replace(/\n/g, '<br/>');
    if (who === 'user') {
        wrapper.innerHTML = `
            <div class="assistant-message assistant-message--user">
                <div class="chat-bubble user-bubble"><p>${safeText}</p></div>
                <div class="assistant-avatar assistant-avatar--user"><i class="fas fa-user"></i></div>
            </div>
        `;
    } else {
        wrapper.innerHTML = `
            <div class="assistant-message assistant-message--ai">
                <div class="assistant-avatar assistant-avatar--ai"><i class="fas fa-robot"></i></div>
                <div class="chat-bubble ai-bubble"><p>${safeText}</p></div>
            </div>
        `;
    }

    chatContent.appendChild(wrapper);
    const container = document.getElementById('chatContainer');
    if (container) container.scrollTop = container.scrollHeight;
}

function renderPlaceholderIfEmpty() {
    const chatContent = document.getElementById('chatContent');
    if (!chatContent || chatContent.children.length > 0) return;

    chatContent.innerHTML = `
        <div class="assistant-empty-state">
            <i class="fas fa-robot text-4xl mb-3 opacity-30"></i>
            <p>Olá! Pergunte algo para começar (ex: "recomendações", "análise", "quiz", "exercícios").</p>
        </div>
    `;
}

function clearPlaceholder() {
    const emptyState = document.querySelector('.assistant-empty-state');
    if (emptyState) emptyState.remove();
}

function clearChatHistory() {
    localStorage.removeItem(getHistoryKey());
    const chatContent = document.getElementById('chatContent');
    if (!chatContent) return;
    chatContent.innerHTML = '';
    renderPlaceholderIfEmpty();
    showToast('Chat limpo com sucesso.', 'success');
}

function toggleCapabilitiesBubble(forceOpen = null) {
    const bubble = document.getElementById('capabilitiesBubble');
    if (!bubble) return;
    if (forceOpen === true) return bubble.classList.remove('hidden');
    if (forceOpen === false) return bubble.classList.add('hidden');
    bubble.classList.toggle('hidden');
}

function mountHistory() {
    const history = getHistory();
    if (!history.length) {
        renderPlaceholderIfEmpty();
        return;
    }

    history.slice(-24).forEach((item) => appendChatMessage(item.who, item.text));
}

function setTypingIndicator(visible) {
    const chatContent = document.getElementById('chatContent');
    if (!chatContent) return;

    const existing = document.getElementById('assistantTyping');
    if (visible) {
        if (existing) return;
        const typing = document.createElement('div');
        typing.id = 'assistantTyping';
        typing.className = 'assistant-typing';
        typing.innerHTML = `
            <span></span>
            <span></span>
            <span></span>
        `;
        chatContent.appendChild(typing);
        const container = document.getElementById('chatContainer');
        if (container) container.scrollTop = container.scrollHeight;
        return;
    }

    if (existing) existing.remove();
}

function parseExercisePrompt(text) {
    const raw = String(text || '').trim();
    if (!/\bexerc/i.test(raw)) return null;

    const countMatch = raw.match(/(\d+)\s+perguntas?/i);
    const questionCount = Math.max(3, Math.min(10, Number(countMatch?.[1] || 6)));
    const subjectMatch = raw.match(/\bexerc(?:icio|icios|icio?s?)\s+de\s+(.+?)(?=\s+sobre\s+|\s+com\s+\d+\s+perguntas?|$)/i);
    const topicMatch = raw.match(/\bsobre\s+(.+?)(?=\s+com\s+\d+\s+perguntas?|$)/i);

    return {
        subjectName: subjectMatch ? subjectMatch[1].trim() : '',
        topic: topicMatch ? topicMatch[1].trim() : '',
        questionCount
    };
}

async function sendMessage(text, state) {
    clearPlaceholder();
    appendChatMessage('user', text);
    persistMessage('user', text);

    state.busy = true;
    setAssistantStatus('A processar...', true);
    setTypingIndicator(true);

    const exerciseRequest = parseExercisePrompt(text);
    const response = exerciseRequest
        ? await assistantService.generateExercisesWithOptions(exerciseRequest)
        : await assistantService.ask(text);

    setTypingIndicator(false);
    appendChatMessage('assistant', response.ok ? response.text : `Erro: ${response.text}`);
    persistMessage('assistant', response.ok ? response.text : `Erro: ${response.text}`);
    setAssistantStatus(response.ok ? 'Pronto' : 'Erro de processamento', false);
    state.busy = false;

    if (!response.ok) {
        showToast('Falha ao obter resposta do assistente.', 'error');
    }
}

function getQuizModal() {
    return document.getElementById('assistantQuizModal');
}

function getSuggestModal() {
    return document.getElementById('assistantSuggestModal');
}

function getExerciseModal() {
    return document.getElementById('assistantExerciseModal');
}

function closeQuizModal(state) {
    const modal = getQuizModal();
    if (!modal) return;
    modal.classList.add('hidden');
    modal.setAttribute('aria-hidden', 'true');
    state.quizPanelOpen = false;
}

function closeSuggestModal(state) {
    const modal = getSuggestModal();
    if (!modal) return;
    modal.classList.add('hidden');
    modal.setAttribute('aria-hidden', 'true');
    state.suggestPanelOpen = false;
}

function closeExerciseModal(state) {
    const modal = getExerciseModal();
    if (!modal) return;
    modal.classList.add('hidden');
    modal.setAttribute('aria-hidden', 'true');
    state.exercisePanelOpen = false;
}

function populateQuizTopics(state, subjectName, preserveCurrent = false) {
    const topicSelect = document.getElementById('assistantQuizTopic');
    if (!topicSelect) return;

    const currentValue = preserveCurrent ? topicSelect.value : '';
    const topicsResult = assistantService.getQuizTopicSuggestions(subjectName);
    state.quizTopics = Array.isArray(topicsResult.topics) ? topicsResult.topics : [];
    topicSelect.innerHTML = state.quizTopics
        .map((topic) => `<option value="${escapeHtml(topic)}">${escapeHtml(topic)}</option>`)
        .join('');

    if (preserveCurrent && state.quizTopics.includes(currentValue)) {
        topicSelect.value = currentValue;
    }
}

function setQuizMode(mode) {
    const hiddenModeInput = document.getElementById('assistantQuizMode');
    const fields = document.getElementById('assistantQuizFields');
    const summary = document.getElementById('assistantQuizSummary');
    const choices = document.querySelectorAll('[data-quiz-mode]');

    if (hiddenModeInput) hiddenModeInput.value = mode;
    choices.forEach((button) => {
        button.classList.toggle('is-active', button.dataset.quizMode === mode);
    });

    if (fields) fields.classList.toggle('hidden', mode !== 'specific');
    if (summary) summary.classList.toggle('hidden', mode !== 'random');
}

function setSuggestFocus(focus) {
    const hiddenFocusInput = document.getElementById('assistantSuggestFocus');
    const choices = document.querySelectorAll('[data-suggest-focus]');

    if (hiddenFocusInput) hiddenFocusInput.value = focus;
    choices.forEach((button) => {
        button.classList.toggle('is-active', button.dataset.suggestFocus === focus);
    });
}

async function openQuizModal(state) {
    const subjectResult = await assistantService.getQuizSubjects();
    if (!subjectResult.ok) return { error: subjectResult.text };
    if (!subjectResult.subjects.length) {
        return { error: 'Não encontrei matérias ativas para montar um quiz.' };
    }

    state.quizSubjects = subjectResult.subjects;
    const subjectSelect = document.getElementById('assistantQuizSubject');
    const modal = getQuizModal();
    if (!subjectSelect || !modal) return { error: 'Não consegui abrir o painel do quiz.' };

    subjectSelect.innerHTML = state.quizSubjects
        .map((subject) => `<option value="${escapeHtml(subject.name)}">${escapeHtml(subject.name)}</option>`)
        .join('');

    populateQuizTopics(state, state.quizSubjects[0]?.name || '');
    setQuizMode('specific');
    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');
    state.quizPanelOpen = true;
    subjectSelect.focus();
    return { ok: true };
}

async function askQuizPreferencesPanel(state) {
    const opened = await openQuizModal(state);
    if (opened?.error) return { error: opened.error };

    return new Promise((resolve) => {
        const modal = getQuizModal();
        const form = document.getElementById('assistantQuizForm');
        const cancelBtn = document.getElementById('assistantQuizCancelBtn');
        const closeBtn = document.getElementById('assistantQuizModalClose');
        const subjectSelect = document.getElementById('assistantQuizSubject');
        const topicSelect = document.getElementById('assistantQuizTopic');
        const modeButtons = document.querySelectorAll('[data-quiz-mode]');
        const modeInput = document.getElementById('assistantQuizMode');

        if (!modal || !form || !cancelBtn || !closeBtn || !subjectSelect || !topicSelect || !modeInput) {
            resolve({ error: 'Não consegui carregar o painel do quiz.' });
            return;
        }

        let finished = false;
        const cleanup = () => {
            form.removeEventListener('submit', handleSubmit);
            cancelBtn.removeEventListener('click', handleCancel);
            closeBtn.removeEventListener('click', handleCancel);
            subjectSelect.removeEventListener('change', handleSubjectChange);
            modeButtons.forEach((button) => button.removeEventListener('click', handleModeClick));
            modal.removeEventListener('click', handleOverlayClick);
        };
        const done = (payload) => {
            if (finished) return;
            finished = true;
            cleanup();
            closeQuizModal(state);
            resolve(payload);
        };
        const handleCancel = () => done({ cancelled: true });
        const handleOverlayClick = (event) => {
            if (event.target === modal || event.target.classList.contains('modal-overlay')) handleCancel();
        };
        const handleSubjectChange = () => populateQuizTopics(state, subjectSelect.value);
        const handleModeClick = (event) => setQuizMode(event.currentTarget.dataset.quizMode);
        const handleSubmit = (event) => {
            event.preventDefault();
            if (modeInput.value === 'random') return done({ random: true });
            done({ subjectName: subjectSelect.value, topic: topicSelect.value });
        };

        form.addEventListener('submit', handleSubmit);
        cancelBtn.addEventListener('click', handleCancel);
        closeBtn.addEventListener('click', handleCancel);
        subjectSelect.addEventListener('change', handleSubjectChange);
        modeButtons.forEach((button) => button.addEventListener('click', handleModeClick));
        modal.addEventListener('click', handleOverlayClick);
    });
}

async function askSuggestionPreferencesPanel(state) {
    const modal = getSuggestModal();
    if (!modal) return { error: 'Não consegui abrir o painel de sugestões.' };

    setSuggestFocus('today');
    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');
    state.suggestPanelOpen = true;

    return new Promise((resolve) => {
        const form = document.getElementById('assistantSuggestForm');
        const cancelBtn = document.getElementById('assistantSuggestCancelBtn');
        const closeBtn = document.getElementById('assistantSuggestModalClose');
        const modeButtons = document.querySelectorAll('[data-suggest-focus]');
        const focusInput = document.getElementById('assistantSuggestFocus');

        if (!form || !cancelBtn || !closeBtn || !focusInput) {
            resolve({ error: 'Não consegui carregar o painel de sugestões.' });
            return;
        }

        let finished = false;
        const cleanup = () => {
            form.removeEventListener('submit', handleSubmit);
            cancelBtn.removeEventListener('click', handleCancel);
            closeBtn.removeEventListener('click', handleCancel);
            modeButtons.forEach((button) => button.removeEventListener('click', handleFocusClick));
            modal.removeEventListener('click', handleOverlayClick);
        };
        const done = (payload) => {
            if (finished) return;
            finished = true;
            cleanup();
            closeSuggestModal(state);
            resolve(payload);
        };
        const handleCancel = () => done({ cancelled: true });
        const handleOverlayClick = (event) => {
            if (event.target === modal || event.target.classList.contains('modal-overlay')) handleCancel();
        };
        const handleFocusClick = (event) => setSuggestFocus(event.currentTarget.dataset.suggestFocus);
        const handleSubmit = (event) => {
            event.preventDefault();
            done({ focus: focusInput.value || 'today' });
        };

        form.addEventListener('submit', handleSubmit);
        cancelBtn.addEventListener('click', handleCancel);
        closeBtn.addEventListener('click', handleCancel);
        modeButtons.forEach((button) => button.addEventListener('click', handleFocusClick));
        modal.addEventListener('click', handleOverlayClick);
    });
}

async function openExerciseModal(state) {
    const subjectResult = await assistantService.getQuizSubjects();
    if (!subjectResult.ok) return { error: subjectResult.text };
    if (!subjectResult.subjects.length) {
        return { error: 'Não encontrei matérias ativas para gerar exercícios.' };
    }

    state.exerciseSubjects = subjectResult.subjects;
    const subjectSelect = document.getElementById('assistantExerciseSubject');
    const topicInput = document.getElementById('assistantExerciseTopic');
    const countInput = document.getElementById('assistantExerciseCount');
    const modal = getExerciseModal();
    if (!subjectSelect || !topicInput || !countInput || !modal) {
        return { error: 'Não consegui abrir o painel de exercícios.' };
    }

    subjectSelect.innerHTML = state.exerciseSubjects
        .map((subject) => `<option value="${escapeHtml(subject.name)}">${escapeHtml(subject.name)}</option>`)
        .join('');
    topicInput.value = '';
    countInput.value = '6';
    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');
    state.exercisePanelOpen = true;
    subjectSelect.focus();
    return { ok: true };
}

async function askExercisePreferencesPanel(state) {
    const opened = await openExerciseModal(state);
    if (opened?.error) return { error: opened.error };

    return new Promise((resolve) => {
        const modal = getExerciseModal();
        const form = document.getElementById('assistantExerciseForm');
        const cancelBtn = document.getElementById('assistantExerciseCancelBtn');
        const closeBtn = document.getElementById('assistantExerciseModalClose');
        const subjectSelect = document.getElementById('assistantExerciseSubject');
        const topicInput = document.getElementById('assistantExerciseTopic');
        const countInput = document.getElementById('assistantExerciseCount');

        if (!modal || !form || !cancelBtn || !closeBtn || !subjectSelect || !topicInput || !countInput) {
            resolve({ error: 'Não consegui carregar o painel de exercícios.' });
            return;
        }

        let finished = false;
        const cleanup = () => {
            form.removeEventListener('submit', handleSubmit);
            cancelBtn.removeEventListener('click', handleCancel);
            closeBtn.removeEventListener('click', handleCancel);
            modal.removeEventListener('click', handleOverlayClick);
        };
        const done = (payload) => {
            if (finished) return;
            finished = true;
            cleanup();
            closeExerciseModal(state);
            resolve(payload);
        };
        const handleCancel = () => done({ cancelled: true });
        const handleOverlayClick = (event) => {
            if (event.target === modal || event.target.classList.contains('modal-overlay')) handleCancel();
        };
        const handleSubmit = (event) => {
            event.preventDefault();
            done({
                subjectName: subjectSelect.value,
                topic: String(topicInput.value || '').trim(),
                questionCount: Math.max(3, Math.min(10, Number(countInput.value || 6) || 6))
            });
        };

        form.addEventListener('submit', handleSubmit);
        cancelBtn.addEventListener('click', handleCancel);
        closeBtn.addEventListener('click', handleCancel);
        modal.addEventListener('click', handleOverlayClick);
    });
}

async function handleQuickAction(action, button, state) {
    if (state.busy) return;

    state.busy = true;
    setButtonLoading(button, true, 'A processar...');
    setAssistantStatus('A processar ação...', true);
    clearPlaceholder();
    setTypingIndicator(true);

    try {
        let result = { ok: false, text: 'Ação não suportada.' };
        if (action === 'analyze') result = await assistantService.analyzeProgress();
        if (action === 'suggest') {
            const suggestionPreferences = await askSuggestionPreferencesPanel(state);
            if (suggestionPreferences?.cancelled) result = { ok: false, cancelled: true, text: 'Operação cancelada.' };
            else if (suggestionPreferences?.error) result = { ok: false, text: suggestionPreferences.error };
            else result = await assistantService.getRecommendations(suggestionPreferences);
        }
        if (action === 'quiz') {
            const quizPreferences = await askQuizPreferencesPanel(state);
            if (quizPreferences?.cancelled) result = { ok: false, cancelled: true, text: 'Operação cancelada.' };
            else if (quizPreferences?.error) result = { ok: false, text: quizPreferences.error };
            else result = await assistantService.generateQuizWithOptions(quizPreferences);
        }
        if (action === 'exercise') {
            const exercisePreferences = await askExercisePreferencesPanel(state);
            if (exercisePreferences?.cancelled) result = { ok: false, cancelled: true, text: 'Operação cancelada.' };
            else if (exercisePreferences?.error) result = { ok: false, text: exercisePreferences.error };
            else result = await assistantService.generateExercisesWithOptions(exercisePreferences);
        }
        if (action === 'help') result = await assistantService.showHelp();
        if (action === 'add-subject') result = await assistantService.addSubjectFromPrompts();

        setAssistantStatus(result.ok ? 'Pronto' : 'Atenção', false);

        if (result.cancelled) {
            showToast('Operação cancelada.', 'info');
            return;
        }

        const text = result.ok ? result.text : `Erro: ${result.text}`;
        appendChatMessage('assistant', text);
        persistMessage('assistant', text);

        if (!result.ok) showToast('Não foi possível concluir a ação.', 'error');
    } catch (error) {
        console.error('Quick action failed', error);
        appendChatMessage('assistant', `Erro: ${error.message || error}`);
        persistMessage('assistant', `Erro: ${error.message || error}`);
        setAssistantStatus('Atenção', false);
        showToast('Não foi possível concluir a ação.', 'error');
    } finally {
        state.busy = false;
        setTypingIndicator(false);
        setButtonLoading(button, false);
    }
}

function bindEvents(state) {
    const form = document.getElementById('chatForm');
    const input = document.getElementById('messageInput');
    const submitBtn = document.getElementById('chatSubmitBtn');
    const quickActionButtons = document.querySelectorAll('#assistantQuickActions [data-action]');
    const clearBtn = document.getElementById('chatClearBtn');
    const closeCapabilitiesBtn = document.getElementById('closeCapabilitiesBtn');

    if (form && input && submitBtn) {
        form.addEventListener('submit', async (event) => {
            event.preventDefault();
            if (state.busy) return;

            const text = input.value.trim();
            if (!text) return;

            input.value = '';
            setButtonLoading(submitBtn, true, 'Enviando...');
            await sendMessage(text, state);
            setButtonLoading(submitBtn, false);
        });
    }

    quickActionButtons.forEach((button) => {
        button.addEventListener('click', async () => {
            await handleQuickAction(button.dataset.action, button, state);
        });
    });

    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            if (state.busy) return;
            clearChatHistory();
        });
    }

    if (closeCapabilitiesBtn) {
        closeCapabilitiesBtn.addEventListener('click', () => toggleCapabilitiesBubble(false));
    }

    document.addEventListener('keydown', (event) => {
        if (event.key !== 'Escape') return;
        if (state.quizPanelOpen) closeQuizModal(state);
        if (state.suggestPanelOpen) closeSuggestModal(state);
        if (state.exercisePanelOpen) closeExerciseModal(state);
    });
}

async function renderAssistente() {
    const target = document.getElementById('view');
    if (!target) return;

    target.innerHTML = renderAssistantLayout();
    const state = getInitialState();
    loadProviderBadge(state).catch((error) => console.warn('Failed to load provider badge', error));
    mountHistory();
    bindEvents(state);
}

export default renderAssistente;
