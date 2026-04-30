(function(){
  if (!window.React || !window.ReactDOM) {
    console.warn('React not available; react-enhance will not run.');
    return;
  }

  const e = React.createElement;
  const PRESET_COLORS = window.DarkColorPicker?.PRESET_COLORS || [
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

  function hexToRgb(hex) {
    const normalized = String(hex || '').replace('#', '').trim();
    if (!/^[0-9a-f]{6}$/i.test(normalized)) return { r: 124, g: 58, b: 237 };
    const int = parseInt(normalized, 16);
    return { r: (int >> 16) & 255, g: (int >> 8) & 255, b: int & 255 };
  }

  function rgbToHex(r, g, b) {
    return `#${[r, g, b].map((v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('')}`;
  }

  function rgbToHsl(r, g, b) {
    const nr = r / 255;
    const ng = g / 255;
    const nb = b / 255;
    const max = Math.max(nr, ng, nb);
    const min = Math.min(nr, ng, nb);
    const delta = max - min;
    let h = 0;
    let s = 0;
    const l = (max + min) / 2;

    if (delta !== 0) {
      s = delta / (1 - Math.abs(2 * l - 1));
      switch (max) {
        case nr: h = 60 * (((ng - nb) / delta) % 6); break;
        case ng: h = 60 * (((nb - nr) / delta) + 2); break;
        default: h = 60 * (((nr - ng) / delta) + 4); break;
      }
    }

    if (h < 0) h += 360;
    return { h, s, l };
  }

  function hslToRgb(h, s, l) {
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const hp = h / 60;
    const x = c * (1 - Math.abs((hp % 2) - 1));
    let r = 0, g = 0, b = 0;

    if (hp >= 0 && hp < 1) [r, g, b] = [c, x, 0];
    else if (hp < 2) [r, g, b] = [x, c, 0];
    else if (hp < 3) [r, g, b] = [0, c, x];
    else if (hp < 4) [r, g, b] = [0, x, c];
    else if (hp < 5) [r, g, b] = [x, 0, c];
    else [r, g, b] = [c, 0, x];

    const m = l - c / 2;
    return {
      r: (r + m) * 255,
      g: (g + m) * 255,
      b: (b + m) * 255
    };
  }

  function shiftTone(hex, lightnessDelta, saturationDelta) {
    const { r, g, b } = hexToRgb(hex);
    const hsl = rgbToHsl(r, g, b);
    const shifted = hslToRgb(
      hsl.h,
      clamp(hsl.s + saturationDelta, 0, 1),
      clamp(hsl.l + lightnessDelta, 0, 1)
    );
    return rgbToHex(shifted.r, shifted.g, shifted.b);
  }

  function applyAccentTheme(accent) {
    const root = document.documentElement;
    const { r, g, b } = hexToRgb(accent);
    const secondary = shiftTone(accent, -0.08, 0.04);
    const accentStrong = shiftTone(accent, -0.12, 0.08);
    const light = shiftTone(accent, 0.18, -0.08);
    const dark = shiftTone(accent, -0.2, 0.02);

    root.style.setProperty('--primary', accent);
    root.style.setProperty('--secondary', secondary);
    root.style.setProperty('--accent', accentStrong);
    root.style.setProperty('--primary-light', light);
    root.style.setProperty('--primary-dark', dark);
    root.style.setProperty('--brand-rgb', `${r}, ${g}, ${b}`);

    try {
      localStorage.setItem('cerebrum_accent', accent);
    } catch (error) {}

    try {
      if (window.ThreeParticles && typeof window.ThreeParticles.setColorScheme === 'function') {
        const primaryRgb = hexToRgb(accent);
        const secondaryRgb = hexToRgb(light);
        window.ThreeParticles.setColorScheme(
          [primaryRgb.r / 255, primaryRgb.g / 255, primaryRgb.b / 255],
          [secondaryRgb.r / 255, secondaryRgb.g / 255, secondaryRgb.b / 255]
        );
      }
    } catch (error) {}
  }

  function AccentControls(){
    const [accent, setAccent] = React.useState(localStorage.getItem('cerebrum_accent') || '#7c3aed');
    const [open, setOpen] = React.useState(false);
    const buttonRef = React.useRef(null);
    const popoverRef = React.useRef(null);
    const [position, setPosition] = React.useState({ top: 0, left: 0 });
    const rgb = hexToRgb(accent);

    React.useEffect(() => {
      applyAccentTheme(accent);
    }, [accent]);

    React.useEffect(() => {
      if (!open || !buttonRef.current) return;
      const updatePosition = () => {
        const rect = buttonRef.current.getBoundingClientRect();
        const top = clamp(rect.bottom + 12, 12, Math.max(12, window.innerHeight - 360));
        const left = clamp(rect.right - 292, 12, Math.max(12, window.innerWidth - 304));
        setPosition({ top, left });
      };

      updatePosition();
      window.addEventListener('resize', updatePosition);
      window.addEventListener('scroll', updatePosition, true);

      const handleEscape = (event) => {
        if (event.key === 'Escape') setOpen(false);
      };

      const handleClickAway = (event) => {
        if (buttonRef.current && buttonRef.current.contains(event.target)) return;
        if (popoverRef.current && popoverRef.current.contains(event.target)) return;
        setOpen(false);
      };

      document.addEventListener('keydown', handleEscape);
      document.addEventListener('mousedown', handleClickAway);
      return () => {
        window.removeEventListener('resize', updatePosition);
        window.removeEventListener('scroll', updatePosition, true);
        document.removeEventListener('keydown', handleEscape);
        document.removeEventListener('mousedown', handleClickAway);
      };
    }, [open]);

    const updateRgbChannel = (channel, value) => {
      const nextRgb = { ...rgb, [channel]: clamp(Number(value) || 0, 0, 255) };
      setAccent(rgbToHex(nextRgb.r, nextRgb.g, nextRgb.b));
    };

    const popover = open ? ReactDOM.createPortal(
      e('div', {
        ref: popoverRef,
        className: 'accent-popover',
        style: { top: `${position.top}px`, left: `${position.left}px` }
      },
        e('div', { className: 'accent-popover-header' },
          e('span', { className: 'accent-popover-side' }),
          e('div', { className: 'accent-popover-title-wrap' },
            e('div', { className: 'accent-popover-title' }, 'Paleta do site'),
            e('div', { className: 'accent-popover-caption' }, 'Escolhe o tom principal')
          ),
          e('button', {
            type: 'button',
            className: 'accent-popover-close',
            onClick: () => setOpen(false),
            'aria-label': 'Fechar paleta'
          }, e('i', { className: 'fas fa-times', 'aria-hidden': 'true' }))
        ),
        e('div', { className: 'accent-current-preview' },
          e('span', {
            className: 'accent-current-chip accent-current-chip--large',
            style: { background: `linear-gradient(135deg, ${accent}, ${shiftTone(accent, -0.1, 0.08)})` },
            'aria-hidden': 'true'
          }),
          e('span', { className: 'accent-current-value' }, accent.toUpperCase())
        ),
        e('div', { className: 'accent-section-title' }, 'Cores r\u00E1pidas'),
        e('div', { className: 'accent-grid' },
          ...PRESET_COLORS.map((color, index) => e('button', {
            key: color,
            type: 'button',
            className: `accent-swatch${accent.toLowerCase() === color.toLowerCase() ? ' is-active' : ''}`,
            onClick: () => setAccent(color),
            title: `Aplicar paleta ${index + 1}`,
            'aria-label': `Aplicar paleta ${index + 1}`
          },
            e('span', { className: 'accent-dot', style: { background: color } }),
            accent.toLowerCase() === color.toLowerCase()
              ? e('i', { className: 'fas fa-check accent-check', 'aria-hidden': 'true' })
              : null
          ))
        ),
        e('div', { className: 'accent-custom accent-custom--panel' },
          e('div', { className: 'accent-section-title accent-section-title--spaced' }, 'Cor personalizada'),
          e('div', { className: 'accent-rgb-grid' },
            ...['r', 'g', 'b'].map((channel) => e('div', {
              key: channel,
              className: 'accent-rgb-row'
            },
              e('span', { className: 'accent-rgb-label' }, channel.toUpperCase()),
              e('input', {
                className: 'accent-rgb-range',
                type: 'range',
                min: '0',
                max: '255',
                value: rgb[channel],
                onInput: (event) => updateRgbChannel(channel, event.target.value),
                'aria-label': `Canal ${channel.toUpperCase()}`
              }),
              e('input', {
                className: 'accent-rgb-number',
                type: 'number',
                min: '0',
                max: '255',
                value: rgb[channel],
                onInput: (event) => updateRgbChannel(channel, event.target.value),
                'aria-label': `Valor ${channel.toUpperCase()}`
              })
            ))
          )
        )
      ),
      document.body
    ) : null;

    return e('div', { className: 'flex items-center space-x-2', style:{pointerEvents:'auto'} },
      e('div', { className: 'relative' },
        e('button', {
          ref: buttonRef,
          type: 'button',
          title: 'Mudar paleta',
          className: `accent-trigger-btn${open ? ' is-open' : ''}`,
          onClick: () => setOpen(v => !v),
          'aria-label': 'Mudar paleta do site',
          'aria-haspopup': 'true',
          'aria-expanded': open
        },
          e('i', { className: 'fas fa-fill-drip', 'aria-hidden': 'true' }),
          e('span', {
            className: 'accent-trigger-dot',
            style: { background: accent },
            'aria-hidden': 'true'
          })
        ),
        popover
      )
    );
  }

  try{
    const mountPoint = document.getElementById('headerQuickActions');
    if (!mountPoint) return;
    const container = document.createElement('div');
    container.id = 'react-enhance-root';
    mountPoint.appendChild(container);
    ReactDOM.createRoot(container).render(React.createElement(AccentControls));
  } catch(err){ console.error('react-enhance mount failed', err); }
})();
