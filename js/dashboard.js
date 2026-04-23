// Dashboard do Utilizador
import api from './api.js';
import { formatHours, formatDate, todayISO } from './utils/helpers.js';
import renderCronogramaView from './views/cronograma.js';
import renderAssistenteView from './views/assistente.js';
import { startConfetti } from './confetti.js'; // <-- novo import
import { setRegionLoading, showToast as showUiToast } from './services/ui-service.js';

const GENERATED_QUIZ_STORAGE_KEY = 'cerebrum_generated_quizzes';
const FERRAMENTAS_TAB_KEY = 'cerebrum_ferramentas_active_tab';
const QUIZ_CREATED_EVENT = 'cerebrum:quiz-created';

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

function escapeHtml(value) {
    return String(value || '').replace(/[&<>"]/g, (char) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;'
    }[char]));
}

function getStoredGeneratedQuizzes() {
    try {
        const parsed = JSON.parse(localStorage.getItem(getGeneratedQuizStorageKey()) || '[]');
        return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
        console.warn('[Dashboard] failed to parse generated quizzes', error);
        return [];
    }
}

function getFerramentasActiveTab() {
    const tab = localStorage.getItem(FERRAMENTAS_TAB_KEY);
    return tab === 'quizzes' ? 'quizzes' : 'focus';
}

function setFerramentasActiveTab(tab) {
    localStorage.setItem(FERRAMENTAS_TAB_KEY, tab === 'quizzes' ? 'quizzes' : 'focus');
}

