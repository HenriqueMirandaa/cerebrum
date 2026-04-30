(function () {
    function t(key) {
        return key;
    }

    function applyTranslations() {
        // Intentionally left blank: the platform now ships with fixed PT-PT copy.
    }

    function setLang() {
        return 'pt';
    }

    function removeLegacyLanguageUi() {
        const legacySelector = document.getElementById('lang-selector');
        if (legacySelector) legacySelector.remove();

        const legacyNodes = document.querySelectorAll('[id="lang-btn"], [id="lang-flag"], [id="lang-list"]');
        legacyNodes.forEach((node) => node.remove());
    }

    try {
        localStorage.removeItem('cerebrum_lang');
    } catch (error) {
        // Ignore storage errors in private mode or restricted environments.
    }

    window.i18n = {
        t,
        setLang,
        applyTranslations,
        current: 'pt'
    };

    document.addEventListener('DOMContentLoaded', function () {
        removeLegacyLanguageUi();
        applyTranslations();
    });
})();
