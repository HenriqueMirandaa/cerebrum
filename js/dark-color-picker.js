(function () {
    const PRESET_COLORS = [
        '#7c3aed',
        '#06b6d4',
        '#f97316',
        '#ec4899',
        '#22c55e',
        '#eab308'
    ];

    function clamp(value, min, max) {
        return Math.min(max, Math.max(min, value));
    }

    function normalizeHex(value) {
        const raw = String(value || '').trim().replace('#', '');
        if (/^[0-9a-f]{6}$/i.test(raw)) return `#${raw.toLowerCase()}`;
        if (/^[0-9a-f]{3}$/i.test(raw)) return `#${raw.split('').map((char) => char + char).join('').toLowerCase()}`;
        return '#6366f1';
    }

    function hexToRgb(hex) {
        const normalized = normalizeHex(hex).replace('#', '');
        const int = parseInt(normalized, 16);
        return {
            r: (int >> 16) & 255,
            g: (int >> 8) & 255,
            b: int & 255
        };
    }

    function rgbToHex(r, g, b) {
        return `#${[r, g, b].map((value) => clamp(Number(value) || 0, 0, 255).toString(16).padStart(2, '0')).join('')}`;
    }

    function createPickerMarkup(color) {
        return `
            <div class="dark-color-picker__top">
                <span class="dark-color-picker__preview" data-role="preview" style="background:${color}"></span>
                <div class="dark-color-picker__meta">
                    <span class="dark-color-picker__title">Cor personalizada</span>
                    <span class="dark-color-picker__value" data-role="hex">${color.toUpperCase()}</span>
                </div>
            </div>
            <div class="dark-color-picker__swatches">
                ${PRESET_COLORS.map((preset, index) => `
                    <button type="button" class="dark-color-picker__swatch" data-role="swatch" data-color="${preset}" aria-label="Aplicar cor ${index + 1}">
                        <span class="dark-color-picker__swatch-color" style="background:${preset}"></span>
                        <i class="fas fa-check dark-color-picker__swatch-check" data-role="check" hidden></i>
                    </button>
                `).join('')}
            </div>
            <div class="dark-color-picker__rgb">
                ${['R', 'G', 'B'].map((channel) => `
                    <div class="dark-color-picker__rgb-row">
                        <span class="dark-color-picker__rgb-label">${channel}</span>
                        <input class="dark-color-picker__range" data-role="range" data-channel="${channel.toLowerCase()}" type="range" min="0" max="255" value="0">
                        <input class="dark-color-picker__number" data-role="number" data-channel="${channel.toLowerCase()}" type="number" min="0" max="255" value="0" inputmode="numeric">
                    </div>
                `).join('')}
            </div>
        `;
    }

    function syncPicker(input, picker, color) {
        const value = normalizeHex(color);
        const rgb = hexToRgb(value);

        input.value = value;
        input.setAttribute('value', value);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));

        picker.style.setProperty('--dark-color-picker-rgb', `${rgb.r}, ${rgb.g}, ${rgb.b}`);

        const preview = picker.querySelector('[data-role="preview"]');
        if (preview) preview.style.background = value;

        const hexText = picker.querySelector('[data-role="hex"]');
        if (hexText) hexText.textContent = value.toUpperCase();

        picker.querySelectorAll('[data-role="range"]').forEach((range) => {
            range.value = rgb[range.dataset.channel];
        });

        picker.querySelectorAll('[data-role="number"]').forEach((field) => {
            field.value = rgb[field.dataset.channel];
        });

        picker.querySelectorAll('[data-role="swatch"]').forEach((swatch) => {
            const active = normalizeHex(swatch.dataset.color) === value;
            swatch.classList.toggle('is-active', active);
            const check = swatch.querySelector('[data-role="check"]');
            if (check) check.hidden = !active;
        });
    }

    function setRgbChannel(input, picker, channel, nextValue) {
        const rgb = hexToRgb(input.value);
        rgb[channel] = clamp(Number(nextValue) || 0, 0, 255);
        syncPicker(input, picker, rgbToHex(rgb.r, rgb.g, rgb.b));
    }

    function enhanceInput(input) {
        if (!input || input.dataset.darkColorEnhanced === 'true') return;
        input.dataset.darkColorEnhanced = 'true';
        input.classList.add('dark-color-picker__native');

        const color = normalizeHex(input.value || input.getAttribute('value'));
        const picker = document.createElement('div');
        picker.className = 'dark-color-picker';
        picker.innerHTML = createPickerMarkup(color);
        input.insertAdjacentElement('afterend', picker);

        picker.querySelectorAll('[data-role="swatch"]').forEach((swatch) => {
            swatch.addEventListener('click', function () {
                syncPicker(input, picker, swatch.dataset.color);
            });
        });

        picker.querySelectorAll('[data-role="range"]').forEach((range) => {
            range.addEventListener('input', function () {
                setRgbChannel(input, picker, range.dataset.channel, range.value);
            });
        });

        picker.querySelectorAll('[data-role="number"]').forEach((field) => {
            const update = function () {
                setRgbChannel(input, picker, field.dataset.channel, field.value);
            };
            field.addEventListener('input', update);
            field.addEventListener('change', update);
        });

        input.addEventListener('change', function () {
            syncPicker(input, picker, input.value);
        });

        syncPicker(input, picker, color);
    }

    function enhanceWithin(root) {
        const scope = root || document;
        if (!(scope instanceof Element) && scope !== document) return;
        scope.querySelectorAll('input[type="color"]').forEach(enhanceInput);
    }

    function observeNewInputs() {
        if (!window.MutationObserver || !document.body) return;
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                mutation.addedNodes.forEach((node) => {
                    if (!(node instanceof Element)) return;
                    if (node.matches && node.matches('input[type="color"]')) enhanceInput(node);
                    enhanceWithin(node);
                });
            });
        });
        observer.observe(document.body, { childList: true, subtree: true });
    }

    window.DarkColorPicker = {
        PRESET_COLORS,
        enhanceWithin,
        normalizeHex,
        hexToRgb,
        rgbToHex
    };

    document.addEventListener('DOMContentLoaded', function () {
        enhanceWithin(document);
        observeNewInputs();
    });
})();