function formatQuizCreatedAt(isoDate) {
    if (!isoDate) return 'Agora';
    const date = new Date(isoDate);
    if (Number.isNaN(date.getTime())) return 'Agora';
    return date.toLocaleString('pt-PT', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function renderTotalHoursText(hours) {
    const value = Number(hours);
    if (!Number.isFinite(value) || value <= 0) return '';
    return `${formatHours(value)} totais`;
}

function renderDescriptionText(description) {
    const text = String(description || '').trim();
    return text || '';
}

function formatSessionDuration(minutes) {
    const total = Number(minutes) || 0;
    if (total <= 0) return 'Tempo n\u00e3o informado';
    const hours = Math.floor(total / 60);
    const mins = total % 60;
    if (hours > 0 && mins > 0) return `${hours}h ${mins}min`;
    if (hours > 0) return `${hours}h`;
    return `${mins}min`;
}

function formatSessionDateTime(value) {
    if (!value) return 'Sess\u00e3o anterior';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Sess\u00e3o anterior';
    return date.toLocaleString('pt-PT', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function renderSessionHistory(materia) {
    const sessions = Array.isArray(materia.sessoes) ? materia.sessoes.filter(Boolean) : [];
    if (!sessions.length) return '';

    return `
        <details class="subject-sessions mb-4">
            <summary>
                <span><i class="fas fa-history mr-1"></i>Sess\u00f5es anteriores</span>
                <span class="subject-sessions-count">${sessions.length}</span>
            </summary>
            <div class="subject-sessions-list">
                ${sessions.map((sessao) => `
                    <article class="subject-session-item">
                        <div class="subject-session-head">
                            <span>${formatSessionDateTime(sessao.data)}</span>
                            <span>${formatSessionDuration(sessao.duracaoMinutos)}</span>
                        </div>
                        <p>${escapeHtml(sessao.texto || 'Sem t\u00f3picos registados.')}</p>
                    </article>
                `).join('')}
            </div>
        </details>
    `;
}

function renderMateriaCard(materia, options = {}) {
    const completed = (Number(materia.progresso) || 0) >= 100;
    const cardClasses = `subject-card card p-6 border-l-4 ${completed ? 'completed-subject' : ''}`;
    const totalHoursText = renderTotalHoursText(materia.horas_totais);
    const showHistory = options.showHistory !== false;
    const idLiteral = JSON.stringify(String(materia.id));

    return `
        <div class="${cardClasses}" style="border-left-color: ${materia.cor}">
            <div class="flex items-center justify-between mb-4">
                <div class="flex items-center">
                    <div class="w-12 h-12 rounded-lg flex items-center justify-center text-white mr-3" style="background: ${materia.cor}">
                        <i class="${materia.icone}"></i>
                    </div>
                    <div>
                        <div class="font-semibold">${escapeHtml(materia.nome)}</div>
                        ${totalHoursText ? `<div class="text-sm text-gray-500">${escapeHtml(totalHoursText)}</div>` : ''}
                    </div>
                </div>
            </div>
            <div class="mb-4">
                <div class="flex justify-between text-sm mb-1">
                    <span>Progresso</span>
                    <span>${materia.progresso}%</span>
                </div>
                <div class="progress-bar">
                    <div class="progress-fill" style="width: ${materia.progresso}%"></div>
                </div>
            </div>
            <div class="dashboard-subject-meta text-sm text-gray-600 mb-4">
                <div>
                    <i class="fas fa-clock mr-1"></i>
                    ${formatHours(materia.horas_estudadas)} estudadas
                </div>
                <div>
                    ${materia.data_exame ? `Prova: ${formatDate(materia.data_exame)}` : 'Sem data'}
                </div>
            </div>
            ${showHistory ? renderSessionHistory(materia) : ''}
            <div class="flex gap-2">
                ${ completed ? `
                    <button onclick='dashboard.removerMateria(${idLiteral})' class="btn-secondary text-sm py-2 px-3">
                        <i class="fas fa-trash"></i>
                    </button>
                ` : `
                    <button onclick='dashboard.atualizarProgresso(${idLiteral})' class="btn-primary flex-1 text-sm py-2">
                        <i class="fas fa-edit mr-1"></i>
                        Progresso
                    </button>
                    <button onclick='dashboard.removerMateria(${idLiteral})' class="btn-secondary text-sm py-2 px-3">
                        <i class="fas fa-trash"></i>
                    </button>
                `}
            </div>
        </div>
    `;
}

function renderQuizLibrary(quizzes) {
    if (!quizzes.length) {
        return `
            <div class="card p-6">
                <h3 class="text-xl font-semibold mb-3">Quizzes Gerados pela IA</h3>
                <p class="text-gray-500">Ainda nÃƒÂ£o existem quizzes nesta biblioteca.</p>
                <p class="text-sm text-gray-400 mt-2">PeÃƒÂ§a no assistente algo como: "Gere um quiz de 5 perguntas de HistÃƒÂ³ria sobre a RevoluÃƒÂ§ÃƒÂ£o Industrial".</p>
            </div>
        `;
    }

    return `
        <div class="space-y-4">
            ${quizzes.map((quiz) => `
                <article class="card p-6">
                    <div class="flex flex-col md:flex-row md:items-start md:justify-between gap-3 mb-4">
                        <div>
                            <h3 class="text-xl font-semibold">${escapeHtml(quiz.title || `Quiz de ${quiz.subject || 'Estudos Gerais'}`)}</h3>
                            <p class="text-sm text-gray-500 mt-1">${escapeHtml(quiz.subject || 'Geral')} - ${escapeHtml(quiz.topic || 'Revisao geral')} - ${quiz.questionCount || (quiz.questions || []).length || 0} perguntas</p>
                        </div>
                        <div class="text-sm text-gray-400">Criado em ${formatQuizCreatedAt(quiz.createdAt)}</div>
                    </div>
                    <form class="space-y-4" data-quiz-form data-quiz-id="${escapeHtml(quiz.id || '')}">
                        ${(quiz.questions || []).map((question, index) => `
                            <section class="rounded-xl border border-white/10 bg-slate-950/30 p-4" data-quiz-question data-question-id="${escapeHtml(question.id || '')}" data-correct-index="${question.answerIndex}">
                                <div class="font-medium mb-3">${index + 1}. ${escapeHtml(question.prompt)}</div>
                                <div class="space-y-2">
                                    ${(question.options || []).map((option, optionIndex) => `
                                        <label class="quiz-option-row rounded-lg border border-white/10 px-3 py-2 text-sm text-gray-300 flex items-start gap-3 cursor-pointer" data-option-row data-option-index="${optionIndex}">
                                            <input type="radio" name="quiz_${escapeHtml(quiz.id || 'quiz')}_${escapeHtml(question.id || `q_${index}`)}" value="${optionIndex}" class="mt-1" />
                                            <span>${String.fromCharCode(65 + optionIndex)}. ${escapeHtml(option)}</span>
                                        </label>
                                    `).join('')}
                                </div>
                                <p class="quiz-question-feedback text-xs text-gray-400 mt-3 hidden"></p>
                            </section>
                        `).join('')}
                        <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-3 pt-2">
                            <div class="quiz-result-summary text-sm text-gray-400" data-quiz-summary>Selecione uma resposta em cada pergunta e finalize o quiz.</div>
                            <button type="submit" class="btn-primary" data-quiz-submit>Finalizar Quiz</button>
                        </div>
                    </form>
                </article>
            `).join('')}
        </div>
    `;
}

class Dashboard {
    constructor() {
        this.currentView = 'inicio';
        this.minhasDisciplinas = [];
        this.disciplinasDisponiveis = [];
        this.mobileSidebarMedia = window.matchMedia('(max-width: 1024px)');
        this.init();
    }

    async init() {
        await this.checkAuth();
        this.setupEventListeners();
        // If not authenticated (we showed banner earlier), do not try loading views that call protected endpoints
        if (!this.user) return;
        // load optional data and show initial view
        if (this.loadUserData) await this.loadUserData();
        this.showView('inicio');
    }

    async checkAuth() {
        // Prefer token-based auth first (so testing works immediately with JWT)
        const token = localStorage.getItem('cerebrum_token');
        if (token) {
            try {
                // Use module-scoped api; set token on the API client so subsequent requests include it
                try { api.setToken(token); } catch (e) { /* fallback */ }
                const result = await api.getProfile();
                this.user = result.user || {};
                this.updateUserInfo();
                return;
            } catch (err) {
                console.warn('[Dashboard] token-based profile failed, falling back to session:', err);
            }
        }

        try {
            const result = await api.getProfile();
            this.user = result.user || {};
            this.updateUserInfo();
        } catch (error) {
            // se nÃƒÂ£o autenticado, redireciona para login
            console.warn('[Dashboard] checkAuth failed:', error);
            // Already attempted token-based fetch first; if we reach here, both token and session methods failed.
            // Instead of redirecting automatically, show a persistent banner and allow the user to logout manually.
            this.user = null;
            this.updateUserInfo();
            this.showUnauthBanner();
        }
    }

    showUnauthBanner() {
        // Avoid creating multiple banners
        if (document.getElementById('unauth-banner')) return;
        const banner = document.createElement('div');
        banner.id = 'unauth-banner';
        banner.style.position = 'fixed';
        banner.style.top = '0';
        banner.style.left = '0';
        banner.style.right = '0';
        banner.style.background = '#fffbdd';
        banner.style.borderBottom = '1px solid #f0e1a0';
        banner.style.color = '#6b4e00';
        banner.style.padding = '12px';
        banner.style.zIndex = '9998';
        banner.style.display = 'flex';
        banner.style.alignItems = 'center';
        banner.style.justifyContent = 'space-between';
        banner.innerHTML = `
            <div style="display:flex;gap:12px;align-items:center;">
                <strong>VocÃƒÂª nÃƒÂ£o estÃƒÂ¡ autenticado.</strong>
                <span>Se deseja continuar, faÃƒÂ§a login novamente. Para voltar ao login, clique em Sair.</span>
            </div>
            <div style="display:flex;gap:8px;align-items:center;">
                <button id="unauth-retry" class="btn-secondary" style="padding:6px 10px;border-radius:6px;border:1px solid #d0c08a;background:#fff;">Tentar novamente</button>
                <button id="unauth-logout" class="btn-primary" style="padding:6px 10px;border-radius:6px;background:#e63946;color:#fff;border:none;">Sair</button>
            </div>
        `;
        document.body.appendChild(banner);

        document.getElementById('unauth-retry').addEventListener('click', async () => {
            // remove banner and retry auth
            this.removeUnauthBanner();
            await this.checkAuth();
        });

        document.getElementById('unauth-logout').addEventListener('click', async () => {
            // trigger existing logout flow (if button exists) otherwise perform redirect
            const logoutBtn = document.getElementById('logoutBtn');
            try {
                if (logoutBtn) logoutBtn.click(); else {
                    // fallback: call API logout and redirect
                    try { await api.logout(); } catch (e) { /* ignore */ }
                    let basePath = window.location.pathname;
                    if (!basePath.endsWith('/')) basePath = basePath.substring(0, basePath.lastIndexOf('/') + 1);
                    window.location.href = window.location.origin + basePath + 'index.html';
                }
            } catch (err) {
                console.error('[Dashboard] unauth-logout failed', err);
            }
        });
    }

    removeUnauthBanner() {
        const el = document.getElementById('unauth-banner');
        if (el) el.remove();
    }

    setupEventListeners() {
        this.setupMobileSidebar();

        // NavegaÃƒÂ§ÃƒÂ£o
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                const view = item.dataset.view;
                this.showView(view);
                document.querySelectorAll('.nav-item').forEach(nav => nav.classList.remove('active'));
                item.classList.add('active');
                this.closeMobileSidebar();
            });
        });

        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', async () => {
                try {
                    const ok = await (window.showReactConfirm ? window.showReactConfirm({ message: 'Tem certeza que deseja sair?' }) : (window.SiteUI && window.SiteUI.confirm ? window.SiteUI.confirm('Tem certeza que deseja sair?') : Promise.resolve(confirm('Tem certeza que deseja sair?'))));
                    if (!ok) return;
                } catch (e) {
                    // fallback
                    if (!confirm('Tem certeza que deseja sair?')) return;
                }
                try {
                    await api.logout();
                } catch (err) {
                    console.warn('Logout falhou via API, tentando limpar localmente', err);
                }
                try { api.setToken(null); } catch (e) { localStorage.removeItem('cerebrum_token'); }
                window.location.href = 'index.html';
            });
        }

        window.addEventListener(QUIZ_CREATED_EVENT, (event) => {
            const quiz = event.detail && event.detail.quiz ? event.detail.quiz : null;
            setFerramentasActiveTab('quizzes');
            this._showToast(
                quiz
                    ? `Quiz criado: ${quiz.subject || 'Geral'} - ${quiz.topic || 'Revisao geral'}`
                    : 'Quiz criado com sucesso.',
                'success',
                4200
            );
            if (this.currentView === 'ferramentas') {
                this.renderFerramentas().catch((error) => console.warn('Failed to refresh ferramentas after quiz creation', error));
            }
        });
    }

    setupMobileSidebar() {
        const body = document.body;
        const menuBtn = document.getElementById('mobileMenuBtn');
        const closeBtn = document.getElementById('mobileSidebarClose');
        const overlay = document.getElementById('dashboardSidebarOverlay');
        const setMenuState = (expanded) => {
            if (!menuBtn) return;
            menuBtn.setAttribute('aria-expanded', expanded ? 'true' : 'false');
            menuBtn.setAttribute('aria-label', expanded ? 'Menu aberto' : 'Abrir menu');
        };

        const openSidebar = () => {
            if (this.mobileSidebarMedia.matches) {
                body.classList.add('sidebar-open');
                setMenuState(true);
                return;
            }

            body.classList.remove('sidebar-desktop-collapsed');
            setMenuState(true);
        };

        const closeSidebar = () => {
            if (this.mobileSidebarMedia.matches) {
                body.classList.remove('sidebar-open');
                setMenuState(false);
                return;
            }

            body.classList.add('sidebar-desktop-collapsed');
            setMenuState(false);
        };

        this.openMobileSidebar = openSidebar;
        this.closeMobileSidebar = closeSidebar;

        setMenuState(false);

        if (menuBtn) menuBtn.addEventListener('click', openSidebar);
        if (closeBtn) closeBtn.addEventListener('click', closeSidebar);
        if (overlay) overlay.addEventListener('click', closeSidebar);

        window.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') closeSidebar();
        });

        const handleMediaChange = (event) => {
            body.classList.remove('sidebar-open');
            setMenuState(!event.matches && !body.classList.contains('sidebar-desktop-collapsed'));
        };

        if (typeof this.mobileSidebarMedia.addEventListener === 'function') {
            this.mobileSidebarMedia.addEventListener('change', handleMediaChange);
        } else if (typeof this.mobileSidebarMedia.addListener === 'function') {
            this.mobileSidebarMedia.addListener(handleMediaChange);
        }
    }

    updateUserInfo() {
        const userObj = this.user || {};
        const displayName = userObj.name || userObj.nome || 'Utilizador';
        const username = userObj.username || userObj.email || '';

        const elWelcome = document.getElementById('userWelcome');
        if (elWelcome) elWelcome.textContent = `OlÃƒÂ¡, ${displayName}`;

        const elUserInfo = document.getElementById('userInfo');
        if (elUserInfo) elUserInfo.textContent = `Utilizador: ${username}`;

        const elHeaderName = document.getElementById('headerUserName');
        if (elHeaderName) elHeaderName.textContent = displayName;
    }

    async showView(viewName) {
        this.currentView = viewName;
        const viewRegion = document.getElementById('view');
        if (viewRegion) {
            setRegionLoading(viewRegion, true, 'A carregar vista...');
        }

        // Keep the global particle background active across all views
        try {
            const canvas = document.getElementById('bg-canvas');
            const fallbackCanvas = document.getElementById('bg-canvas-fallback');
            const tpInstance = window.ThreeParticles && window.ThreeParticles._instance;
            const hasCtrl = window.ThreeParticles && typeof window.ThreeParticles.stop === 'function' && typeof window.ThreeParticles.start === 'function';
            if (hasCtrl) {
                if (canvas) canvas.style.display = '';
                if (fallbackCanvas) fallbackCanvas.style.display = '';
                try { if (tpInstance && tpInstance._overlay) tpInstance._overlay.style.display = ''; } catch (e) { /* ignore */ }
                try { if (tpInstance && tpInstance.canvas) tpInstance.canvas.style.display = ''; } catch (e) { /* ignore */ }
                try { window.ThreeParticles.start(); } catch (e) { /* ignore */ }
            }
        } catch (e) {
            console.debug('particle toggle failed', e);
        }

        try {
            switch (viewName) {
                case 'inicio':
                    await this.renderInicio();
                    break;
                case 'minhas-materias':
                    await this.renderMinhasMaterias();
                    break;
                case 'adicionar-materias':
                    await this.renderAdicionarMaterias();
                    break;
                case 'cronograma':
                    await this.renderCronograma();
                    break;
                case 'assistente':
                    await this.renderAssistente();
                    break;
                case 'estatisticas':
                    await this.renderEstatisticas();
                    break;
                case 'ferramentas':
                    await this.renderFerramentas();
                    break;
                default:
                    await this.renderInicio();
            }
        } catch (error) {
            console.error('Erro ao carregar view:', error);
            this.showError('Erro ao carregar a pÃƒÂ¡gina');
        } finally {
            if (viewRegion) {
                setRegionLoading(viewRegion, false);
            }
        }
    }

    async renderInicio() {
        await this.loadMateriasData();

        const stats = this.calculateStats();

        const displayName = (this.user && (this.user.name || this.user.nome)) || 'Utilizador';
        document.getElementById('view').innerHTML = `
            <div class="mb-6 hero card">
                <div class="hero-main">
                    <div class="card-badge" style="background:linear-gradient(135deg,var(--primary),var(--secondary));">${(displayName||'U').slice(0,1)}</div>
                    <div>
                        <div class="title section-title">OlÃƒÂ¡, ${displayName}</div>
                        <div class="subtitle section-subtitle">Continue sua jornada de aprendizado com o Cerebrum</div>
                    </div>
                </div>
                <div class="hero-actions">
                    <button class="btn-uiverse" onclick="dashboard.showView('adicionar-materias')"><i class="fas fa-plus"></i> Adicionar Disciplina</button>
                </div>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                <div class="stat-card">
                    <div class="flex items-center justify-between mb-4">
                        <h3 class="font-semibold text-gray-700 section-subtitle">Disciplinas Ativas</h3>
                        <i class="fas fa-book-open text-purple-500"></i>
                    </div>
                    <div class="text-3xl font-bold mb-2 stat-value">${stats.materiasAtivas}</div>
                    <div class="text-sm text-gray-500 section-subtitle">em andamento</div>
                </div>
                <div class="stat-card">
                    <div class="flex items-center justify-between mb-4">
                        <h3 class="font-semibold text-gray-700 section-subtitle">Progresso Geral</h3>
                        <i class="fas fa-tasks ${stats.progressoGeral > 70 ? 'text-green-500' : stats.progressoGeral > 40 ? 'text-yellow-500' : 'text-red-500'}"></i>
                    </div>
                    <div class="text-3xl font-bold mb-2 stat-value">${stats.progressoGeral}%</div>
                    <div class="progress-bar mb-2">
                        <div class="progress-fill" style="width: ${stats.progressoGeral}%"></div>
                    </div>
                    <div class="text-sm text-gray-500 section-subtitle">mÃƒÂ©dia de conclusÃƒÂ£o</div>
                </div>
                <div class="stat-card">
                    <div class="flex items-center justify-between mb-4">
                        <h3 class="font-semibold text-gray-700 section-subtitle">Horas Estudadas</h3>
                        <i class="fas fa-clock text-blue-500"></i>
                    </div>
                    <div class="text-3xl font-bold mb-2 stat-value">${formatHours(stats.horasEstudadas)}</div>
                    <div class="text-sm text-gray-500 section-subtitle">total dedicado</div>
                </div>
            </div>
        `;
    }

    async renderMinhasMaterias() {
        await this.loadMinhasMaterias();

        document.getElementById('view').innerHTML = `
            <div class="mb-8">
                <h2 class="text-3xl font-bold mb-2 section-title">Minhas Disciplinas</h2>
                <p class="text-gray-600">Gerencie seu progresso nas disciplinas.</p>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" id="materiasGrid">
                ${this.minhasDisciplinas.map(materia => renderMateriaCard(materia)).join('')}
                ${this.minhasDisciplinas.length === 0 ? `
                    <div class="col-span-3 text-center py-12 text-gray-500">
                        <i class="fas fa-book-open text-4xl mb-3 opacity-30"></i>
                        <p class="text-lg mb-2">Nenhuma disciplina registada</p>
                        <p class="text-sm mb-4">Comece adicionando suas primeiras disciplinas para organizar seus estudos.</p>
                        <a href="#" onclick="dashboard.showView('adicionar-materias')" class="btn-primary">
                            <i class="fas fa-plus mr-2"></i>
                            Adicionar Disciplinas
                        </a>
                    </div>
                ` : ''}
            </div>
        `;
    }

    async renderAdicionarMaterias() {
        await this.loadMateriasDisponiveis();

        document.getElementById('view').innerHTML = `
            <div class="mb-8">
                <h2 class="text-3xl font-bold mb-2 section-title">Adicionar Disciplinas</h2>
                <p class="text-gray-600">Escolha as disciplinas que deseja estudar.</p>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" id="materiasDisponiveisGrid">
                ${this.materiasDisponiveis.map(materia => `
                    <div class="card p-6 border-2 border-dashed border-gray-200 hover:border-primary transition">
                        <div class="flex items-center justify-between mb-4">
                            <div class="flex items-center">
                                <div class="w-12 h-12 rounded-lg flex items-center justify-center text-white mr-3" style="background: ${materia.cor}">
                                    <i class="${materia.icone}"></i>
                                </div>
                                <div>
                                    <div class="font-semibold">${materia.nome}</div>
                                    ${renderTotalHoursText(materia.horas_totais) ? `<div class="text-sm text-gray-500">${renderTotalHoursText(materia.horas_totais)}</div>` : ''}
                                </div>
                            </div>
                        </div>
                        ${renderDescriptionText(materia.descricao) ? `<p class="text-sm text-gray-600 mb-4">${renderDescriptionText(materia.descricao)}</p>` : ''}
                        <div class="space-y-3">
                            <div class="form-group">
                                <label class="form-label text-sm">Data do Exame (Opcional)</label>
                                <input type="date" id="dataExame-${materia.id}" class="form-input text-sm" min="${todayISO()}">
                            </div>
                            <button onclick="dashboard.openAddModalFor('${materia.id}')" class="btn-primary w-full text-sm py-2">
                                <i class="fas fa-plus mr-1"></i>
                                Adicionar
                            </button>
                        </div>
                    </div>
                `).join('')}
                ${this.materiasDisponiveis.length === 0 ? `
                    <div class="col-span-3 text-center py-12 text-gray-500">
                        <i class="fas fa-check-circle text-4xl mb-3 opacity-30"></i>
                        <p class="text-lg">VocÃƒÂª jÃƒÂ¡ adicionou todas as disciplinas disponÃƒÂ­veis!</p>
                        <p class="text-sm mt-2">Continue estudando para melhorar seu progresso.</p>
                    </div>
                ` : ''}
            </div>
        `;
    }

    async renderCronograma() {
        try {
            await renderCronogramaView();
        } catch (err) {
            console.error('Erro ao renderizar cronograma via view:', err);
            document.getElementById('view').innerHTML = `<div class="text-center py-12 text-red-500">Erro ao carregar cronograma</div>`;
        }
    }

    async renderAssistente() {
        try {
            await renderAssistenteView();
        } catch (err) {
            console.error('Erro ao renderizar assistente via view:', err);
            document.getElementById('view').innerHTML = `<div class="text-center py-12 text-red-500">Erro ao carregar Assistente IA</div>`;
        }
    }

    async renderEstatisticas() {
        await this.loadMateriasData();
        const stats = this.calculateStats();

        document.getElementById('view').innerHTML = `
            <div class="mb-8">
                <h2 class="text-3xl font-bold mb-2 section-title">EstatÃƒÂ­sticas</h2>
                <p class="text-gray-600">Acompanhe seu desempenho geral.</p>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
                <div class="stat-card">
                    <div class="flex items-center justify-between mb-4">
                        <h3 class="font-semibold text-gray-700">Disciplinas</h3>
                        <i class="fas fa-book text-purple-500"></i>
                    </div>
                    <div class="text-3xl font-bold mb-2">${stats.materiasAtivas}</div>
                    <div class="text-sm text-gray-500">ativas</div>
                </div>
                <div class="stat-card">
                    <div class="flex items-center justify-between mb-4">
                        <h3 class="font-semibold text-gray-700">Progresso</h3>
                        <i class="fas fa-chart-line text-green-500"></i>
                    </div>
                    <div class="text-3xl font-bold mb-2">${stats.progressoGeral}%</div>
                    <div class="text-sm text-gray-500">mÃƒÂ©dio</div>
                </div>
                <div class="stat-card">
                    <div class="flex items-center justify-between mb-4">
                        <h3 class="font-semibold text-gray-700">Horas</h3>
                        <i class="fas fa-clock text-blue-500"></i>
                    </div>
                    <div class="text-3xl font-bold mb-2">${formatHours(stats.horasEstudadas)}</div>
                    <div class="text-sm text-gray-500">estudadas</div>
                </div>
            </div>
            <div class="card p-6">
                <h3 class="text-xl font-semibold mb-4">Progresso por Disciplina</h3>
                <div class="space-y-4">
                    ${this.minhasDisciplinas.map(materia => `
                        <div class="flex items-center justify-between">
                            <div class="flex items-center">
                                <div class="w-8 h-8 rounded-lg flex items-center justify-center text-white mr-3" style="background: ${materia.cor}">
                                    <i class="${materia.icone}"></i>
                                </div>
                                <span class="font-medium">${materia.nome}</span>
                            </div>
                            <div class="text-right">
                                <div class="font-bold">${materia.progresso}%</div>
                                <div class="text-xs text-gray-500">${formatHours(materia.horas_estudadas)} / ${formatHours(materia.horas_totais)}</div>
                            </div>
                        </div>
                        <div class="progress-bar">
                            <div class="progress-fill" style="width: ${materia.progresso}%"></div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    async renderFerramentas() {
        const activeTab = getFerramentasActiveTab();
        const quizzes = getStoredGeneratedQuizzes();
        document.getElementById('view').innerHTML = `
            <div class="mb-8">
                <h2 class="text-3xl font-bold mb-2 section-title">Ferramentas de Estudo</h2>
                <p class="text-gray-600">Recursos para tornar suas sessoes mais produtivas.</p>
            </div>
            <div class="flex flex-wrap gap-3 mb-6">
                <button id="ferramentas-tab-focus" class="${activeTab === 'focus' ? 'btn-primary' : 'btn-secondary'}">Modo Foco</button>
                <button id="ferramentas-tab-quizzes" class="${activeTab === 'quizzes' ? 'btn-primary' : 'btn-secondary'}">Quizzes</button>
            </div>
            <section id="ferramentas-panel-focus" class="${activeTab === 'focus' ? '' : 'hidden'}">
                <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div class="card p-6">
                        <h3 class="text-xl font-semibold mb-4">Modo Foco Imersivo</h3>
                        <p class="text-gray-500 mb-4">Tela limpa, temporizador Pomodoro e sons ambientes opcionais.</p>
                        <div class="space-y-3">
                            <div class="grid grid-cols-2 gap-3">
                                <label class="label-muted">Foco (min)</label>
                                <input id="focus-minutes" type="number" min="1" value="25" class="form-input" />
                                <label class="label-muted">Pausa (min)</label>
                                <input id="break-minutes" type="number" min="1" value="5" class="form-input" />
                            </div>
                            <div>
                                <label class="label-muted">Soundscape</label>
                                <select id="soundscape-select" class="form-input">
                                    <option value="none">Nenhum</option>
                                    <option value="rain">Chuva</option>
                                    <option value="cafe">Cafe</option>
                                    <option value="brown">Ruido Marrom</option>
                                </select>
                            </div>
                            <div class="flex items-center gap-3">
                                <label class="label-muted">Volume</label>
                                <input id="sound-volume" type="range" min="0" max="1" step="0.01" value="0.5" />
                            </div>
                            <div class="flex gap-3 mt-4">
                                <button id="enter-focus-btn" class="btn-primary">Entrar no Modo Foco</button>
                                <button id="open-pomodoro-btn" class="btn-secondary">Abrir Temporizador</button>
                            </div>
                        </div>
                    </div>
                    <div class="card p-6">
                        <h3 class="text-xl font-semibold mb-4">Ajuda rapida</h3>
                        <p class="text-gray-500">O Modo Foco abre uma sobreposicao em tela cheia que remove distracoes. Voce pode usar o temporizador Pomodoro padrao ou personalizar os minutos. Os soundscapes sao carregados dos arquivos locais do projeto.</p>
                        <ul class="mt-4 text-sm text-gray-400 list-disc list-inside">
                            <li>Comece no modo foco e use as pausas para descansar a vista.</li>
                            <li>Experimente diferentes ambientes sonoros para manter o foco.</li>
                            <li>O overlay e reversivel a qualquer momento.</li>
                        </ul>
                    </div>
                </div>
            </section>
            <section id="ferramentas-panel-quizzes" class="${activeTab === 'quizzes' ? '' : 'hidden'}">
                <div class="flex items-center justify-between gap-3 mb-4">
                    <div>
                        <h3 class="text-2xl font-semibold">Biblioteca de Quizzes</h3>
                        <p class="text-sm text-gray-500">Os quizzes criados pela IA aparecem aqui automaticamente.</p>
                    </div>
                    ${quizzes.length ? '<button id="clear-generated-quizzes-btn" class="btn-secondary">Limpar Quizzes</button>' : ''}
                </div>
                ${renderQuizLibrary(quizzes)}
            </section>
        `;
        const focusPanel = document.getElementById('ferramentas-panel-focus');
        const quizzesPanel = document.getElementById('ferramentas-panel-quizzes');
        const focusTabBtn = document.getElementById('ferramentas-tab-focus');
        const quizzesTabBtn = document.getElementById('ferramentas-tab-quizzes');
        const applyFerramentasTabState = (tab) => {
            const safeTab = tab === 'quizzes' ? 'quizzes' : 'focus';
            setFerramentasActiveTab(safeTab);
            if (focusPanel) focusPanel.classList.toggle('hidden', safeTab !== 'focus');
            if (quizzesPanel) quizzesPanel.classList.toggle('hidden', safeTab !== 'quizzes');
            if (focusTabBtn) focusTabBtn.className = safeTab === 'focus' ? 'btn-primary' : 'btn-secondary';
            if (quizzesTabBtn) quizzesTabBtn.className = safeTab === 'quizzes' ? 'btn-primary' : 'btn-secondary';
        };
        if (focusTabBtn) focusTabBtn.addEventListener('click', () => applyFerramentasTabState('focus'));
        if (quizzesTabBtn) quizzesTabBtn.addEventListener('click', () => applyFerramentasTabState('quizzes'));

        const clearQuizzesBtn = document.getElementById('clear-generated-quizzes-btn');
        if (clearQuizzesBtn) {
            clearQuizzesBtn.addEventListener('click', () => {
                localStorage.removeItem(getGeneratedQuizStorageKey());
                setFerramentasActiveTab('quizzes');
                this._showToast('Biblioteca de quizzes limpa.', 'info');
                this.renderFerramentas().catch((error) => console.warn('Failed to rerender ferramentas after clearing quizzes', error));
            });
        }

        document.querySelectorAll('[data-quiz-form]').forEach((form) => {
            form.addEventListener('submit', (event) => {
                event.preventDefault();
                const questionEls = Array.from(form.querySelectorAll('[data-quiz-question]'));
                const unanswered = questionEls.filter((questionEl) => !questionEl.querySelector('input[type="radio"]:checked'));
                if (unanswered.length) {
                    this._showToast('Responda todas as perguntas antes de finalizar o quiz.', 'info');
                    return;
                }

                let correctCount = 0;
                questionEls.forEach((questionEl) => {
                    const correctIndex = Number(questionEl.dataset.correctIndex || 0);
                    const checked = questionEl.querySelector('input[type="radio"]:checked');
                    const selectedIndex = Number(checked ? checked.value : -1);
                    const feedbackEl = questionEl.querySelector('.quiz-question-feedback');
                    const optionRows = Array.from(questionEl.querySelectorAll('[data-option-row]'));

                    optionRows.forEach((row) => {
                        const optionIndex = Number(row.dataset.optionIndex || -1);
                        row.classList.remove('bg-emerald-500/10', 'text-emerald-200', 'border-emerald-400/30', 'bg-red-500/10', 'text-red-200', 'border-red-400/30');
                        if (optionIndex === correctIndex) {
                            row.classList.add('bg-emerald-500/10', 'text-emerald-200', 'border-emerald-400/30');
                        } else if (optionIndex === selectedIndex) {
                            row.classList.add('bg-red-500/10', 'text-red-200', 'border-red-400/30');
                        }
                        const input = row.querySelector('input');
                        if (input) input.disabled = true;
                    });

                    const isCorrect = selectedIndex === correctIndex;
                    if (isCorrect) correctCount += 1;
                    if (feedbackEl) {
                        feedbackEl.classList.remove('hidden', 'text-gray-400', 'text-emerald-300', 'text-red-300');
                        feedbackEl.classList.add(isCorrect ? 'text-emerald-300' : 'text-red-300');
                        feedbackEl.textContent = isCorrect
                            ? 'Resposta correta.'
                            : `Resposta incorreta. ${questionEl.querySelector('[data-option-row][data-option-index="' + correctIndex + '"] span')?.textContent || ''}`;
                    }
                });

                const summaryEl = form.querySelector('[data-quiz-summary]');
                if (summaryEl) {
                    summaryEl.classList.remove('text-gray-400');
                    summaryEl.classList.add(correctCount === questionEls.length ? 'text-emerald-300' : 'text-gray-200');
                    summaryEl.textContent = `Resultado final: ${correctCount}/${questionEls.length} respostas corretas.`;
                }

                const submitBtn = form.querySelector('[data-quiz-submit]');
                if (submitBtn) {
                    submitBtn.disabled = true;
                    submitBtn.textContent = 'Quiz Finalizado';
                }
            });
        });

        // Wire up focus mode handlers
        try {
            const enterBtn = document.getElementById('enter-focus-btn');
            const openPomBtn = document.getElementById('open-pomodoro-btn');
            const soundSelect = document.getElementById('soundscape-select');
            const vol = document.getElementById('sound-volume');
            if (!enterBtn || !openPomBtn || !soundSelect || !vol) return;

            const createNoise = (ctx, type) => {
                if (!ctx) return null;
                const gain = ctx.createGain();
                gain.gain.value = Number(vol.value || 0.5);
                if (type === 'none') return { stop: () => {} };

                if (type === 'brown' || type === 'rain' || type === 'cafe') {
                    const bufferSize = 2 * ctx.sampleRate;
                    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
                    const output = noiseBuffer.getChannelData(0);
                    let lastOut = 0.0;
                    for (let i = 0; i < bufferSize; i++) {
                        const white = Math.random() * 2 - 1;
                        if (type === 'brown') {
                            lastOut = (lastOut + (0.02 * white)) / 1.02;
                            output[i] = lastOut * 3.5; // brown
                        } else {
                            output[i] = white * 0.5; // simple noise
                        }
                    }
                    const noiseSource = ctx.createBufferSource();
                    noiseSource.buffer = noiseBuffer;
                    noiseSource.loop = true;
                    noiseSource.connect(gain).connect(ctx.destination);
                    noiseSource.start(0);
                    return {
                        stop: () => { try { noiseSource.stop(); } catch (e) {} },
                        setVolume: (v) => { try { gain.gain.value = Number(v); } catch (e) {} }
                    };
                }
                return null;
            };

            const buildSoundBaseCandidates = () => {
                const candidates = [];
                const push = (v) => {
                    if (!v) return;
                    const normalized = String(v).trim().replace(/\/+$/, '');
                    if (!normalized) return;
                    if (!candidates.includes(normalized)) candidates.push(normalized);
                };
                push(window.BASE_PATH || '');
                push(window.BASE_URL || '');
                const currentDir = window.location.pathname.replace(/\/[^/]*$/, '');
                push(currentDir);
                const firstSegment = window.location.pathname.split('/').filter(Boolean)[0];
                if (firstSegment) push(`/${firstSegment}`);
                push('');
                return candidates;
            };

            const joinPath = (base, relPath) => {
                const rel = String(relPath || '').replace(/^\/+/, '');
                if (!base) return rel;
                if (/^https?:\/\//i.test(base)) return `${base}/${rel}`;
                return `${base}/${rel}`.replace(/([^:]\/)\/+/g, '$1');
            };

            let soundManifestCache = null;
            let soundBaseCache = null;
            const defaultSoundEntries = [
                { key: 'rain', file: 'rain_loop.mp3', displayName: 'Chuva' },
                { key: 'cafe', file: 'cafe_loop.mp3', displayName: 'Cafe' },
                { key: 'brown', file: 'brown_noise_loop.mp3', displayName: 'Ruido Marrom' }
            ];
            const normalizeManifestEntries = (manifest) => {
                if (!manifest || typeof manifest !== 'object') return [];
                return Object.entries(manifest)
                    .map(([key, cfg]) => ({
                        key: String(key || '').trim(),
                        file: cfg && cfg.file ? String(cfg.file).trim() : '',
                        displayName: cfg && cfg.displayName ? String(cfg.displayName).trim() : ''
                    }))
                    .filter((entry) => entry.key && entry.file);
            };
            const loadSoundManifest = async () => {
                if (soundManifestCache && soundBaseCache !== null) {
                    return { manifest: soundManifestCache, base: soundBaseCache };
                }
                const bases = buildSoundBaseCandidates();
                let lastErr = null;
                for (const base of bases) {
                    const manifestUrl = joinPath(base, 'assets/sounds/soundscapes.json');
                    try {
                        const resp = await fetch(manifestUrl, { cache: 'no-store' });
                        if (!resp.ok) continue;
                        const data = await resp.json();
                        if (data && typeof data === 'object') {
                            soundManifestCache = data;
                            soundBaseCache = base;
                            return { manifest: soundManifestCache, base: soundBaseCache };
                        }
                    } catch (err) {
                        lastErr = err;
                    }
                }
                if (lastErr) console.warn('Falha ao carregar manifesto de soundscapes:', lastErr);
                return { manifest: null, base: '' };
            };

            const getCurrentSoundEntries = async () => {
                const { manifest } = await loadSoundManifest();
                const entries = normalizeManifestEntries(manifest);
                return entries.length > 0 ? entries : defaultSoundEntries;
            };

            const hydrateSoundSelect = async () => {
                const previous = soundSelect.value || 'none';
                const entries = await getCurrentSoundEntries();
                const options = ['<option value="none">Nenhum</option>']
                    .concat(entries.map((entry) => `<option value="${entry.key}">${entry.displayName || entry.key}</option>`));
                soundSelect.innerHTML = options.join('');
                const hasPrevious = entries.some((entry) => entry.key === previous);
                soundSelect.value = hasPrevious ? previous : 'none';
            };
            const resolveSoundFileUrl = async (type) => {
                if (!type || type === 'none') return null;
                const { manifest, base } = await loadSoundManifest();
                const entries = normalizeManifestEntries(manifest);
                const fileFromManifest = entries.find((entry) => entry.key === type)?.file || null;
                if (fileFromManifest) return joinPath(base, 'assets/sounds/' + fileFromManifest);

                const fallbackFile = defaultSoundEntries.find((entry) => entry.key === type)?.file || null;
                if (!fallbackFile) return null;
                if (base) return joinPath(base, 'assets/sounds/' + fallbackFile);
                const bases = buildSoundBaseCandidates();
                for (const candidate of bases) {
                    const probeUrl = joinPath(candidate, 'assets/sounds/' + fallbackFile);
                    try {
                        const resp = await fetch(probeUrl, { method: 'HEAD' });
                        if (resp.ok) return probeUrl;
                    } catch (e) {
                        // ignore and keep trying next candidate
                    }
                }
                return joinPath('', 'assets/sounds/' + fallbackFile);
            };

            // Preload do manifesto para manter play acionado pelo clique sem atraso de rede
            loadSoundManifest().then(() => hydrateSoundSelect()).catch(() => hydrateSoundSelect());

            const openFocusOverlay = () => {
                // create overlay
                const overlay = document.createElement('div');
                overlay.id = 'focus-overlay';
                overlay.style.position = 'fixed';
                overlay.style.inset = '0';
                overlay.style.zIndex = '99999';
                overlay.style.background = '#071022';
                overlay.style.display = 'flex';
                overlay.style.flexDirection = 'column';
                overlay.style.alignItems = 'center';
                overlay.style.justifyContent = 'center';
                overlay.style.color = '#fff';
                overlay.style.gap = '18px';
                overlay.style.padding = '24px';
                overlay.innerHTML = `
                    <div style="text-align:center;max-width:900px;width:100%;">
                        <h1 style="font-size:2.4rem;margin:0 0 8px;">Modo Foco</h1>
                        <div id="focus-timer" style="font-size:5rem;font-weight:700;margin:12px 0;">--:--</div>
                        <div style="display:flex;gap:12px;justify-content:center;">
                            <button id="focus-pause" class="btn-secondary">Pausar</button>
                            <button id="focus-reset" class="btn-secondary">Reset</button>
                            <button id="focus-exit" class="btn-primary">Sair</button>
                        </div>
                    </div>
                `;
                document.body.appendChild(overlay);
                document.body.style.overflow = 'hidden';

                // Pomodoro state
                const focusMinutes = Math.max(1, parseInt(document.getElementById('focus-minutes').value || '25', 10));
                const breakMinutes = Math.max(1, parseInt(document.getElementById('break-minutes').value || '5', 10));
                let mode = 'focus';
                let remaining = focusMinutes * 60;
                let interval = null;
                let audioCtx = null;
                let noiseHandle = null;
                let ambientAudio = null;

                const updateDisplay = () => {
                    const mins = Math.floor(remaining / 60).toString().padStart(2, '0');
                    const secs = (remaining % 60).toString().padStart(2, '0');
                    const el = document.getElementById('focus-timer');
                    if (el) el.textContent = `${mins}:${secs}`;
                };

                const beep = () => {
                    try {
                        const ctx = new (window.AudioContext || window.webkitAudioContext)();
                        const o = ctx.createOscillator();
                        const g = ctx.createGain();
                        o.type = 'sine';
                        o.frequency.value = 880;
                        g.gain.value = 0.001;
                        o.connect(g);
                        g.connect(ctx.destination);
                        o.start();
                        g.gain.exponentialRampToValueAtTime(0.5, ctx.currentTime + 0.01);
                        g.gain.exponentialRampToValueAtTime(0.00001, ctx.currentTime + 0.7);
                        setTimeout(() => { try { o.stop(); ctx.close(); } catch (e) {} }, 900);
                    } catch (e) { console.warn('beep failed', e); }
                };

                const startInterval = () => {
                    if (interval) return;
                    interval = setInterval(() => {
                        remaining -= 1;
                        if (remaining < 0) {
                            beep();
                            // switch mode
                            if (mode === 'focus') {
                                mode = 'break';
                                remaining = breakMinutes * 60;
                            } else {
                                mode = 'focus';
                                remaining = focusMinutes * 60;
                            }
                        }
                        updateDisplay();
                    }, 1000);
                };

                const pauseInterval = () => { if (interval) { clearInterval(interval); interval = null; } };

                // start ambient according to selection
                const startAmbient = async () => {
                    try {
                        const selected = soundSelect.value;
                        if (!selected || selected === 'none') return;

                        const fileUrl = await resolveSoundFileUrl(selected);
                        if (fileUrl) {
                            ambientAudio = new Audio(fileUrl);
                            ambientAudio.loop = true;
                            ambientAudio.preload = 'auto';
                            ambientAudio.volume = Number(vol.value || 0.5);
                            await ambientAudio.play();
                            return;
                        }

                        // fallback if local files are unavailable
                        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
                        noiseHandle = createNoise(audioCtx, selected);
                    } catch (e) {
                        console.warn('audio start failed', e);
                        try {
                            if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
                            noiseHandle = createNoise(audioCtx, soundSelect.value);
                        } catch (err) {
                            console.warn('fallback audio failed', err);
                        }
                    }
                };

                const stopAmbient = () => {
                    try {
                        if (ambientAudio) {
                            ambientAudio.pause();
                            ambientAudio.currentTime = 0;
                            ambientAudio.src = '';
                            ambientAudio = null;
                        }
                        if (noiseHandle && typeof noiseHandle.stop === 'function') noiseHandle.stop();
                        if (audioCtx && typeof audioCtx.close === 'function') audioCtx.close();
                        audioCtx = null; noiseHandle = null;
                    } catch (e) { /* ignore */ }
                };

                // initial display
                updateDisplay();
                // autoplay start
                startInterval();
                startAmbient();

                // controls
                document.getElementById('focus-pause').addEventListener('click', () => {
                    if (interval) { pauseInterval(); document.getElementById('focus-pause').textContent = 'Retomar'; }
                    else { startInterval(); document.getElementById('focus-pause').textContent = 'Pausar'; }
                });
                document.getElementById('focus-reset').addEventListener('click', () => {
                    pauseInterval(); mode = 'focus'; remaining = focusMinutes * 60; updateDisplay(); document.getElementById('focus-pause').textContent = 'Pausar';
                });
                document.getElementById('focus-exit').addEventListener('click', () => {
                    pauseInterval(); stopAmbient(); try { overlay.remove(); document.body.style.overflow = ''; } catch (e) {}
                });

                // keep volume in sync
                vol.addEventListener('input', () => {
                    const nextVolume = Number(vol.value || 0.5);
                    if (ambientAudio) {
                        ambientAudio.volume = nextVolume;
                    } else if (noiseHandle && typeof noiseHandle.setVolume === 'function') {
                        noiseHandle.setVolume(nextVolume);
                    }
                });
            };

            enterBtn.addEventListener('click', () => openFocusOverlay());
            openPomBtn.addEventListener('click', () => openFocusOverlay());

        } catch (e) {
            console.warn('Failed to initialize Ferramentas handlers', e);
        }
    }

    // MÃƒÂ©todos auxiliares
    async loadMateriasData() {
        try {
            const resp1 = await api.getMinhasMaterias();
            // Normalize backend shape to the legacy frontend shape
            const rawMine = resp1.subjects || resp1 || [];
            this.minhasDisciplinas = (rawMine || []).map(s => ({
                id: s.id || s.subject_id || s.id,
                nome: s.nome || s.name || s.name || 'Sem nome',
                descricao: s.descricao || s.description || '',
                progresso: s.progresso != null ? Number(s.progresso) : (s.progress != null ? Number(s.progress) : 0),
                horas_estudadas: (s.tempoEstudado != null) ? (Number(s.tempoEstudado) / 60) : (s.hours_studied != null ? Number(s.hours_studied) : 0),
                horas_totais: s.total_hours != null ? Number(s.total_hours) : (s.horas_totais != null ? Number(s.horas_totais) : null),
                data_exame: s.exam_date || s.data_exame || null,
                sessoes: Array.isArray(s.sessoes || s.sessions) ? (s.sessoes || s.sessions) : [],
                cor: s.color || s.cor || '#6366f1',
                icone: s.icon || s.icone || 'fas fa-book'
            }));

            const resp2 = await api.getMateriasDisponiveis();
            const rawAvail = resp2.subjects || resp2 || [];
            this.materiasDisponiveis = (rawAvail || []).map(s => ({
                id: s.id,
                nome: s.name || s.nome || 'Sem nome',
                descricao: s.description || s.descricao || '',
                horas_totais: s.horas_totais || s.total_hours || null,
                cor: s.color || '#e5e7eb',
                icone: s.icon || 'fas fa-book'
            }));
        } catch (error) {
            console.error('Erro ao carregar matÃƒÂ©rias', error);
        }
    }

    async loadMinhasMaterias() {
        try {
            const resp = await api.getMinhasMaterias();
            const raw = resp.subjects || resp || [];
            this.minhasDisciplinas = (raw || []).map(s => ({
                id: s.id || s.subject_id || s.id,
                nome: s.nome || s.name || 'Sem nome',
                descricao: s.descricao || s.description || '',
                progresso: s.progresso != null ? Number(s.progresso) : (s.progress != null ? Number(s.progress) : 0),
                horas_estudadas: (s.tempoEstudado != null) ? (Number(s.tempoEstudado) / 60) : (s.hours_studied != null ? Number(s.hours_studied) : 0),
                horas_totais: s.total_hours != null ? Number(s.total_hours) : (s.horas_totais != null ? Number(s.horas_totais) : null),
                data_exame: s.exam_date || s.data_exame || null,
                sessoes: Array.isArray(s.sessoes || s.sessions) ? (s.sessoes || s.sessions) : [],
                cor: s.color || s.cor || '#6366f1',
                icone: s.icon || s.icone || 'fas fa-book'
            }));
        } catch (error) {
            console.error('Erro ao carregar minhas matÃƒÂ©rias', error);
        }
    }

    async loadMateriasDisponiveis() {
        try {
            // Use a fixed list of core subjects for the "Adicionar MatÃƒÂ©rias" view.
            // We'll try to fetch available subjects from the backend and, when a
            // fixed subject name already exists server-side, replace the fixed
            // string id with the numeric id from the backend so we use the
            // `/subjects/adicionar` endpoint instead of creating duplicates.
            let backendSubjects = [];
            try {
                const resp = await api.getMateriasDisponiveis();
                backendSubjects = Array.isArray(resp) ? resp : (resp.subjects || []);
            } catch (e) {
                // ignore backend failures and continue with fixed list
                backendSubjects = [];
            }

            const fixed = [
                { id: 'fixed-portugues', nome: 'PortuguÃƒÂªs', descricao: '', horas_totais: null, cor: '#f97316', icone: 'fas fa-book-open' },
                { id: 'fixed-matematica', nome: 'MatemÃƒÂ¡tica', descricao: '', horas_totais: null, cor: '#6366f1', icone: 'fas fa-square-root-alt' },
                { id: 'fixed-ingles', nome: 'InglÃƒÂªs', descricao: '', horas_totais: null, cor: '#06b6d4', icone: 'fas fa-language' },
                { id: 'fixed-historia', nome: 'HistÃƒÂ³ria', descricao: '', horas_totais: null, cor: '#ef4444', icone: 'fas fa-landmark' },
                { id: 'fixed-geografia', nome: 'Geografia', descricao: '', horas_totais: null, cor: '#10b981', icone: 'fas fa-globe-americas' },
                { id: 'fixed-ciencias', nome: 'CiÃƒÂªncias Naturais', descricao: '', horas_totais: null, cor: '#8b5cf6', icone: 'fas fa-flask' },
                { id: 'fixed-fisica-quimica', nome: 'FÃƒÂ­sica e QuÃƒÂ­mica', descricao: '', horas_totais: null, cor: '#ef9a9a', icone: 'fas fa-atom' },
                { id: 'fixed-biologia', nome: 'Biologia', descricao: '', horas_totais: null, cor: '#22c55e', icone: 'fas fa-dna' }
            ];

            // Map fixed list to backend ids when a subject with same name exists
            const mapped = fixed.map(f => {
                const match = (backendSubjects || []).find(b => String(b.name || b.nome || '').toLowerCase() === String(f.nome || '').toLowerCase());
                if (match && (match.id || match.subject_id)) {
                    return {
                        id: match.id || match.subject_id,
                        nome: f.nome,
                        descricao: f.descricao,
                        horas_totais: f.horas_totais,
                        cor: f.cor,
                        icone: f.icone
                    };
                }
                return f;
            });

            this.materiasDisponiveis = mapped;
        } catch (error) {
            console.error('Erro ao carregar matÃƒÂ©rias disponÃƒÂ­veis', error);
        }
    }

    calculateStats() {
        const materiasAtivas = this.minhasDisciplinas.length;
        const horasEstudadas = this.minhasDisciplinas.reduce((s, m) => s + (m.hours_studied || m.horas_estudadas || 0), 0);
        const progressoGeral = this.minhasDisciplinas.length === 0 ? 0 : Math.round(this.minhasDisciplinas.reduce((s, m) => s + (m.progresso || 0), 0) / this.minhasDisciplinas.length);
        return { materiasAtivas, horasEstudadas, progressoGeral };
    }

    async atualizarProgresso(subjectId) {
        try {
            const subj = (this.minhasDisciplinas || []).find(s => String(s.id) === String(subjectId));
            if (subj && Number(subj.progresso || 0) >= 100) {
                this.showError('Disciplina conclu\u00edda - progresso bloqueado');
                return;
            }

            let hours = 0;
            let sessionTopics = '';
            if (window.showHoursPrompt && typeof window.showHoursPrompt === 'function') {
                const res = await window.showHoursPrompt({
                    label: 'Quanto tempo voc\u00ea estudou nesta sess\u00e3o?',
                    defaultValue: '',
                    includeTopics: true,
                    defaultTopics: ''
                });
                if (res === null) return;
                if (typeof res === 'object') {
                    hours = Number(res.hours) || 0;
                    sessionTopics = String(res.topics || '').trim();
                } else {
                    hours = Number(res) || 0;
                }
            } else {
                const val = prompt('Quanto tempo voc\u00ea estudou nesta sess\u00e3o? (HH:MM)');
                if (val === null) return;
                if (val.indexOf(':') !== -1) {
                    const parts = val.split(':').map(s => s.trim());
                    const h = parseInt(parts[0], 10) || 0;
                    const m = parseInt(parts[1], 10) || 0;
                    hours = h + (Math.max(0, Math.min(59, m)) / 60);
                } else {
                    hours = parseFloat(val) || 0;
                }

                const topicsPrompt = prompt('Quais t\u00f3picos estudou nesta sess\u00e3o?');
                if (topicsPrompt === null) return;
                sessionTopics = String(topicsPrompt || '').trim();
            }

            if (hours <= 0 && !sessionTopics) {
                this.showError('Informe o tempo estudado ou os t\u00f3picos da sess\u00e3o');
                return;
            }

            await api.atualizarProgresso({
                subject_id: subjectId,
                hours_increment: hours,
                session_topics: sessionTopics,
                last_studied: new Date().toISOString()
            });
            await this.loadMinhasMaterias();

            const updated = (this.minhasDisciplinas || []).find(s => String(s.id) === String(subjectId));
            const reached = updated && Number(updated.progresso || 0) >= 100;
            const key = `__completed_celebrated_${subjectId}`;
            if (reached && !localStorage.getItem(key)) {
                try {
                    localStorage.setItem(key, '1');
                    startConfetti(3500, { colors: ['rgba(16,185,129,0.95)', 'rgba(124,58,237,0.95)'] });
                } catch(e){ console.warn('confetti failed', e); }
            }

            this.showSuccess('Progresso atualizado');
            this.showView('minhas-materias');
        } catch (error) {
            console.error('atualizarProgresso failed', error);
            this.showError('Erro ao atualizar progresso');
        }
    }

    async adicionarMateria(subjectId, exam_date = null, total_hours = null, color = null) {
        try {
            // Try to read exam_date from an input in the adicionar view if not provided
            try {
                if (!exam_date) {
                    const el = document.getElementById(`dataExame-${subjectId}`);
                    if (el && el.value) exam_date = el.value;
                }
                if (!total_hours) {
                    const th = document.getElementById('add-total-hours') || document.getElementById(`totalHours-${subjectId}`);
                    if (th && th.value) total_hours = Number(th.value);
                }
                if (!color) {
                    const col = document.getElementById('add-color') || document.getElementById(`color-${subjectId}`);
                    if (col && col.value) color = col.value;
                }
            } catch (e) { /* ignore DOM read errors */ }

            // If subjectId is numeric (existing subject id), use the adicionar endpoint.
            // If it's a fixed id (string) or otherwise non-numeric, call the "sugerir"
            // endpoint to create the subject (if missing) and add it to the user.
            const isNumeric = (val) => (typeof val === 'number') || (/^\d+$/.test(String(val)));
            if (isNumeric(subjectId)) {
                await api.adicionarMateria(subjectId, exam_date || null, typeof total_hours !== 'undefined' ? total_hours : null, color || null);
            } else {
                // find the fixed subject by id to get its name and metadata
                const fixed = (this.materiasDisponiveis || []).find(m => String(m.id) === String(subjectId));
                const name = fixed ? fixed.nome : String(subjectId);
                const payload = { name, description: fixed ? fixed.descricao : null, exam_date: exam_date || null, total_hours: typeof total_hours !== 'undefined' ? total_hours : (fixed ? fixed.horas_totais : null), metas: [], color: color || (fixed ? fixed.cor : '#6366f1') };
                await api.request('/subjects/sugerir', { method: 'POST', body: JSON.stringify(payload) });
            }

            this.showSuccess('Disciplina adicionada');
            await this.loadMateriasData();
            this.showView('minhas-materias');
        } catch (error) {
            console.error('adicionarMateria failed', error);
            this.showError('Erro ao adicionar disciplina');
        }
    }

    async removerMateria(subjectId) {
        try {
            const ok = await (window.SiteUI && window.SiteUI.confirm ? window.SiteUI.confirm('Deseja remover esta disciplina do seu plano?') : Promise.resolve(confirm('Deseja remover esta disciplina do seu plano?')));
            if (!ok) return;
        } catch (e) {
            if (!confirm('Deseja remover esta disciplina do seu plano?')) return;
        }
        try {
            await api.removerMateria(subjectId);
            // Reload and re-render the Minhas MatÃƒÂ©rias view so the UI reflects the deletion immediately.
            // showView('minhas-materias') will call renderMinhasMaterias which loads fresh data.
            await this.showView('minhas-materias');
            this.showSuccess('Disciplina removida');
        } catch (error) {
            this.showError('Erro ao remover disciplina');
        }
    }
    
    // Apply a global search query to Minhas MatÃƒÂ©rias view.
    async applySearch(query) {
        try {
            this.lastSearch = String(query || '').trim();
            // If we're not on the Minhas MatÃƒÂ©rias view, navigate there first
            if (this.currentView !== 'minhas-materias') {
                await this.showView('minhas-materias');
                // ensure DOM updated then apply filter
                this._applySearchToGrid();
            } else {
                this._applySearchToGrid();
            }
        } catch (err) {
            console.warn('applySearch failed', err);
        }
    }

    _applySearchToGrid() {
        try {
            const q = (this.lastSearch || '').toLowerCase();
            const grid = document.getElementById('materiasGrid');
            if (!grid) return;

            const list = (this.minhasDisciplinas || []).filter(m => {
                if (!q) return true;
                return (m.nome || '').toLowerCase().includes(q) || (m.descricao || '').toLowerCase().includes(q);
            });

            if (list.length === 0) {
                grid.innerHTML = `<div class="col-span-3 text-center py-12 text-gray-500">
                    <i class="fas fa-search text-4xl mb-3 opacity-30"></i>
                    <p class="text-lg mb-2">Nenhuma disciplina encontrada</p>
                    <p class="text-sm">Tente outro termo de busca.</p>
                </div>`;
                return;
            }

            grid.innerHTML = list.map(materia => renderMateriaCard(materia)).join('');
        } catch (err) { console.warn('_applySearchToGrid failed', err); }
    }

    // Open a lightweight modal to add a new matÃƒÂ©ria (or select existing)
    // Accepts optional options: { preselectId, exam_date, total_hours }
    async openAddModal(options = {}) {
        try {
            // ensure we have the curated list of available subjects before rendering
            // the modal so the select shows the fixed subjects rather than stale data.
            await this.loadMateriasDisponiveis?.();

            // avoid duplicate modals
            if (document.getElementById('add-materia-modal')) return;

            const overlay = document.createElement('div');
            overlay.id = 'add-materia-modal';
            overlay.className = 'modal-overlay';

            const card = document.createElement('div');
            card.className = 'modal-card';
            card.innerHTML = `
                <div class="add-materia-modal-header">
                    <h3 class="add-materia-modal-title">Adicionar Disciplina</h3>
                    <button id="add-materia-cancel" class="btn-secondary">Cancelar</button>
                </div>
                <div class="add-materia-form-grid">
                    <div>
                        <label class="label-muted">Escolher disciplina disponÃƒÂ­vel</label>
                            <select id="add-select-existing" class="form-input">
                            <option value="">-- Nenhuma (criar nova) --</option>
                            ${(this.materiasDisponiveis || []).map(m => `<option value="${m.id}">${m.nome}</option>`).join('')}
                        </select>
                    </div>
                    <div>
                        <label class="label-muted">Data do exame (opcional)</label>
                        <input type="date" id="add-exam-date" class="form-input" min="${todayISO()}" />
                    </div>
                    <div class="add-materia-form-grid-full">
                        <label class="label-muted">Ou criar disciplina nova - Nome</label>
                        <input id="add-new-name" class="form-input" placeholder="Nome da disciplina" />
                    </div>
                    <div>
                        <label class="label-muted">Horas totais (opcional)</label>
                        <input id="add-total-hours" type="number" min="0" class="form-input" />
                    </div>
                    <div>
                        <label class="label-muted">Cor (opcional)</label>
                        <input id="add-color" type="color" value="#6366f1" class="form-input" />
                    </div>
                </div>
                <div class="add-materia-modal-actions">
                    <button id="add-materia-submit" class="btn-primary">Adicionar</button>
                </div>
            `;

            overlay.appendChild(card);
            document.body.appendChild(overlay);

            // If caller provided preselection options, apply them to the modal inputs
            try {
                if (options && (options.preselectId || options.exam_date || typeof options.total_hours !== 'undefined')) {
                    const sel = overlay.querySelector('#add-select-existing');
                    if (sel && options.preselectId) sel.value = options.preselectId;
                    const ex = overlay.querySelector('#add-exam-date');
                    if (ex && options.exam_date) ex.value = options.exam_date;
                    const th = overlay.querySelector('#add-total-hours');
                    if (th && typeof options.total_hours !== 'undefined' && options.total_hours !== null) th.value = options.total_hours;
                    const nameInp = overlay.querySelector('#add-new-name');
                    if (nameInp && options.preselectId) nameInp.disabled = true;
                }
            } catch (e) { /* ignore prefill errors */ }

            const close = () => {
                try {
                    overlay.classList.add('closing');
                    const onEnd = () => { try { overlay.remove(); } catch (e) { console.warn(e); } finally { overlay.removeEventListener('animationend', onEnd); } };
                    // prefer card animation end
                    const cardEl = overlay.querySelector('.modal-card');
                    if (cardEl) cardEl.addEventListener('animationend', onEnd);
                    else overlay.addEventListener('animationend', onEnd);
                    // fallback
                    setTimeout(() => { try { overlay.remove(); } catch(e){} }, 400);
                } catch (e) { try { overlay.remove(); } catch (e) { console.warn(e); } }
            };
            const cancelBtn = overlay.querySelector('#add-materia-cancel');
            if (cancelBtn) cancelBtn.addEventListener('click', close);
            overlay.addEventListener('click', (ev) => { if (ev.target === overlay) close(); });

            const submitBtn = overlay.querySelector('#add-materia-submit');
            if (submitBtn) submitBtn.addEventListener('click', async () => {
                const existing = overlay.querySelector('#add-select-existing').value;
                const exam_date = overlay.querySelector('#add-exam-date').value || null;
                const name = overlay.querySelector('#add-new-name').value && overlay.querySelector('#add-new-name').value.trim();
                const hours = overlay.querySelector('#add-total-hours').value ? Number(overlay.querySelector('#add-total-hours').value) : null;
                const color = overlay.querySelector('#add-color').value || '#6366f1';

                try {
                    if (existing) {
                        // add existing by id Ã¢â‚¬â€ pass exam_date, total_hours and color so backend persists metadata
                        await this.adicionarMateria(existing, exam_date || null, typeof hours !== 'undefined' ? hours : null, color || null);
                    } else if (name) {
                        // create new via API (or offline fallback)
                        // Use the 'sugerir' endpoint which creates the subject if needed and adds it to the user
                        const payload = { name, description: null, exam_date, total_hours: hours, metas: [], color };
                        await api.request('/subjects/sugerir', { method: 'POST', body: JSON.stringify(payload) });
                        // reload lists
                        await this.loadMateriasData();
                        this.showSuccess('Disciplina criada e adicionada');
                    } else {
                        this.showError('Informe um nome ou escolha uma disciplina existente');
                        return;
                    }

                    close();
                    await this.loadMateriasData();
                    this.showView('minhas-materias');
                } catch (err) {
                    console.error('add-materia failed', err);
                    this.showError('Erro ao adicionar disciplina');
                }
            });
        } catch (err) { console.warn('openAddModal failed', err); }
    }

    // Helper to open the add modal preselecting a subject and prefilling exam date / hours
    openAddModalFor(subjectId) {
        try {
            // try to read inline inputs (if present in adicionar view)
            let exam_date = null;
            let total_hours = null;
            try {
                const el = document.getElementById(`dataExame-${subjectId}`);
                if (el && el.value) exam_date = el.value;
                const th = document.getElementById(`totalHours-${subjectId}`) || document.getElementById('add-total-hours');
                if (th && th.value) total_hours = Number(th.value);
            } catch (e) { /* ignore DOM read errors */ }
            this.openAddModal({ preselectId: subjectId, exam_date: exam_date || null, total_hours: typeof total_hours !== 'undefined' ? total_hours : null });
        } catch (e) { console.warn('openAddModalFor failed', e); this.openAddModal({ preselectId: subjectId }); }
    }

    // Non-blocking toast
    showSuccess(msg) { this._showToast(msg, 'success'); }
    showError(msg) { this._showToast(msg, 'error'); }

    _showToast(message, type = 'info', timeout = 3500) {
        try {
            showUiToast(message, type, timeout);
        } catch (e) { console.warn('toast failed', e); }
    }
}

window.dashboard = new Dashboard();


