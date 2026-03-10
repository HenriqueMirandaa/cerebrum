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
        </section>
    `;
}

function getInitialState() {
    return {
        busy: false
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
        if (action === 'suggest') result = await assistantService.getRecommendations();
        if (action === 'quiz') result = await assistantService.generateQuiz();
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
