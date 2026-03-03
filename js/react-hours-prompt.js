// Small React-based hours prompt modal. Exposes window.showHoursPrompt({ label, defaultValue }) -> Promise<number|null>
(function(){
  if (!window.React || !window.ReactDOM) {
    window.showHoursPrompt = function(){ return Promise.resolve(null); };
    return;
  }
  const e = React.createElement;

  function createPrompt(opts){
    const container = document.createElement('div');
    container.id = 'react-hours-prompt-root';
    document.body.appendChild(container);
    const root = ReactDOM.createRoot(container);

    return new Promise((resolve) => {
      function cleanup(){ try { root.unmount(); } catch(e){} try { container.remove(); } catch(e){} }

      function HoursPrompt(props){
            // defaultValue expected in decimal hours (e.g., 1.5)
            const dv = (props && typeof props.defaultValue !== 'undefined' && props.defaultValue !== null) ? Number(props.defaultValue) : null;
            const defaultHours = dv != null && Number.isFinite(dv) ? Math.floor(Math.abs(dv)) : '';
            const defaultMinutes = dv != null && Number.isFinite(dv) ? Math.round((Math.abs(dv) - Math.floor(Math.abs(dv))) * 60) : '';
            const [hours, setHours] = React.useState(defaultHours !== '' ? String(defaultHours) : '');
            const [minutes, setMinutes] = React.useState(defaultMinutes !== '' ? String(defaultMinutes) : '');
            const hoursRef = React.useRef(null);

            React.useEffect(() => { try { if (hoursRef.current) hoursRef.current.focus(); } catch(e){} }, []);

            function onClose(ok){
              if (!ok) { cleanup(); resolve(null); return; }
              const h = parseInt(hours, 10);
              const m = parseInt(minutes, 10);
              const hh = Number.isFinite(h) ? h : 0;
              const mm = Number.isFinite(m) ? Math.max(0, Math.min(59, m)) : 0;
              const num = hh + (mm / 60);
              cleanup(); resolve(Number.isFinite(num) ? num : null);
            }

            return e('div', {className:'modal-overlay'},
              e('div', {className:'modal-card', role:'dialog', 'aria-modal':'true', 'aria-label': props.label || 'Tempo estudado'},
                e('div', {style:{marginBottom:12}},
                  e('h3', {style:{margin:0,fontSize:'1.125rem',fontWeight:700}}, props.label || 'Quanto tempo você estudou nesta sessão?')
                ),
                e('div', {style:{display:'flex',gap:8,alignItems:'center'}},
                  e('input', {ref:hoursRef, type:'number', step:'1', min:'0', value:hours, onChange:(ev)=>setHours(ev.target.value), className:'form-input', style:{width:'80px',padding:'8px',borderRadius:'8px',border:'1px solid #ddd'}}, null),
                  e('div', {style:{color:'rgba(255,255,255,0.7)' , fontSize: '0.95rem', paddingLeft:4, paddingRight:4}}, 'h'),
                  e('input', {type:'number', step:'1', min:'0', max:'59', value:minutes, onChange:(ev)=>setMinutes(ev.target.value), className:'form-input', style:{width:'80px',padding:'8px',borderRadius:'8px',border:'1px solid #ddd'}}, null),
                  e('div', {style:{color:'rgba(255,255,255,0.7)' , fontSize: '0.95rem', paddingLeft:4}}, 'm')
                ),
                e('div', {style:{display:'flex',justifyContent:'flex-end',gap:8,marginTop:12}},
                  e('button', {onClick:()=>onClose(false), className:'btn-secondary'}, 'Cancelar'),
                  e('button', {onClick:()=>onClose(true), className:'btn-primary'}, 'Confirmar')
                )
              )
            );
          }

      root.render(e(HoursPrompt, { label: opts && opts.label, defaultValue: opts && opts.defaultValue }));
    });
  }

  window.showHoursPrompt = function(opts){ return createPrompt(opts || {}); };
})();
