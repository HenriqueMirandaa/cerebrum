// Configurações
const CONFIG = {
    BACKEND_BASE: 'http://localhost:4000',
    N8N_WEBHOOK: 'http://localhost:5678/webhook/ia_chat',
    GOOGLE_API_KEY: '',
    GOOGLE_CX: '',
};

// Inicialização da aplicação
document.addEventListener('DOMContentLoaded', function() {
    // Configurar ano atual no footer
    document.getElementById('year').textContent = new Date().getFullYear();
    
    // Inicializar dados
    initData();
    
    // Configurar roteamento
    initRouter();
    
    // Configurar event listeners
    setupEventListeners();
    
    // Configurar handlers globais de erro para capturar recursos que falham ao carregar (404) e promise rejections
    setupGlobalErrorHandlers();
});

function setupGlobalErrorHandlers() {
    // Resource load errors (e.g., <script>, <link>, <img> failing to load) will trigger an 'error' event on the element
    window.addEventListener('error', function (event) {
        try {
            const target = event.target || event.srcElement;
            if (target && (target.src || target.href)) {
                const url = target.src || target.href;
                console.error('[Resource load failed]', url, event);
                showNotification(`Falha ao carregar recurso: ${url}`, 'error');
            } else {
                // Non-resource errors will be handled elsewhere
                console.error('[Runtime error]', event.message, event.filename, event.lineno, event.colno);
            }
        } catch (e) {
            console.error('Erro no handler global de resource error:', e);
        }
    }, true); // useCapture true to catch resource errors on capture phase

    // Unhandled promise rejections
    window.addEventListener('unhandledrejection', function (ev) {
        console.error('[UnhandledRejection]', ev.reason);
        try {
            const message = (ev.reason && ev.reason.message) ? ev.reason.message : JSON.stringify(ev.reason);
            showNotification(`Erro assíncrono: ${message}`, 'error');
        } catch (e) {
            showNotification('Erro assíncrono desconhecido', 'error');
        }
    });
}

function setupEventListeners() {
    // Botão de dados de exemplo
    document.getElementById('seedBtn').addEventListener('click', loadSampleData);
}

function initData() {
    // Carregar dados do localStorage ou usar dados padrão
    const savedSubjects = localStorage.getItem('cerebrum_subjects');
    const savedTasks = localStorage.getItem('cerebrum_tasks');
    
    if (savedSubjects) {
        window.subjects = JSON.parse(savedSubjects);
    } else {
        window.subjects = JSON.parse(JSON.stringify(SAMPLE_SUBJECTS));
        saveData();
    }
    
    if (savedTasks) {
        window.tasks = JSON.parse(savedTasks);
    } else {
        localGenerateCronograma(todayISO());
        saveData();
    }
}

// Salvar dados no localStorage
function saveData() {
    localStorage.setItem('cerebrum_subjects', JSON.stringify(window.subjects));
    localStorage.setItem('cerebrum_tasks', JSON.stringify(window.tasks));
}

// Carregar dados de exemplo
function loadSampleData() {
    window.subjects = JSON.parse(JSON.stringify(SAMPLE_SUBJECTS));
    localGenerateCronograma(todayISO());
    saveData();
    
    // Mostrar notificação
    showNotification('Dados de exemplo carregados com sucesso!', 'success');
    
    // Recarregar a view atual
    if (window.router && window.router.currentView) {
        const currentView = window.router.currentView;
        window.router.navigateTo(currentView);
    }
}

function showNotification(message, type = 'info') {
    const colors = {
        success: 'bg-green-500',
        error: 'bg-red-500',
        warning: 'bg-yellow-500',
        info: 'bg-blue-500'
    };
    
    const notification = document.createElement('div');
    notification.className = `fixed bottom-4 right-4 ${colors[type]} text-white p-4 rounded-lg shadow-lg z-50 transform transition-transform duration-300 translate-y-0`;
    notification.innerHTML = `
        <div class="flex items-center">
            <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : type === 'warning' ? 'exclamation-triangle' : 'info-circle'} mr-2"></i>
            <span>${message}</span>
        </div>
    `;
    document.body.appendChild(notification);
    
    // Animar entrada
    setTimeout(() => {
        notification.classList.remove('translate-y-0');
        notification.classList.add('translate-y-2');
    }, 100);
    
    // Remover após 3 segundos
    setTimeout(() => {
        notification.classList.add('opacity-0', 'transition-opacity', 'duration-300');
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 300);
    }, 3000);
}

// Exportar funções para uso global
window.saveData = saveData;
window.showNotification = showNotification;