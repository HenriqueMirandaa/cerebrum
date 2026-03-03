// auth.js - Script de autenticação integrado com backend real
import api from './api.js';

// Aguarda o DOM carregar completamente
document.addEventListener('DOMContentLoaded', function() {
    // Elementos do DOM
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    const loginBtn = document.getElementById('loginBtn');
    const registerBtn = document.getElementById('registerBtn');
    const tabBtns = document.querySelectorAll('.tab-btn');
    const authForms = document.querySelectorAll('.auth-form');
    const passwordToggles = document.querySelectorAll('.password-toggle');
    const loginMessage = document.getElementById('loginMessage');
    const registerMessage = document.getElementById('registerMessage');

    // Sistema de tabs
    tabBtns.forEach(btn => {
        btn.addEventListener('click', function() {
            const targetTab = this.getAttribute('data-tab');
            tabBtns.forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            authForms.forEach(form => {
                form.classList.remove('active');
                if (form.id === `${targetTab}Form`) form.classList.add('active');
            });
            clearMessages();
        });
    });

    // Toggle de visibilidade de senha
    passwordToggles.forEach(toggle => {
        toggle.addEventListener('click', function() {
            const input = this.parentElement.querySelector('input');
            const icon = this.querySelector('i');
            const pressed = this.getAttribute('aria-pressed') === 'true';
            if (!pressed) {
                input.type = 'text';
                icon.classList.remove('fa-eye');
                icon.classList.add('fa-eye-slash');
                this.setAttribute('aria-pressed', 'true');
            } else {
                input.type = 'password';
                icon.classList.remove('fa-eye-slash');
                icon.classList.add('fa-eye');
                this.setAttribute('aria-pressed', 'false');
            }
        });
    });

    // Real-time validation: enable/disable submit button
    const loginEmail = document.getElementById('loginEmail');
    const loginPassword = document.getElementById('loginPassword');

    function updateLoginButtonState() {
        const valid = validateEmail(loginEmail.value) && validatePassword(loginPassword.value);
        loginBtn.disabled = !valid;
        if (valid) loginBtn.classList.remove('disabled'); else loginBtn.classList.add('disabled');
    }

    if (loginEmail) loginEmail.addEventListener('input', updateLoginButtonState);
    if (loginPassword) loginPassword.addEventListener('input', updateLoginButtonState);

    // Login
    if (loginForm) loginForm.addEventListener('submit', function(e) {
        e.preventDefault();
        handleLogin();
    });

    // Cadastro
    if (registerForm) registerForm.addEventListener('submit', function(e) {
        e.preventDefault();
        handleRegister();
    });

    async function handleLogin() {
        const email = document.getElementById('loginEmail').value;
        const password = document.getElementById('loginPassword').value;
        console.log('[Auth] handleLogin called with', { email });
        showLoading(loginBtn);
        clearMessages();

        try {
            const res = await api.login({ email, password });
            // store token for API calls
            if (res.token) api.setToken(res.token);
            // persist user name for personalized UI
            try { if (res.user?.name) localStorage.setItem('user_name', res.user.name); } catch (e) { /* ignore */ }
            showMessage(loginMessage, 'Login realizado com sucesso!', 'success');

            // Redirect depending on role - use absolute URLs and robust logging
            const role = res.user?.role || 'user';
            const target = (role === 'admin' || role === 'administrator') ? 'admin.html' : 'dashboard.html';
            // Compute base path where the app is hosted (handles subfolders like /pap2326/)
            let basePath = window.location.pathname;
            if (!basePath.endsWith('/')) basePath = basePath.substring(0, basePath.lastIndexOf('/') + 1);
            const absolute = window.location.origin + basePath + target;
            console.log('[Auth] login success for', res.user?.email || res.user?.name, 'role=', role, 'redirect=', absolute);

            // short delay to show success UI, then navigate
            setTimeout(() => {
                // Use replace to avoid leaving login in history on success
                try {
                    window.location.replace(absolute);
                } catch (err) {
                    console.warn('[Auth] replace failed, falling back to href', err);
                    window.location.href = absolute;
                }
            }, 300);
        } catch (error) {
            console.error('[Auth] handleLogin error', error);
            showMessage(loginMessage, error.message || 'Erro ao efetuar login', 'error');
        } finally {
            hideLoading(loginBtn);
        }
    }

    async function handleRegister() {
        const name = document.getElementById('registerName').value;
        const email = document.getElementById('registerEmail').value;
        const password = document.getElementById('registerPassword').value;
        console.log('[Auth] handleRegister called with', { name, email });

        showLoading(registerBtn);
        clearMessages();

        try {
            const res = await api.register({ name, email, password });
            if (res.token) api.setToken(res.token);
            try { if (res.user?.name) localStorage.setItem('user_name', res.user.name); } catch (e) { /* ignore */ }
            showMessage(registerMessage, 'Cadastro realizado com sucesso!', 'success');
            setTimeout(() => {
                tabBtns[0].click();
                registerForm.reset();
            }, 900);
        } catch (error) {
            console.error('[Auth] handleRegister error', error);
            showMessage(registerMessage, error.message || 'Erro ao cadastrar', 'error');
        } finally {
            hideLoading(registerBtn);
        }
    }

    // Funções de validação
    function validateEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }

    function validatePassword(password) {
        return password.length >= 6;
    }

    // Funções auxiliares
    function showLoading(button) {
        if (!button) return;
        const btnText = button.querySelector('.btn-text');
        const btnLoading = button.querySelector('.btn-loading');
        if (btnText) btnText.classList.add('hidden');
        if (btnLoading) btnLoading.classList.remove('hidden');
        button.disabled = true;
    }

    function hideLoading(button) {
        if (!button) return;
        const btnText = button.querySelector('.btn-text');
        const btnLoading = button.querySelector('.btn-loading');
        if (btnText) btnText.classList.remove('hidden');
        if (btnLoading) btnLoading.classList.add('hidden');
        button.disabled = false;
    }

    function showMessage(element, message, type) {
        if (!element) return;
        element.textContent = message;
        element.className = 'auth-message show ' + type;
        element.setAttribute('aria-live', 'polite');
    }

    function clearMessages() {
        [loginMessage, registerMessage].forEach(el => {
            if (!el) return;
            el.textContent = '';
            el.className = 'auth-message';
            el.removeAttribute('aria-live');
        });
    }

    console.log('🔐 Sistema de autenticação inicializado com backend real');
});