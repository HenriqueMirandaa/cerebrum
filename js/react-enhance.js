(function(){
  // Progressive React enhancement: small Tailwind-styled control bar.
  // Non-destructive: preserves existing IDs and wiring.
  if (!window.React || !window.ReactDOM) {
    console.warn('React not available; react-enhance will not run.');
    return;
  }

  const e = React.createElement;

  function AccentControls(){
    const [accent, setAccent] = React.useState(localStorage.getItem('cerebrum_accent') || '#7c3aed');
    const [open, setOpen] = React.useState(false);
    const [query, setQuery] = React.useState('');
    const containerRef = React.useRef(null);

    React.useEffect(() => {
      try { document.documentElement.style.setProperty('--primary', accent); document.documentElement.style.setProperty('--secondary', accent); } catch(e){}
      try { localStorage.setItem('cerebrum_accent', accent); } catch(e){}
    }, [accent]);

    // Position container next to the header search input and make it fixed (static in viewport).
    React.useEffect(() => {
      function position(){
        const el = containerRef.current;
        if (!el) return;

        // measure after render to get correct container size
        window.requestAnimationFrame(() => {
          try {
            const search = document.getElementById('globalSearch');
            const cRect = el.getBoundingClientRect();
            const cW = Math.max(120, Math.round(cRect.width || 120));
            const cH = Math.round(cRect.height || 40);
            let left, top;

            if (search) {
              const sRect = search.getBoundingClientRect();
              // try to place to the left of the search input
              left = Math.round(sRect.left - cW - 8);
              // if not enough space on the left, place to the right
              if (left < 8) left = Math.round(sRect.right + 8);
              top = Math.round(sRect.top + (sRect.height / 2) - (cH / 2));
            } else {
              // fallback: center top
              left = Math.round(window.innerWidth / 2 - cW / 2);
              top = 12;
            }

            // constrain to viewport
            left = Math.max(8, Math.min(left, window.innerWidth - cW - 8));
            top = Math.max(8, Math.min(top, window.innerHeight - cH - 8));

            el.style.position = 'fixed';
            el.style.left = left + 'px';
            el.style.top = top + 'px';
            el.style.transform = 'none';
            el.style.zIndex = 99999;
          } catch (e) { /* ignore measurement errors */ }
        });
      }

      // initial position and on resize only (do not follow scroll)
      position();
      window.addEventListener('resize', position);
      return () => { window.removeEventListener('resize', position); };
    }, []);

    // hide legacy duplicates but keep them functional in DOM
    React.useEffect(() => {
      try {
        // removed '#globalSearch' from this list so the header search remains visible
        const legacySelectors = ['#themeToggle', '#logoutBtn'];
        legacySelectors.forEach(sel => {
          const el = document.querySelector(sel);
          if (el && !el.classList.contains('react-enhance-hidden')){
            el.classList.add('react-enhance-hidden');
            el.style.position = 'absolute'; el.style.left='-9999px'; el.style.width='1px'; el.style.height='1px'; el.style.overflow='hidden';
          }
        });
      } catch(e){ }
    }, []);

    function toggleTheme(){
      document.documentElement.classList.toggle('dark');
      try { localStorage.setItem('cerebrum_theme', document.documentElement.classList.contains('dark') ? 'dark' : 'light'); } catch(e){}
      const themeToggle = document.getElementById('themeToggle'); if (themeToggle){ const icon = themeToggle.querySelector('i'); if(icon){ icon.classList.toggle('fa-moon'); icon.classList.toggle('fa-sun'); } }
    }

    function onSearchChange(val){
      setQuery(val);
      // keep legacy input(s) updated so other code still sees it
      const legacyIds = ['#globalSearch', '#searchInput'];
      legacyIds.forEach(sel => {
        const legacy = document.querySelector(sel);
        if (legacy){ legacy.value = val; legacy.dispatchEvent(new Event('input', { bubbles:true })); }
      });
    }

    function onSearchFocus(){
      // forward focus to legacy search if present
      const legacy = document.querySelector('#searchInput') || document.querySelector('#globalSearch');
      if (legacy) legacy.focus();
    }

    return e('div', {ref: containerRef, className: 'flex items-center space-x-3', style:{pointerEvents:'auto'}},
      // Accent picker: opens palette to choose accent colors
      e('div', {className: 'relative'},
        e('button', {
          title: 'Acento',
          className: 'p-2 rounded-md',
          style: { background: 'linear-gradient(90deg,#7c3aed,#a78bfa)', color: '#fff' },
          onClick: () => setOpen(v => !v),
          'aria-haspopup': 'true',
          'aria-expanded': open
        }, e('i', { className: 'fas fa-fill-drip' })),
        open ? e('div', { className: 'mt-2 p-2 bg-white/5 rounded-md flex space-x-2 absolute right-0' },
          e('button', { className: 'w-8 h-8 rounded-full', style: { background: '#7c3aed' }, onClick: () => setAccent('#7c3aed'), title: 'Violeta' }),
          e('button', { className: 'w-8 h-8 rounded-full', style: { background: '#06b6d4' }, onClick: () => setAccent('#06b6d4'), title: 'Ciano' }),
          e('button', { className: 'w-8 h-8 rounded-full', style: { background: '#f97316' }, onClick: () => setAccent('#f97316'), title: 'Laranja' }),
          e('button', { className: 'w-8 h-8 rounded-full', style: { background: '#ec4899' }, onClick: () => setAccent('#ec4899'), title: 'Rosa' })
        ) : null
      ),
      // Logout shortcut (delegates to existing logout button if present)
      e('button', {
        title: 'Sair',
        className: 'p-2 rounded-md bg-white/5 hover:bg-white/8 text-white',
        onClick: () => { const sb = document.getElementById('logoutBtn'); if (sb) sb.click(); },
        'aria-label': 'Sair'
      }, e('i', { className: 'fas fa-sign-out-alt' }))
    );

  }

  // mount into DOM
  try{
    var container = document.createElement('div');
    container.id = 'react-enhance-root';
    document.body.appendChild(container);
    ReactDOM.createRoot(container).render(React.createElement(AccentControls));
  } catch(err){ console.error('react-enhance mount failed', err); }
})();
