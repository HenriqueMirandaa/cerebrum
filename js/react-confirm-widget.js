(function(){
  // Small React-based confirm modal widget that can be called via window.showReactConfirm({ message, onConfirm })
  // Requires global React and ReactDOM (UMD builds) and Tailwind (cdn) available on the page.

  function ensureContainer(){
    let c = document.getElementById('react-confirm-root');
    if (!c) {
      c = document.createElement('div');
      c.id = 'react-confirm-root';
      document.body.appendChild(c);
    }
    return c;
  }

  function createConfirmPromise(opts){
    const container = ensureContainer();
    const root = ReactDOM.createRoot(container);

    return new Promise((resolve) => {
      function cleanup(){ try { root.unmount(); } catch(e){} }

      function Confirm(props){
        const { message } = props || {};
        const okRef = React.useRef(null);
        const cancelRef = React.useRef(null);

        React.useEffect(() => {
          try { if (cancelRef.current) cancelRef.current.focus(); } catch(e){}
          const onKey = (e) => {
            if (e.key === 'Escape') props.onClose(false);
            if (e.key === 'Enter') props.onClose(true);
          };
          document.addEventListener('keydown', onKey);
          return () => document.removeEventListener('keydown', onKey);
        }, []);

        return React.createElement('div', {className: 'modal-overlay'},
          React.createElement('div', {role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Confirmação', className: 'modal-card'},
            React.createElement('div', {className: 'p-4'},
              React.createElement('div', {className: 'flex items-start gap-3'},
                React.createElement('div', {className: 'card-badge', style: {width: '40px', height: '40px', borderRadius: '10px'}}, '!'),
                React.createElement('div', {className: 'flex-1'},
                  React.createElement('h3', {className: 'text-lg font-semibold'}, 'Tem certeza que deseja sair?'),
                  React.createElement('p', {className: 'text-sm text-gray-500 mt-1'}, message || '')
                )
              ),
              React.createElement('div', {className: 'mt-4 flex justify-end gap-3'},
                React.createElement('button', {ref: cancelRef, onClick: () => props.onClose(false), className: 'btn-secondary'}, 'Cancelar'),
                React.createElement('button', {ref: okRef, onClick: () => props.onClose(true), className: 'btn-primary'}, 'Sair')
              )
            )
          )
        );
      }

      function onClose(result){ cleanup(); resolve(result); }

      root.render(React.createElement(Confirm, {message: opts && opts.message, onClose}));
    });
  }

  // Expose a simple API
  window.showReactConfirm = function(opts){
    if (!window.React || !window.ReactDOM) {
      // fallback to native confirm
      return Promise.resolve(confirm((opts && opts.message) || ''));
    }
    return createConfirmPromise(opts || {});
  };

})();
