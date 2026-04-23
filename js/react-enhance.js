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

    React.useEffect(() => {
      try { document.documentElement.style.setProperty('--primary', accent); document.documentElement.style.setProperty('--secondary', accent); } catch(e){}
      try { localStorage.setItem('cerebrum_accent', accent); } catch(e){}
    }, [accent]);

    return e('div', {className: 'flex items-center space-x-2', style:{pointerEvents:'auto'}},
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
      )
    );

  }

  // mount into DOM
  try{
    var mountPoint = document.getElementById('headerQuickActions');
    if (!mountPoint) return;
    var container = document.createElement('div');
    container.id = 'react-enhance-root';
    mountPoint.appendChild(container);
    ReactDOM.createRoot(container).render(React.createElement(AccentControls));
  } catch(err){ console.error('react-enhance mount failed', err); }
})();
