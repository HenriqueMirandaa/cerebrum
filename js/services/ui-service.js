const TOAST_CONTAINER_ID = 'app-toast-container';

function ensureToastContainer() {
    let container = document.getElementById(TOAST_CONTAINER_ID);
    if (container) return container;

    container = document.createElement('div');
    container.id = TOAST_CONTAINER_ID;
    container.className = 'app-toast-container';
    document.body.appendChild(container);
    return container;
}

export function showToast(message, type = 'info', timeout = 3200) {
    const container = ensureToastContainer();
    const toast = document.createElement('div');
    toast.className = `app-toast app-toast--${type}`;
    toast.textContent = message;
    container.appendChild(toast);

    requestAnimationFrame(() => toast.classList.add('is-visible'));

    window.setTimeout(() => {
        toast.classList.remove('is-visible');
        window.setTimeout(() => toast.remove(), 240);
    }, timeout);
}

export function setButtonLoading(button, isLoading, loadingText = 'Processando...') {
    if (!button) return;

    if (isLoading) {
        if (!button.dataset.originalLabel) {
            button.dataset.originalLabel = button.innerHTML;
        }
        button.disabled = true;
        button.classList.add('is-loading');
        button.innerHTML = `<span class="btn-spinner" aria-hidden="true"></span>${loadingText}`;
        return;
    }

    button.disabled = false;
    button.classList.remove('is-loading');
    if (button.dataset.originalLabel) {
        button.innerHTML = button.dataset.originalLabel;
        delete button.dataset.originalLabel;
    }
}

export function setRegionLoading(target, isLoading, message = 'Carregando...') {
    if (!target) return;

    if (isLoading) {
        target.dataset.loading = 'true';
        target.setAttribute('aria-busy', 'true');
        if (!target.querySelector('.region-loading')) {
            const loading = document.createElement('div');
            loading.className = 'region-loading';
            loading.innerHTML = `
                <span class="btn-spinner" aria-hidden="true"></span>
                <span>${message}</span>
            `;
            target.appendChild(loading);
        }
        return;
    }

    target.dataset.loading = 'false';
    target.setAttribute('aria-busy', 'false');
    const loading = target.querySelector('.region-loading');
    if (loading) loading.remove();
}
