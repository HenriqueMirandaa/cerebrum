import './i18n.js';
import api from './api.js';

document.addEventListener('DOMContentLoaded', function() {
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    const forgotPasswordForm = document.getElementById('forgotPasswordForm');
    const resetPasswordForm = document.getElementById('resetPasswordForm');
    const authForms = [loginForm, registerForm, forgotPasswordForm, resetPasswordForm].filter(Boolean);

    const loginBtn = document.getElementById('loginBtn');
    const registerBtn = document.getElementById('registerBtn');
    const forgotPasswordBtn = document.getElementById('forgotPasswordBtn');
    const resetPasswordBtn = document.getElementById('resetPasswordBtn');
    const tabBtns = document.querySelectorAll('.tab-btn');
    const passwordToggles = document.querySelectorAll('.password-toggle');

    const loginMessage = document.getElementById('loginMessage');
    const registerMessage = document.getElementById('registerMessage');
    const forgotPasswordMessage = document.getElementById('forgotPasswordMessage');
    const resetPasswordMessage = document.getElementById('resetPasswordMessage');
    const allMessages = [loginMessage, registerMessage, forgotPasswordMessage, resetPasswordMessage].filter(Boolean);

    const showForgotPasswordBtn = document.getElementById('showForgotPasswordBtn');
    const backToLoginBtn = document.getElementById('backToLoginBtn');
    const cancelResetBtn = document.getElementById('cancelResetBtn');

    const loginEmail = document.getElementById('loginEmail');
    const loginPassword = document.getElementById('loginPassword');
    const forgotEmail = document.getElementById('forgotEmail');
    const resetToken = document.getElementById('resetToken');
    const resetPassword = document.getElementById('resetPassword');
    const resetPasswordConfirm = document.getElementById('resetPasswordConfirm');

    const params = new URLSearchParams(window.location.search);
    const resetMode = params.get('mode') === 'reset';
    const resetTokenFromUrl = params.get('token') || '';

    function setActiveTab(tabName) {
        tabBtns.forEach((btn) => {
            const active = btn.getAttribute('data-tab') === tabName;
            btn.classList.toggle('active', active);
            btn.setAttribute('aria-selected', active ? 'true' : 'false');
        });
    }

    function switchForm(formId, tabName = null) {
        authForms.forEach((form) => {
            const active = form && form.id === formId;
            form.classList.toggle('active', active);
            form.setAttribute('aria-hidden', active ? 'false' : 'true');
        });

        if (tabName) setActiveTab(tabName);
        else tabBtns.forEach((btn) => {
            btn.classList.remove('active');
            btn.setAttribute('aria-selected', 'false');
        });

        clearMessages();
    }

    function clearResetQuery() {
        const nextUrl = new URL(window.location.href);
        nextUrl.searchParams.delete('mode');
        nextUrl.searchParams.delete('token');
        window.history.replaceState({}, document.title, nextUrl.toString());
    }

    tabBtns.forEach((btn) => {
        btn.addEventListener('click', function() {
            const targetTab = this.getAttribute('data-tab');
            switchForm(`${targetTab}Form`, targetTab);
        });
    });

    passwordToggles.forEach((toggle) => {
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

    function updateLoginButtonState() {
        const valid = validateEmail(loginEmail?.value || '') && validatePassword(loginPassword?.value || '');
        if (!loginBtn) return;
        loginBtn.disabled = !valid;
        loginBtn.classList.toggle('disabled', !valid);
    }

    if (loginEmail) loginEmail.addEventListener('input', updateLoginButtonState);
    if (loginPassword) loginPassword.addEventListener('input', updateLoginButtonState);

    if (loginForm) loginForm.addEventListener('submit', function(e) {
        e.preventDefault();
        handleLogin();
    });

    if (registerForm) registerForm.addEventListener('submit', function(e) {
        e.preventDefault();
        handleRegister();
    });

    if (forgotPasswordForm) forgotPasswordForm.addEventListener('submit', function(e) {
        e.preventDefault();
        handleForgotPassword();
    });

    if (resetPasswordForm) resetPasswordForm.addEventListener('submit', function(e) {
        e.preventDefault();
        handleResetPassword();
    });

    if (showForgotPasswordBtn) {
        showForgotPasswordBtn.addEventListener('click', function() {
            if (forgotEmail && loginEmail && validateEmail(loginEmail.value)) {
                forgotEmail.value = loginEmail.value.trim();
            }
            switchForm('forgotPasswordForm');
        });
    }

    if (backToLoginBtn) {
        backToLoginBtn.addEventListener('click', function() {
            switchForm('loginForm', 'login');
        });
    }

    if (cancelResetBtn) {
        cancelResetBtn.addEventListener('click', function() {
            clearResetQuery();
            if (resetToken) resetToken.value = '';
            if (resetPassword) resetPassword.value = '';
            if (resetPasswordConfirm) resetPasswordConfirm.value = '';
            switchForm('loginForm', 'login');
        });
    }

    async function handleLogin() {
        const email = loginEmail.value.trim();
        const password = loginPassword.value;
        showLoading(loginBtn);
        clearMessages();

        try {
            const res = await api.login({ email, password });
            if (res.token) api.setToken(res.token);
            try {
                if (res.user?.name) localStorage.setItem('user_name', res.user.name);
            } catch (e) { /* ignore */ }

            showMessage(loginMessage, 'Login realizado com sucesso!', 'success');

            const role = res.user?.role || 'user';
            const target = (role === 'admin' || role === 'administrator') ? 'admin.html' : 'dashboard.html';
            let basePath = window.location.pathname;
            if (!basePath.endsWith('/')) basePath = basePath.substring(0, basePath.lastIndexOf('/') + 1);
            const absolute = window.location.origin + basePath + target;

            setTimeout(() => {
                try {
                    window.location.replace(absolute);
                } catch (err) {
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
        const name = document.getElementById('registerName').value.trim();
        const email = document.getElementById('registerEmail').value.trim();
        const password = document.getElementById('registerPassword').value;

        showLoading(registerBtn);
        clearMessages();

        try {
            const res = await api.register({ name, email, password });
            if (res.token) api.setToken(res.token);
            try {
                if (res.user?.name) localStorage.setItem('user_name', res.user.name);
            } catch (e) { /* ignore */ }
            showMessage(
                registerMessage,
                res.message || 'Cadastro realizado com sucesso! Se o SMTP estiver configurado, vais receber um email.',
                'success'
            );
            setTimeout(() => {
                switchForm('loginForm', 'login');
                registerForm.reset();
                if (loginEmail) loginEmail.value = email;
                updateLoginButtonState();
            }, 1400);
        } catch (error) {
            console.error('[Auth] handleRegister error', error);
            showMessage(registerMessage, error.message || 'Erro ao cadastrar', 'error');
        } finally {
            hideLoading(registerBtn);
        }
    }

    async function handleForgotPassword() {
        const email = forgotEmail.value.trim();
        showLoading(forgotPasswordBtn);
        clearMessages();

        try {
            const res = await api.forgotPassword(email);
            showMessage(
                forgotPasswordMessage,
                res.message || 'Se existir uma conta com este email, enviamos um link para redefinir a senha.',
                'success'
            );
        } catch (error) {
            console.error('[Auth] handleForgotPassword error', error);
            showMessage(forgotPasswordMessage, error.message || 'Erro ao pedir redefinicao de senha', 'error');
        } finally {
            hideLoading(forgotPasswordBtn);
        }
    }

    async function handleResetPassword() {
        const token = resetToken.value.trim();
        const password = resetPassword.value;
        const confirmPassword = resetPasswordConfirm.value;

        clearMessages();

        if (!token) {
            showMessage(resetPasswordMessage, 'Link de redefinicao invalido.', 'error');
            return;
        }

        if (!validatePassword(password)) {
            showMessage(resetPasswordMessage, 'A nova senha deve ter pelo menos 6 caracteres.', 'error');
            return;
        }

        if (password !== confirmPassword) {
            showMessage(resetPasswordMessage, 'As senhas nao coincidem.', 'error');
            return;
        }

        showLoading(resetPasswordBtn);

        try {
            const res = await api.resetPassword(token, password);
            showMessage(resetPasswordMessage, res.message || 'Senha redefinida com sucesso.', 'success');
            clearResetQuery();
            setTimeout(() => {
                if (resetToken) resetToken.value = '';
                if (resetPassword) resetPassword.value = '';
                if (resetPasswordConfirm) resetPasswordConfirm.value = '';
                switchForm('loginForm', 'login');
            }, 1400);
        } catch (error) {
            console.error('[Auth] handleResetPassword error', error);
            showMessage(resetPasswordMessage, error.message || 'Erro ao redefinir senha', 'error');
        } finally {
            hideLoading(resetPasswordBtn);
        }
    }

    function validateEmail(email) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    }

    function validatePassword(password) {
        return String(password || '').length >= 6;
    }

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
        allMessages.forEach((el) => {
            el.textContent = '';
            el.className = 'auth-message';
            el.removeAttribute('aria-live');
        });
    }

    if (resetMode && resetTokenFromUrl) {
        if (resetToken) resetToken.value = resetTokenFromUrl;
        switchForm('resetPasswordForm');
    } else {
        switchForm('loginForm', 'login');
    }

    updateLoginButtonState();
    console.log('[Auth] Sistema de autenticacao inicializado');
});
