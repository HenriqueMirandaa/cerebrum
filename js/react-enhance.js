(function(){
  if (!window.React || !window.ReactDOM) {
    console.warn('React not available; react-enhance will not run.');
    return;
  }

  const e = React.createElement;
  const PRESET_COLORS = [
    { value: '#7c3aed', label: 'Violeta' },
    { value: '#06b6d4', label: 'Ciano' },
    { value: '#f97316', label: 'Laranja' },
    { value: '#ec4899', label: 'Rosa' },
    { value: '#22c55e', label: 'Verde' },
    { value: '#eab308', label: 'Dourado' }
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

    React.useEffect(() => {
      applyAccentTheme(accent);
    }, [accent]);

    React.useEffect(() => {
      if (!open || !buttonRef.current) return;
      const updatePosition = () => {
        const rect = buttonRef.current.getBoundingClientRect();
        const top = rect.bottom + 10;
        const left = Math.max(12, rect.right - 220);
        setPosition({ top, left });
      };

      updatePosition();
      window.addEventListener('resize', updatePosition);
      window.addEventListener('scroll', updatePosition, true);

      const handleClickAway = (event) => {
        if (buttonRef.current && buttonRef.current.contains(event.target)) return;
        if (popoverRef.current && popoverRef.current.contains(event.target)) return;
        setOpen(false);
      };

      document.addEventListener('mousedown', handleClickAway);
      return () => {
        window.removeEventListener('resize', updatePosition);
        window.removeEventListener('scroll', updatePosition, true);
        document.removeEventListener('mousedown', handleClickAway);
      };
    }, [open]);

    const popover = open ? ReactDOM.createPortal(
      e('div', {
        ref: popoverRef,
        className: 'accent-popover',
        style: { top: `${position.top}px`, left: `${position.left}px` }
      },
        e('div', { style: { marginBottom: '8px', fontSize: '0.82rem', fontWeight: 700, letterSpacing: '0.02em' } }, 'Tema do site'),
        e('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '10px' } },
          ...PRESET_COLORS.map((color) => e('button', {
            key: color.value,
            type: 'button',
            className: 'w-8 h-8 rounded-full',
            style: {
              background: color.value,
              outline: accent.toLowerCase() === color.value.toLowerCase() ? '2px solid rgba(255,255,255,0.9)' : 'none',
              outlineOffset: '2px'
            },
            onClick: () => {
              setAccent(color.value);
              setOpen(false);
            },
            title: color.label,
            'aria-label': color.label
          }))
        )
      ),
      document.body
    ) : null;

    return e('div', { className: 'flex items-center space-x-2', style:{pointerEvents:'auto'} },
      e('div', { className: 'relative' },
        e('button', {
          ref: buttonRef,
          type: 'button',
          title: 'Tema',
          className: 'p-2 rounded-md',
          style: { background: 'linear-gradient(90deg,var(--primary),var(--secondary))', color: '#fff' },
          onClick: () => setOpen(v => !v),
          'aria-haspopup': 'true',
          'aria-expanded': open
        }, e('i', { className: 'fas fa-fill-drip' })),
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
