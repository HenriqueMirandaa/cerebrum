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
            'tab.register': 'Registar',
            'label.email': 'E-mail',
            'label.password': 'Senha',
            'label.name': 'Nome completo',
            'btn.login': 'Entrar',
            'btn.create': 'Criar conta',
            'msg.loginSuccess': 'Login realizado com sucesso!',
            'msg.registerSuccess': 'Registo realizado com sucesso!',
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

    function createSelector() {
        const wrapper = document.createElement('div');
        wrapper.id = 'lang-selector';
        wrapper.style.position = 'fixed';
        wrapper.style.right = '16px';
        wrapper.style.top = '16px';
        wrapper.style.zIndex = 99999;

        const btn = document.createElement('button');
        btn.id = 'lang-btn';
        btn.style.border = 'none';
        btn.style.background = 'transparent';
        btn.style.cursor = 'pointer';

        const img = document.createElement('img');
        img.id = 'lang-flag';
        img.src = getFlagSrc(current);
        img.alt = current;
        img.style.width = '28px';
        img.style.height = '20px';
        img.style.objectFit = 'cover';
        img.style.borderRadius = '3px';
        img.style.boxShadow = '0 2px 6px rgba(0,0,0,0.15)';

        btn.appendChild(img);
        wrapper.appendChild(btn);

        const list = document.createElement('div');
        list.id = 'lang-list';
        list.style.position = 'absolute';
        list.style.right = '0';
        list.style.top = '36px';
        list.style.background = '#fff';
        list.style.border = '1px solid #ddd';
        list.style.borderRadius = '6px';
        list.style.boxShadow = '0 8px 24px rgba(0,0,0,0.12)';
        list.style.display = 'none';
        list.style.padding = '6px';

        ['pt','en','fr'].forEach(code => {
            const item = document.createElement('div');
            item.style.display = 'flex';
            item.style.alignItems = 'center';
            item.style.gap = '8px';
            item.style.padding = '6px 8px';
            item.style.cursor = 'pointer';
            item.onmouseenter = () => item.style.background = '#f7f7f7';
            item.onmouseleave = () => item.style.background = 'transparent';

            const f = document.createElement('img');
            f.src = getFlagSrc(code);
            f.style.width = '24px';
            f.style.height = '16px';
            f.style.objectFit = 'cover';
            f.style.borderRadius = '3px';

            const label = document.createElement('div');
            label.textContent = code === 'pt' ? 'Português' : code === 'en' ? 'English' : 'Français';

            item.appendChild(f);
            item.appendChild(label);
            item.addEventListener('click', () => {
                setLang(code);
                list.style.display = 'none';
            });
            list.appendChild(item);
        });

        btn.addEventListener('click', () => {
            list.style.display = list.style.display === 'none' ? 'block' : 'none';
        });

        wrapper.appendChild(list);
        document.body.appendChild(wrapper);
    }

    function getFlagSrc(code) {
        // Use simple inline base64 or local images; we'll use public CDN flags for simplicity
        if (code === 'pt') return 'https://flagcdn.com/w20/pt.png';
        if (code === 'en') return 'https://flagcdn.com/w20/gb.png';
        if (code === 'fr') return 'https://flagcdn.com/w20/fr.png';
        return '';
    }

    function updateSelector() {
        const img = document.getElementById('lang-flag');
        if (img) img.src = getFlagSrc(current);
    }

    // Expose minimal API
    window.i18n = { t, setLang, current };

    // Init once DOM ready
    document.addEventListener('DOMContentLoaded', () => {
        applyTranslations(document);
        createSelector();
    });
})();
