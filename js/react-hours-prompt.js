// Small React-based hours prompt modal. Exposes
// window.showHoursPrompt({ label, defaultValue, includeTopics }) -> Promise<number|{hours,topics}|null>
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

            const [topics, setTopics] = React.useState(String((props && props.defaultTopics) || ''));

            function onClose(ok){
              if (!ok) { cleanup(); resolve(null); return; }
              const h = parseInt(hours, 10);
              const m = parseInt(minutes, 10);
              const hh = Number.isFinite(h) ? h : 0;
              const mm = Number.isFinite(m) ? Math.max(0, Math.min(59, m)) : 0;
              const num = hh + (mm / 60);
              const normalizedHours = Number.isFinite(num) ? num : 0;
              const normalizedTopics = String(topics || '').trim();
              cleanup();
              if (props && props.includeTopics) {
                resolve({ hours: normalizedHours, topics: normalizedTopics });
                return;
              }
              resolve(normalizedHours);
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
                props && props.includeTopics ? e('div', {style:{marginTop:12}},
                  e('label', {style:{display:'block',marginBottom:6,fontSize:'0.92rem',fontWeight:600,color:'rgba(255,255,255,0.82)'}}, 'Tópicos estudados nesta sessão'),
                  e('textarea', {
                    value: topics,
                    onChange:(ev)=>setTopics(ev.target.value),
                    rows: 4,
                    maxLength: 2000,
                    placeholder:'Ex.: Funções afins, exercícios 1 a 10, revisão para teste...',
                    className:'form-input',
                    style:{width:'100%',padding:'10px',borderRadius:'10px',border:'1px solid #ddd',resize:'vertical',fontFamily:'inherit'}
                  })
                ) : null,
                e('div', {style:{display:'flex',justifyContent:'flex-end',gap:8,marginTop:12}},
                  e('button', {onClick:()=>onClose(false), className:'btn-secondary'}, 'Cancelar'),
                  e('button', {onClick:()=>onClose(true), className:'btn-primary'}, 'Confirmar')
                )
              )
            );
          }

      root.render(e(HoursPrompt, {
        label: opts && opts.label,
        defaultValue: opts && opts.defaultValue,
        includeTopics: Boolean(opts && opts.includeTopics),
        defaultTopics: opts && opts.defaultTopics
      }));
    });
  }

  window.showHoursPrompt = function(opts){ return createPrompt(opts || {}); };
})();
