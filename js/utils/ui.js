// Site-styled UI helpers (confirm modal)
// Defensive stub: ensure SiteUI exists even if this script fails to load fully
window.SiteUI = window.SiteUI || {};
if (!window.SiteUI.confirm) {
    // fallback to native confirm wrapped in a Promise so callers can await it
    window.SiteUI.confirm = function(arg1){
        try {
            if (typeof arg1 === 'string') return Promise.resolve(confirm(arg1));
            if (arg1 && arg1.message) return Promise.resolve(confirm(arg1.message));
        } catch (e) { /* ignore */ }
        return Promise.resolve(false);
    };
}

(function(){
    // Debug: indicate helper loaded
    try { console.debug('[SiteUI] loaded (enhanced)'); } catch (e) { /* ignore */ }
    function createConfirm(options){
        const { title='Confirmação', message='', okText='OK', cancelText='Cancelar' } = options || {};

        return new Promise((resolve) => {
            // avoid duplicates
            if (document.getElementById('site-confirm-overlay')) return resolve(false);

            const overlay = document.createElement('div');
            overlay.id = 'site-confirm-overlay';
            overlay.className = 'modal-overlay';

            const card = document.createElement('div');
            card.className = 'modal-card';

            card.innerHTML = `
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
                    <div style="display:flex;gap:12px;align-items:center;">
                        <div class="card-badge" style="width:40px;height:40px;border-radius:10px;background:linear-gradient(135deg,var(--primary),var(--secondary));font-weight:700;">!</div>
                        <div>
                            <div style="font-weight:700;font-size:1rem;">${title}</div>
                            <div style="color:var(--gray-500);font-size:0.95rem;margin-top:4px;">${message}</div>
                        </div>
                    </div>
                    <div style="display:flex;gap:8px;align-items:center;">
                        <button id="site-confirm-cancel" class="btn-secondary">${cancelText}</button>
                        <button id="site-confirm-ok" class="btn-primary">${okText}</button>
                    </div>
                </div>
            `;

            overlay.appendChild(card);
            document.body.appendChild(overlay);

            // accessibility: set attributes
            card.setAttribute('role', 'dialog');
            card.setAttribute('aria-modal', 'true');
            card.setAttribute('aria-label', title || 'Confirmação');

            function cleanup() {
                try { document.removeEventListener('keydown', onKey); }
                catch(e){}
                // play exit animation then remove
                try {
                    overlay.classList.add('closing');
                    const cardAnimEl = card;
                    const onEnd = () => { try { overlay.remove(); } catch (e){} finally { cardAnimEl.removeEventListener('animationend', onEnd); } };
                    cardAnimEl.addEventListener('animationend', onEnd);
                    // fallback (must be slightly longer than CSS exit animation)
                    setTimeout(() => { try { overlay.remove(); } catch(e){} }, 600);
                } catch (e) { try { overlay.remove(); } catch (e){} }
            }

            const okBtn = document.getElementById('site-confirm-ok');
            const cancelBtn = document.getElementById('site-confirm-cancel');

            const onOk = () => { cleanup(); resolve(true); };
            const onCancel = () => { cleanup(); resolve(false); };

            if (okBtn) okBtn.addEventListener('click', onOk);
            if (cancelBtn) cancelBtn.addEventListener('click', onCancel);

            // focus management
            try { if (okBtn) okBtn.focus(); } catch(e) {}

            // click outside closes as cancel
            overlay.addEventListener('click', (ev) => { if (ev.target === overlay) onCancel(); });

            // keyboard handlers
            const onKey = (ev) => {
                if (ev.key === 'Escape') { onCancel(); }
                if (ev.key === 'Enter') { onOk(); }
            };
            document.addEventListener('keydown', onKey);

            // nothing else to do here; cleanup already removes key handler
        });
    }

    // Expose a simple confirm API: SiteUI.confirm(messageOrOptions)
    window.SiteUI = window.SiteUI || {};
    window.SiteUI.confirm = function(arg1, arg2){
        if (!arg1) return Promise.resolve(false);
        if (typeof arg1 === 'string') return createConfirm({ message: arg1, ...(arg2||{}) });
        return createConfirm(arg1);
    };

    // Open/close modal helpers with animations.
    window.SiteUI.openModal = function(elOrId) {
        const el = typeof elOrId === 'string' ? document.getElementById(elOrId) : elOrId;
        if (!el) return;
        try { el.classList.remove('closing'); el.classList.remove('hidden'); }
        catch(e){}
        // focus first focusable element
        try {
            const first = el.querySelector('input, button, select, textarea');
            if (first) first.focus();
        } catch(e){}
    };

    window.SiteUI.closeModal = function(elOrId) {
        const el = typeof elOrId === 'string' ? document.getElementById(elOrId) : elOrId;
        if (!el) return;
        try {
            // add closing class to run exit animation, then hide after animation
            el.classList.add('closing');
            const container = el.querySelector('.modal-container') || el.querySelector('.modal-card') || el;
            const onEnd = () => { try { el.classList.add('hidden'); el.classList.remove('closing'); } catch(e){} finally { if (container) container.removeEventListener('animationend', onEnd); } };
            if (container) container.addEventListener('animationend', onEnd);
            // fallback hide (must be slightly longer than CSS exit animation)
            setTimeout(() => { try { el.classList.add('hidden'); el.classList.remove('closing'); } catch(e){} }, 600);
        } catch(e) { try { el.classList.add('hidden'); } catch(e){} }
    };
})();
