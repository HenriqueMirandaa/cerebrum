// Simple i18n system: EN, PT, FR
(function(){
    const translations = {
        en: {
            'brand.title': 'Cerebrum',
            'brand.subtitle': 'Your intelligent study platform',
            'tab.login': 'Login',
            'tab.register': 'Register',
            'label.email': 'Email',
            'label.password': 'Password',
            'label.name': 'Full name',
            'btn.login': 'Login',
            'btn.create': 'Create account',
            'msg.loginSuccess': 'Login successful!',
            'msg.registerSuccess': 'Registration successful!',
            'placeholder.email': 'you@domain.com',
            'placeholder.password': 'Your password',
            'placeholder.name': 'Your full name'
        },
        pt: {
            'brand.title': 'Cerebrum',
            'brand.subtitle': 'Sua plataforma inteligente de estudos',
            'tab.login': 'Entrar',
            'tab.register': 'Cadastrar',
            'label.email': 'E-mail',
            'label.password': 'Senha',
            'label.name': 'Nome completo',
            'btn.login': 'Entrar',
            'btn.create': 'Criar conta',
            'msg.loginSuccess': 'Login realizado com sucesso!',
            'msg.registerSuccess': 'Cadastro realizado com sucesso!',
            'placeholder.email': 'seu@email.com',
            'placeholder.password': 'Sua senha',
            'placeholder.name': 'Seu nome completo'
        },
        fr: {
            'brand.title': 'Cerebrum',
            'brand.subtitle': "Votre plateforme d'étude intelligente",
            'tab.login': 'Connexion',
            'tab.register': "S'inscrire",
            'label.email': 'Email',
            'label.password': 'Mot de passe',
            'label.name': 'Nom complet',
            'btn.login': 'Se connecter',
            'btn.create': "Créer un compte",
            'msg.loginSuccess': 'Connexion réussie!',
            'msg.registerSuccess': 'Inscription réussie!',
            'placeholder.email': 'vous@domaine.com',
            'placeholder.password': 'Votre mot de passe',
            'placeholder.name': 'Votre nom complet'
        }
    };

    const defaultLang = localStorage.getItem('cerebrum_lang') || 'pt';
    let current = defaultLang;

    function t(key) {
        return translations[current] && translations[current][key] ? translations[current][key] : key;
    }

    function applyTranslations(root = document) {
        root.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            const attr = el.getAttribute('data-i18n-attr');
            const value = t(key);
            if (!attr || attr === 'text') {
                el.textContent = value;
            } else {
                el.setAttribute(attr, value);
            }
        });
    }

    function setLang(lang) {
        if (!translations[lang]) return;
        current = lang;
        localStorage.setItem('cerebrum_lang', lang);
        applyTranslations(document);
        updateSelector();
    }

    function createSelector() {}

    function updateSelector() {}

    // Expose minimal API
    window.i18n = { t, setLang, current };

    // Init once DOM ready
    document.addEventListener('DOMContentLoaded', () => {
        applyTranslations(document);
        createSelector();
    });
})();
