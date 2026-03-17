import { escapeHtml } from '../utils/helpers.js';
import { createAssistantService } from '../services/assistant-service.js';
import { setButtonLoading, showToast } from '../services/ui-service.js';

const assistantService = createAssistantService();
const HISTORY_KEY_PREFIX = 'cerebrum_chat_history';
const MAX_HISTORY_ITEMS = 200;
const AI_CAPABILITIES = [
    'Conversa natural sobre estudos (sem comandos rigidos).',
    'Entende pedidos de plano de estudo com data de exame.',
    'Extrai nome da materia, horas e data automaticamente.',
    'Ajusta plano por disponibilidade real (por dia e por semana).',
    'Calcula carga diaria/semanal e capacidade ate o exame.',
    'Sinaliza quando a disponibilidade e insuficiente.',
    'Gera recomendacoes personalizadas de estudo.',
    'Faz analise de progresso geral.',
    'Mostra status de materia especifica.',
    'Gera quiz rapido por materia.',
    'Consulta cronograma e proxima sessao.'
];

function renderAssistantLayout() {
    return `
        <section class="assistant-workspace">
            <div class="assistant-header">
                <h2 class="assistant-title">Assistente IA</h2>
                <p class="assistant-subtitle">Assistente local (client-side) para apoio ao estudo diario.</p>
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
                    <h3 class="text-lg font-semibold mb-3">Acoes Rapidas</h3>
                    <div class="space-y-2" id="assistantQuickActions">
                        <button data-action="suggest" class="btn w-full">Sugestoes de Estudo</button>
                        <button data-action="quiz" class="btn w-full">Gerar Quiz Rapido</button>
                        <button data-action="help" class="btn w-full">Mostrar Comandos</button>
                        <button type="button" class="btn w-full" id="showCapabilitiesBtn">Ver Capacidades da IA</button>
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
                                <h3 class="assistant-quiz-modal__title" id="assistantQuizModalTitle">Configurar Quiz Rapido</h3>
                                <p class="assistant-quiz-modal__subtitle">Escolhe como queres gerar o quiz antes de enviar para a IA.</p>
                            </div>
                            <button type="button" class="assistant-quiz-modal__close" id="assistantQuizModalClose" aria-label="Fechar">
                                <i class="fas fa-times"></i>
                            </button>
                        </div>
                        <form id="assistantQuizForm" class="assistant-quiz-modal__body">
                            <div class="assistant-quiz-mode">
                                <button type="button" class="assistant-quiz-choice is-active" data-quiz-mode="specific">
                                    <span class="assistant-quiz-choice__title">Quiz especifico</span>
                                    <span class="assistant-quiz-choice__text">Escolhes a materia e o tema.</span>
                                </button>
                                <button type="button" class="assistant-quiz-choice" data-quiz-mode="random">
                                    <span class="assistant-quiz-choice__title">Quiz aleatorio</span>
                                    <span class="assistant-quiz-choice__text">A IA sorteia um tema coerente automaticamente.</span>
                                </button>
                            </div>
                            <input type="hidden" id="assistantQuizMode" value="specific">
                            <div class="assistant-quiz-fields" id="assistantQuizFields">
                                <label class="assistant-quiz-field">
                                    <span class="assistant-quiz-field__label">Materia</span>
                                    <select id="assistantQuizSubject" class="form-input"></select>
                                </label>
                                <label class="assistant-quiz-field">
                                    <span class="assistant-quiz-field__label">Tema</span>
                                    <select id="assistantQuizTopic" class="form-input"></select>
                                </label>
                            </div>
                            <div class="assistant-quiz-summary hidden" id="assistantQuizSummary">
                                No modo aleatorio, a IA escolhe uma materia prioritaria e um tema curto e coerente para revisao.
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
                                <h3 class="assistant-quiz-modal__title" id="assistantSuggestModalTitle">Sugestoes de Estudo</h3>
                                <p class="assistant-quiz-modal__subtitle">Escolhe o foco das recomendacoes para a IA ajustar a resposta.</p>
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
                                    <span class="assistant-quiz-choice__text">Distribuicao de foco para os proximos dias.</span>
                                </button>
                                <button type="button" class="assistant-quiz-choice" data-suggest-focus="exam">
                                    <span class="assistant-quiz-choice__title">Proxima prova</span>
                                    <span class="assistant-quiz-choice__text">Prioridade guiada pela prova mais urgente.</span>
                                </button>
                            </div>
                            <input type="hidden" id="assistantSuggestFocus" value="today">
                            <div class="assistant-quiz-modal__actions">
                                <button type="button" class="btn btn-secondary" id="assistantSuggestCancelBtn">Cancelar</button>
                                <button type="submit" class="btn btn-primary" id="assistantSuggestSubmitBtn">Ver Sugestoes</button>
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
        quizPanelOpen: false,
        suggestPanelOpen: false
    };
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
            <p>Ola! Pergunte algo para comecar (ex: "recomendacoes", "analise", "quiz").</p>
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
    if (forceOpen === true) {
        bubble.classList.remove('hidden');
        return;
    }
    if (forceOpen === false) {
        bubble.classList.add('hidden');
        return;
    }
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

async function sendMessage(text, state) {
    clearPlaceholder();
    appendChatMessage('user', text);
    persistMessage('user', text);

    state.busy = true;
    setAssistantStatus('A processar...', true);
    setTypingIndicator(true);

    const response = await assistantService.ask(text);

    setTypingIndicator(false);
    appendChatMessage('assistant', response.ok ? response.text : `Erro: ${response.text}`);
    persistMessage('assistant', response.ok ? response.text : `Erro: ${response.text}`);
    setAssistantStatus(response.ok ? 'Pronto' : 'Erro de processamento', false);
    state.busy = false;

    if (!response.ok) {
        showToast('Falha ao obter resposta do assistente.', 'error');
    }
}

async function askQuizPreferences() {
    const modeRaw = window.prompt(
        'Quiz rapido:\n1 - Quiz especifico\n2 - Quiz aleatorio',
        '1'
    );

    if (modeRaw === null) return { cancelled: true };

    const normalizedMode = String(modeRaw).trim().toLowerCase();
    if (normalizedMode === '2' || normalizedMode === 'aleatorio' || normalizedMode === 'aleatório') {
        return { random: true };
    }

    const subjectResult = await assistantService.getQuizSubjects();
    if (!subjectResult.ok) return { error: subjectResult.text };
    if (!subjectResult.subjects.length) {
        return { error: 'Nao encontrei materias ativas para montar um quiz especifico.' };
    }

    const subjectMenu = subjectResult.subjects
        .map((subject, index) => `${index + 1} - ${subject.name}`)
        .join('\n');
    const selectedSubjectRaw = window.prompt(
        `Escolhe a materia do quiz:\n${subjectMenu}`,
        '1'
    );

    if (selectedSubjectRaw === null) return { cancelled: true };

    const subjectIndex = Number(String(selectedSubjectRaw).trim()) - 1;
    const selectedSubject = subjectResult.subjects[subjectIndex]
        || subjectResult.subjects.find((subject) => subject.name.toLowerCase() === String(selectedSubjectRaw).trim().toLowerCase());

    if (!selectedSubject) {
        return { error: 'Nao consegui identificar a materia escolhida.' };
    }

    const topicsResult = assistantService.getQuizTopicSuggestions(selectedSubject.name);
    const topicMenu = (topicsResult.topics || [])
        .map((topic, index) => `${index + 1} - ${topic}`)
        .join('\n');
    const selectedTopicRaw = window.prompt(
        `Escolhe o tema para ${selectedSubject.name}:\n${topicMenu}\n\nDeixa vazio para sortear um tema.`,
        ''
    );

    if (selectedTopicRaw === null) return { cancelled: true };

    const normalizedTopic = String(selectedTopicRaw).trim();
    if (!normalizedTopic) {
        return { subjectName: selectedSubject.name, random: true };
    }

    const topicIndex = Number(normalizedTopic) - 1;
    const selectedTopic = (topicsResult.topics || [])[topicIndex] || normalizedTopic;

    return {
        subjectName: selectedSubject.name,
        topic: selectedTopic
    };
}

function getQuizModal() {
    return document.getElementById('assistantQuizModal');
}

function getSuggestModal() {
    return document.getElementById('assistantSuggestModal');
}

function closeQuizModal(state) {
    const modal = getQuizModal();
    if (!modal) return;
    modal.classList.add('hidden');
    modal.setAttribute('aria-hidden', 'true');
    state.quizPanelOpen = false;
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

async function openQuizModal(state) {
    const subjectResult = await assistantService.getQuizSubjects();
    if (!subjectResult.ok) return { error: subjectResult.text };
    if (!subjectResult.subjects.length) {
        return { error: 'Nao encontrei materias ativas para montar um quiz.' };
    }

    state.quizSubjects = subjectResult.subjects;
    const subjectSelect = document.getElementById('assistantQuizSubject');
    const modal = getQuizModal();
    if (!subjectSelect || !modal) return { error: 'Nao consegui abrir o painel do quiz.' };

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
            resolve({ error: 'Nao consegui carregar o painel do quiz.' });
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
            if (modeInput.value === 'random') {
                done({ random: true });
                return;
            }

            done({
                subjectName: subjectSelect.value,
                topic: topicSelect.value
            });
        };

        form.addEventListener('submit', handleSubmit);
        cancelBtn.addEventListener('click', handleCancel);
        closeBtn.addEventListener('click', handleCancel);
        subjectSelect.addEventListener('change', handleSubjectChange);
        modeButtons.forEach((button) => button.addEventListener('click', handleModeClick));
        modal.addEventListener('click', handleOverlayClick);
    });
}

function closeSuggestModal(state) {
    const modal = getSuggestModal();
    if (!modal) return;
    modal.classList.add('hidden');
    modal.setAttribute('aria-hidden', 'true');
    state.suggestPanelOpen = false;
}

function setSuggestFocus(focus) {
    const hiddenFocusInput = document.getElementById('assistantSuggestFocus');
    const choices = document.querySelectorAll('[data-suggest-focus]');

    if (hiddenFocusInput) hiddenFocusInput.value = focus;
    choices.forEach((button) => {
        button.classList.toggle('is-active', button.dataset.suggestFocus === focus);
    });
}

async function askSuggestionPreferencesPanel(state) {
    const modal = getSuggestModal();
    if (!modal) return { error: 'Nao consegui abrir o painel de sugestoes.' };

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
            resolve({ error: 'Nao consegui carregar o painel de sugestoes.' });
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

async function handleQuickAction(action, button, state) {
    if (state.busy) return;

    state.busy = true;
    setButtonLoading(button, true, 'A processar...');
    setAssistantStatus('A processar acao...', true);
    clearPlaceholder();
    setTypingIndicator(true);

    try {
        let result = { ok: false, text: 'Acao nao suportada.' };
        if (action === 'analyze') result = await assistantService.analyzeProgress();
        if (action === 'suggest') {
            const suggestionPreferences = await askSuggestionPreferencesPanel(state);
            if (suggestionPreferences?.cancelled) {
                result = { ok: false, cancelled: true, text: 'Operacao cancelada.' };
            } else if (suggestionPreferences?.error) {
                result = { ok: false, text: suggestionPreferences.error };
            } else {
                result = await assistantService.getRecommendations(suggestionPreferences);
            }
        }
        if (action === 'quiz') {
            const quizPreferences = await askQuizPreferencesPanel(state);
            if (quizPreferences?.cancelled) {
                result = { ok: false, cancelled: true, text: 'Operacao cancelada.' };
            } else if (quizPreferences?.error) {
                result = { ok: false, text: quizPreferences.error };
            } else {
                result = await assistantService.generateQuizWithOptions(quizPreferences);
            }
        }
        if (action === 'help') result = await assistantService.showHelp();
        if (action === 'add-subject') result = await assistantService.addSubjectFromPrompts();

        setAssistantStatus(result.ok ? 'Pronto' : 'Atencao', false);

        if (result.cancelled) {
            showToast('Operacao cancelada.', 'info');
            return;
        }

        const text = result.ok ? result.text : `Erro: ${result.text}`;
        appendChatMessage('assistant', text);
        persistMessage('assistant', text);

        if (!result.ok) {
            showToast('Nao foi possivel concluir a acao.', 'error');
        }
    } catch (error) {
        console.error('Quick action failed', error);
        appendChatMessage('assistant', `Erro: ${error.message || error}`);
        persistMessage('assistant', `Erro: ${error.message || error}`);
        setAssistantStatus('Atencao', false);
        showToast('Nao foi possivel concluir a acao.', 'error');
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
    const showCapabilitiesBtn = document.getElementById('showCapabilitiesBtn');
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

    if (showCapabilitiesBtn) {
        showCapabilitiesBtn.addEventListener('click', () => {
            toggleCapabilitiesBubble();
        });
    }

    if (closeCapabilitiesBtn) {
        closeCapabilitiesBtn.addEventListener('click', () => {
            toggleCapabilitiesBubble(false);
        });
    }

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && state.quizPanelOpen) {
            closeQuizModal(state);
        }
        if (event.key === 'Escape' && state.suggestPanelOpen) {
            closeSuggestModal(state);
        }
    });
}

async function renderAssistente() {
    const target = document.getElementById('view');
    if (!target) return;

    target.innerHTML = renderAssistantLayout();
    const state = getInitialState();
    mountHistory();
    bindEvents(state);
}

export default renderAssistente;
