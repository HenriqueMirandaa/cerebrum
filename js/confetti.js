// Lightweight confetti canvas: startConfetti(durationMs, options)
export function startConfetti(duration = 5000, options = {}) {
  const canvas = document.createElement('canvas');
  canvas.id = 'confetti-canvas';
  canvas.style.position = 'fixed';
  canvas.style.left = '0';
  canvas.style.top = '0';
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  canvas.style.zIndex = 10050;
  canvas.style.pointerEvents = 'none';
  document.body.appendChild(canvas);

  const ctx = canvas.getContext('2d');
  function resize(){ canvas.width = window.innerWidth; canvas.height = window.innerHeight; }
  resize();
  window.addEventListener('resize', resize);

  const colors = options.colors || [
    'rgba(16,185,129,0.95)', // green
    'rgba(124,58,237,0.95)',
    'rgba(99,102,241,0.95)',
    'rgba(79,70,229,0.95)'
  ];

  const pieces = [];
  const count = options.count || Math.floor(Math.min(140, (canvas.width*canvas.height)/9000));
  for (let i=0;i<count;i++){
    pieces.push({
      x: Math.random()*canvas.width,
      y: Math.random()*-canvas.height/2,
      w: 6 + Math.random()*10,
      h: 6 + Math.random()*10,
      speedX: (Math.random()-0.5)*8,
      speedY: 2 + Math.random()*6,
      rot: Math.random()*360,
      rotSpeed: (Math.random()-0.5)*20,
      color: colors[Math.floor(Math.random()*colors.length)],
      tilt: (Math.random()-0.5)*0.5
    });
  }

  let rafId;
  function frame(){
    ctx.clearRect(0,0,canvas.width,canvas.height);
    for (let p of pieces){
      p.x += p.speedX;
      p.y += p.speedY;
      p.speedY += 0.08;
      p.rot += p.rotSpeed * 0.02;
      const cx = p.x + Math.cos(p.rot*0.01)*p.tilt*10;
      ctx.save();
      ctx.translate(cx, p.y);
      ctx.rotate(p.rot*0.01);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.w/2, -p.h/2, p.w, p.h);
      ctx.restore();
    }
    rafId = requestAnimationFrame(frame);
  }
  rafId = requestAnimationFrame(frame);

  const timeout = setTimeout(stop, duration);
  function stop(){
    if (rafId) cancelAnimationFrame(rafId);
    try { window.removeEventListener('resize', resize); } catch(e){}
    try { canvas.remove(); } catch(e){}
    clearTimeout(timeout);
  }

  return { stop };
}

export function stopConfettiNow(){
  const c = document.getElementById('confetti-canvas'); if (c) try { c.remove(); } catch(e){}
}
