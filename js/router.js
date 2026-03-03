import renderHome from './views/home.js';
import renderCronograma from './views/cronograma.js';
import renderAdicionar from './views/adicionar.js';
import renderMinhasMaterias from './views/minhasMaterias.js';
import renderAssistente from './views/assistente.js';
import renderEstatisticas from './views/estatisticas.js';

class Router {
    constructor() {
        this.routes = {
            '/': renderHome,
            '/minhas': renderMinhasMaterias,
            '/cronograma': renderCronograma,
            '/adicionar': renderAdicionar,
            '/assistente': renderAssistente,
            '/estatisticas': renderEstatisticas
        };
        
        this.currentView = null;
        this.init();
    }

    init() {
        // Configurar listener para mudanças na URL
        window.addEventListener('popstate', () => this.handleRoute());
        
        // Configurar links de navegação
        this.setupNavLinks();
        
        // Renderizar rota inicial
        this.handleRoute();
    }

    setupNavLinks() {
        const navLinks = document.querySelectorAll('.nav-link');
        navLinks.forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const path = link.getAttribute('href');
                this.navigate(path);
            });
        });
    }

    async handleRoute() {
        // Get current path from URL or fallback to '/'
        const rawPath = window.location.pathname || '/';

        // Determine base path (when app is served under a subpath, e.g. /pap2326)
        let basePath = '/';
        try {
            if (window.BASE_URL) {
                const u = new URL(String(window.BASE_URL));
                basePath = u.pathname || '/';
            } else if (window.BASE_PATH) {
                basePath = String(window.BASE_PATH) || '/';
            }
        } catch (e) { basePath = '/'; }

        // Remove basePath prefix for internal routing comparisons
        let path = rawPath;
        if (basePath && basePath !== '/' && rawPath.startsWith(basePath)) {
            path = rawPath.slice(basePath.length) || '/';
        }
        if (!path.startsWith('/')) path = '/' + path;

        // Find matching route handler
        const view = this.routes[path];
        if (!view) {
            console.error('Route not found:', path);
            return this.navigate('/');
        }

        try {
            // Update active navigation link
            this.updateActiveLink(path);
            
            // Render view
            await view();
            
            // Update current view reference
            this.currentView = path;

        } catch (error) {
            console.error('Error handling route:', error);
            document.getElementById('view').innerHTML = `
                <div class="text-center py-12">
                    <div class="text-red-500 mb-4">
                        <i class="fas fa-exclamation-circle text-4xl"></i>
                    </div>
                    <h3 class="text-xl font-semibold mb-2">Erro ao carregar página</h3>
                    <p class="text-gray-600 mb-4">${error.message || 'Tente novamente mais tarde'}</p>
                    <button onclick="window.router.navigate('/')" class="btn btn-primary">
                        Voltar para Home
                    </button>
                </div>
            `;
        }
    }

    updateActiveLink(path) {
        // Remove active class from all links
        const rawPath = window.location.pathname || '/';
        // compute basePath same as handleRoute
        let basePath = '/';
        try { if (window.BASE_URL) basePath = new URL(String(window.BASE_URL)).pathname || '/'; else if (window.BASE_PATH) basePath = String(window.BASE_PATH) || '/'; } catch(e){ basePath = '/'; }

        document.querySelectorAll('.nav-link').forEach(link => {
            link.classList.remove('active');
            const href = link.getAttribute('href') || '';
            // Consider both plain path and base-prefixed path
            if (href === path || href === (basePath === '/' ? '' : basePath) + path || href === (basePath === '/' ? path : basePath + path)) {
                link.classList.add('active');
            }
        });
    }

    navigate(path) {
        // Respect base path when updating URL
        let basePath = '/';
        try { if (window.BASE_URL) basePath = new URL(String(window.BASE_URL)).pathname || '/'; else if (window.BASE_PATH) basePath = String(window.BASE_PATH) || '/'; } catch(e){ basePath = '/'; }
        const target = (basePath === '/' ? '' : basePath) + (path.startsWith('/') ? path : '/' + path);
        // Update URL without full page reload
        window.history.pushState({}, '', target);

        // Handle the new route
        this.handleRoute();
    }
}

// Export singleton instance
const router = new Router();
export default router;