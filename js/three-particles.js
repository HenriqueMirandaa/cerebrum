/* js/three-particles.js
   GPU-driven particle field with orbital trajectories, cursor attraction,
   lightweight temporary connections and admin API.

   - Exposes `window.ThreeParticles` with control methods
   - Graceful fallback for no-WebGL or low-end devices
*/
(function(){
    // Safety: don't run twice
    if (window.ThreeParticles) return;

    const cfgDefaults = {
        // reduce default particle count so particles can meaningfully follow cursor
        targetCount: 2600,
        calmCount: 3000,
        energizedMultiplier: 1.8,
        calmMultiplier: 0.45,
        // Aumentado para tornar partículas maiores e mais visíveis
        baseSize: 5.4,
        connectionSample: 360, // samples for connection checks
        connectionDistance: 110, // px threshold
        deviceFallbackThreshold: 2800 // fallback particle count for low-end
    };

    function detectLowEnd(){
        // Basic heuristics: mobile UA or low logical cores
        try {
            const ua = navigator.userAgent || '';
            const isMobile = /Mobi|Android|iPhone|iPad|iPod|Windows Phone/i.test(ua);
            const cores = navigator.hardwareConcurrency || 2;
            return isMobile || cores <= 2;
        } catch (e) { return true; }
    }

    function clamp(v,a,b){ return Math.max(a, Math.min(b, v)); }
    function normalizedToRgb(arr){
        return {
            r: Math.round(clamp((arr && arr[0] != null ? arr[0] : 0.54) * 255, 0, 255)),
            g: Math.round(clamp((arr && arr[1] != null ? arr[1] : 0.36) * 255, 0, 255)),
            b: Math.round(clamp((arr && arr[2] != null ? arr[2] : 0.95) * 255, 0, 255))
        };
    }
    function rgbaFrom(rgb, alpha){
        return `rgba(${rgb.r},${rgb.g},${rgb.b},${alpha})`;
    }
    function mixRgb(a, b, t){
        return {
            r: Math.round(a.r + (b.r - a.r) * t),
            g: Math.round(a.g + (b.g - a.g) * t),
            b: Math.round(a.b + (b.b - a.b) * t)
        };
    }

    // Small helper for creating shader material
    const vertexShader = `
    uniform float uTime;
    uniform float uSize;
    uniform vec2 uCursor; // normalized -1..1
    uniform float uCursorForce; // 0..1
    attribute float aRadius;
    attribute float aPhase;
    attribute float aSpeed;
    attribute float aIncl;
    attribute float aFollow; // 0 or 1 => stronger follower
    varying float vVelocity;
    void main(){
        float t = uTime * aSpeed + aPhase;
        // base orbit in XZ plane
        float x = cos(t) * aRadius;
        float z = sin(t) * aRadius;
        float y = sin(t * 0.5 + aIncl) * (aRadius * 0.06);

        // cursor influence (screen-space approximation)
        vec4 mvPosition = modelViewMatrix * vec4(x, y, z, 1.0);
        vec4 projected = projectionMatrix * mvPosition;
        vec2 ndc = projected.xy / projected.w; // -1..1
        vec2 diff = uCursor - ndc;
        float dist = length(diff);
        // stronger, nonlinear falloff so particles move noticeably toward cursor
        float force = uCursorForce * exp(-dist * 2.8) * (1.0 / (0.01 + dist*2.5));
        // followers get a much stronger pull; mix using aFollow attribute
        float followMul = 1.0 + aFollow * 12.0;
        mvPosition.xy += diff * force * 1.2 * followMul;

        vec4 finalPos = projectionMatrix * mvPosition;
        gl_Position = finalPos;
        // point size attenuation; followers are larger
        float size = uSize * (1.0 + (aRadius * 0.0009) + aFollow * 0.9);
        gl_PointSize = size * (300.0 / -mvPosition.z);

        // velocity visual value (approx)
        vVelocity = abs(aSpeed);
    }
    `;

    const fragmentShader = `
    precision mediump float;
    varying float vVelocity;
    uniform vec3 uColorA;
    uniform vec3 uColorB;
    void main(){
        float dist = length(gl_PointCoord - vec2(0.5));
        if (dist > 0.5) discard;
        float t = clamp(vVelocity, 0.0, 1.0);
        vec3 color = mix(uColorA, uColorB, t);
        float alpha = 1.0 - smoothstep(0.3, 0.5, dist);
        gl_FragColor = vec4(color, alpha);
    }
    `;

    function ThreeParticles(canvas){
        this.canvas = canvas;
        this.running = false;
        this._init();
    }

    ThreeParticles.prototype._init = function(){
        const lowEnd = detectLowEnd();
        this.config = Object.assign({}, cfgDefaults);
        this.deviceLow = lowEnd;
        if (lowEnd) this.config.targetCount = Math.min(this.config.targetCount, this.config.deviceFallbackThreshold);

        this.params = {
            speedMult: 1.0,
            mode: 'calm',
            // increase default cursor force so particles noticeably chase the pointer
            cursorForce: 8.5,
            colors: { a: [0.54,0.36,0.95], b: [0.82,0.58,1.0] }
        };
        this._overlayPalette = {
            primary: normalizedToRgb(this.params.colors.a),
            secondary: normalizedToRgb(this.params.colors.b)
        };

        // Three.js setup
        try {
            this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: false, alpha: true });
        } catch (e){
            this._fallback = true; return;
        }
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        this.renderer.setSize(window.innerWidth, window.innerHeight, false);
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(60, window.innerWidth/window.innerHeight, 1, 2000);
        this.camera.position.set(0, 120, 380);

        this.timeStart = performance.now() / 1000;

        // geometry + attributes
        this.count = this.config.targetCount;
        this.geometry = new THREE.BufferGeometry();
        const posArray = new Float32Array(this.count * 3);
        const aRadius = new Float32Array(this.count);
        const aPhase = new Float32Array(this.count);
        const aSpeed = new Float32Array(this.count);
        const aIncl = new Float32Array(this.count);
        const aFollow = new Float32Array(this.count);

        for (let i=0;i<this.count;i++){
            // not used as base positions, but keep arrays consistent
            posArray[i*3+0]=0; posArray[i*3+1]=0; posArray[i*3+2]=0;
            aRadius[i] = 20 + Math.pow(Math.random(), 1.5) * 1600.0; // spread
            aPhase[i] = Math.random() * Math.PI * 2.0;
            aSpeed[i] = 0.1 + Math.random() * 1.4;
            aIncl[i] = (Math.random()-0.5) * 6.2831;
            // small subset flagged to follow the cursor strongly
            // increase probability so more particles actively chase the cursor
            aFollow[i] = (Math.random() < 0.32) ? 1.0 : 0.0;
        }

        this.geometry.setAttribute('position', new THREE.BufferAttribute(posArray, 3));
        this.geometry.setAttribute('aRadius', new THREE.BufferAttribute(aRadius, 1));
        this.geometry.setAttribute('aPhase', new THREE.BufferAttribute(aPhase, 1));
        this.geometry.setAttribute('aSpeed', new THREE.BufferAttribute(aSpeed, 1));
        this.geometry.setAttribute('aIncl', new THREE.BufferAttribute(aIncl, 1));
        this.geometry.setAttribute('aFollow', new THREE.BufferAttribute(aFollow, 1));

        this.material = new THREE.ShaderMaterial({
            uniforms: {
                uTime: { value: 0 },
                uSize: { value: this.config.baseSize },
                uCursor: { value: new THREE.Vector2(10,10) },
                uCursorForce: { value: this.params.cursorForce },
                uColorA: { value: new THREE.Color().fromArray(this.params.colors.a) },
                uColorB: { value: new THREE.Color().fromArray(this.params.colors.b) }
            },
            vertexShader: vertexShader,
            fragmentShader: fragmentShader,
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending
        });

        this.points = new THREE.Points(this.geometry, this.material);
        this.scene.add(this.points);

        // 2D overlay for lightweight particle connections
        this._overlay = document.createElement('canvas');
        this._overlay.style.position = 'fixed';
        this._overlay.style.inset = '0';
        this._overlay.style.pointerEvents = 'none';
        this._overlayCtx = this._overlay.getContext('2d');
        document.body.appendChild(this._overlay);
        this._overlay.width = window.innerWidth; this._overlay.height = window.innerHeight;

        this._cursor = { x: 9999, y: 9999, ndcX: 10, ndcY: 10 };
        // smoothed cursor used to make particle attraction follow softly
        this._smoothedCursor = new THREE.Vector2(this._cursor.ndcX, this._cursor.ndcY);
        this._bindEvents();
        this._lastFrameTime = performance.now();
        this._frameId = null;
        this._fpsSamples = [];
        this._samplePositions = new Float32Array(this.config.connectionSample * 3);
    };

    ThreeParticles.prototype._bindEvents = function(){
        window.addEventListener('resize', ()=>{
            if (this.renderer){
                this.renderer.setSize(window.innerWidth, window.innerHeight, false);
            }
            if (this._overlay){
                this._overlay.width = window.innerWidth; this._overlay.height = window.innerHeight;
            }
            if (this.camera) this.camera.aspect = window.innerWidth / window.innerHeight, this.camera.updateProjectionMatrix();
        });

        window.addEventListener('pointermove', (e)=>{
            this._cursor.x = e.clientX; this._cursor.y = e.clientY;
            const ndcX = (e.clientX / window.innerWidth) * 2 - 1;
            const ndcY = - (e.clientY / window.innerHeight) * 2 + 1;
            this._cursor.ndcX = ndcX; this._cursor.ndcY = ndcY;
        });
        window.addEventListener('pointerleave', ()=>{
            this._cursor.x = 9999; this._cursor.y = 9999;
            this._cursor.ndcX = 10; this._cursor.ndcY = 10;
        });
        window.addEventListener('pointerdown', ()=>{ this.setMode('energized'); setTimeout(()=>this.setMode('calm'), 1200); });
    };

    ThreeParticles.prototype._sampleParticlePositions = function(time){
        // compute positions for a sample subset (for drawing connections)
        const aR = this.geometry.getAttribute('aRadius').array;
        const aPh = this.geometry.getAttribute('aPhase').array;
        const aS = this.geometry.getAttribute('aSpeed').array;
        const aI = this.geometry.getAttribute('aIncl').array;
        const sample = this.config.connectionSample;
        const N = this.count;
        for (let i=0;i<sample;i++){
            const idx = Math.floor((i / sample) * N);
            const r = aR[idx];
            const t = time * aS[idx] + aPh[idx];
            const x = Math.cos(t) * r;
            const z = Math.sin(t) * r;
            const y = Math.sin(t * 0.5 + aI[idx]) * (r * 0.06);
            // project to screen
            const v = new THREE.Vector3(x,y,z);
            v.project(this.camera);
            const sx = (v.x * 0.5 + 0.5) * this._overlay.width;
            const sy = (-v.y * 0.5 + 0.5) * this._overlay.height;
            this._samplePositions[i*3+0] = sx; this._samplePositions[i*3+1] = sy; this._samplePositions[i*3+2] = (x*x+y*y+z*z);
        }
    };

    ThreeParticles.prototype._drawConnections = function(){
        const ctx = this._overlayCtx; const w = this._overlay.width; const h = this._overlay.height;
        const primary = this._overlayPalette.primary;
        const secondary = this._overlayPalette.secondary;
        const mid = mixRgb(primary, secondary, 0.45);
        ctx.clearRect(0,0,w,h);
        ctx.lineWidth = 1.05; ctx.strokeStyle = rgbaFrom(mid, 0.2);
        const sample = this.config.connectionSample;
        const positions = this._samplePositions;
        for (let i=0;i<sample;i++){
            const x1 = positions[i*3+0], y1 = positions[i*3+1];
            for (let j=i+1;j<sample && j<i+6;j++){ // limited checks for perf
                const x2 = positions[j*3+0], y2 = positions[j*3+1];
                const dx = x1-x2, dy = y1-y2; const d2 = dx*dx+dy*dy;
                if (d2 < (this.config.connectionDistance*this.config.connectionDistance)){
                    ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke();
                }
            }
        }

        // Cursor-reactive lines to make interaction clearly visible
        const cursorX = this._cursor.x;
        const cursorY = this._cursor.y;
        if (cursorX >= 0 && cursorX <= w && cursorY >= 0 && cursorY <= h) {
            const cursorRadius = 260;
            const cursorRadius2 = cursorRadius * cursorRadius;
            ctx.lineWidth = 1.2;
            for (let i = 0; i < sample; i += 2) {
                const x = positions[i*3+0], y = positions[i*3+1];
                const dx = cursorX - x;
                const dy = cursorY - y;
                const d2 = dx*dx + dy*dy;
                if (d2 < cursorRadius2) {
                    const alpha = 0.34 * (1 - d2 / cursorRadius2);
                    ctx.strokeStyle = rgbaFrom(secondary, alpha.toFixed(3));
                    ctx.beginPath();
                    ctx.moveTo(cursorX, cursorY);
                    ctx.lineTo(x, y);
                    ctx.stroke();
                }
            }

            const halo = ctx.createRadialGradient(cursorX, cursorY, 6, cursorX, cursorY, 120);
            halo.addColorStop(0, rgbaFrom(secondary, 0.20));
            halo.addColorStop(0.6, rgbaFrom(primary, 0.06));
            halo.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = halo;
            ctx.beginPath();
            ctx.arc(cursorX, cursorY, 120, 0, Math.PI * 2);
            ctx.fill();
        }
    };

    ThreeParticles.prototype._frame = function(){
        if (!this.running) return;
        const now = performance.now();
        const time = (now/1000) - this.timeStart;
        // fps tracking
        const dt = now - this._lastFrameTime; this._lastFrameTime = now;
        const fps = 1000 / dt;
        this._fpsSamples.push(fps); if (this._fpsSamples.length>60) this._fpsSamples.shift();

        // adapt LOD if needed
        const avgFps = this._fpsSamples.reduce((a,b)=>a+b,0)/this._fpsSamples.length;
        if (avgFps < 30 && !this.deviceLow){
            // reduce slightly
            this.material.uniforms.uSize.value = Math.max(1.0, this.material.uniforms.uSize.value * 0.95);
        }

        // update uniforms with smoothed cursor; much larger lerp for very snappy follow
        this._smoothedCursor.lerp(new THREE.Vector2(this._cursor.ndcX, this._cursor.ndcY), 0.70);
        this.material.uniforms.uTime.value = time * this.params.speedMult;
        this.material.uniforms.uCursor.value.set(this._smoothedCursor.x, this._smoothedCursor.y);
        this.material.uniforms.uCursorForce.value = this.params.cursorForce;

        this.renderer.render(this.scene, this.camera);

        // overlay connections
        this._sampleParticlePositions(time * this.params.speedMult);
        this._drawConnections();

        this._frameId = requestAnimationFrame(this._frame.bind(this));
    };

    ThreeParticles.prototype.start = function(){
        if (this._fallback) return;
        if (this.running) return;
        this.running = true;
        this.timeStart = performance.now()/1000;
        this._lastFrameTime = performance.now();
        this._frameId = requestAnimationFrame(this._frame.bind(this));
    };

    ThreeParticles.prototype.stop = function(){
        if (!this.running) return;
        this.running = false;
        if (this._frameId) cancelAnimationFrame(this._frameId);
    };

    ThreeParticles.prototype.setDensity = function(n){
        // re-init with new count (simple approach)
        n = Math.floor(clamp(n, 128, 50000));
        // for safety, cap on low-end
        if (this.deviceLow) n = Math.min(n, this.config.deviceFallbackThreshold);
        this.count = n;
        // Re-create geometry attributes (simple reinit)
        // For brevity we won't fully re-create objects here in this minimal implementation.
        console.warn('setDensity: reloading entire page is recommended to fully apply density change. (Partial change not implemented)');
    };

    ThreeParticles.prototype.setSpeed = function(mult){ this.params.speedMult = clamp(mult, 0.1, 6.0); };
    ThreeParticles.prototype.setMode = function(mode){ if (mode==='energized'){ this.setSpeed(this.params.speedMult * this.config.energizedMultiplier); this.material.uniforms.uSize.value = this.config.baseSize * 1.6; } else { this.setSpeed(Math.max(0.2, this.params.speedMult * this.config.calmMultiplier)); this.material.uniforms.uSize.value = this.config.baseSize; } this.params.mode = mode; };
    ThreeParticles.prototype.setColorScheme = function(a,b){
        this.params.colors = { a, b };
        this._overlayPalette = {
            primary: normalizedToRgb(a),
            secondary: normalizedToRgb(b)
        };
        this.material.uniforms.uColorA.value.setArray(a);
        this.material.uniforms.uColorB.value.setArray(b);
    };

    // instantiate and wire to global
    function initGlobal(){
        const canvas = document.getElementById('bg-canvas');
        if (!canvas) return;
        // Detect WebGL; if unavailable, run a lightweight 2D fallback so the site shows a visible background.
        let hasWebGL = true;
        try {
            const gl = canvas.getContext('webgl2') || canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
            if (!gl) hasWebGL = false;
        } catch (e){ hasWebGL = false; }
        // If Three.js library failed to load (404 or blocked), fallback to 2D
        if (hasWebGL && typeof THREE === 'undefined'){
            console.warn('ThreeParticles: Three.js not found (possible 404). Falling back to 2D fallback.');
            hasWebGL = false;
        }

        if (!hasWebGL){
            console.warn('ThreeParticles: WebGL not available, using 2D fallback.');
            // Simple 2D fallback animation directly on the canvas element
            function Simple2DFallback(canvasEl){
                // Use the provided canvas element if it can provide a 2D context,
                // otherwise create a dedicated overlay canvas to ensure a working 2D context.
                this.canvas = canvasEl;
                this.ctx = this.canvas.getContext && this.canvas.getContext('2d');
                this._ownsCanvas = false;
                this.particles = [];
                this._smoothedCursor = { x: -9999, y: -9999 };
                if (!this.ctx){
                    // Create overlay canvas
                    this.canvas = document.createElement('canvas');
                    this.canvas.id = 'bg-canvas-fallback';
                    this.canvas.style.position = 'fixed';
                    this.canvas.style.inset = '0';
                    this.canvas.style.width = '100%';
                    this.canvas.style.height = '100%';
                    this.canvas.style.zIndex = '-1';
                    this.canvas.style.pointerEvents = 'none';
                    document.body.appendChild(this.canvas);
                    this.ctx = this.canvas.getContext('2d');
                    this._ownsCanvas = true;
                }
                // choose a smaller fallback count so individual particles are more visible
                this.count = Math.min(600, Math.max(80, Math.floor((window.innerWidth * window.innerHeight) / 16000)));
                this.running = false;
                this.speedMult = 1.0;
                this.mode = 'calm';
                this.cursor = { x: -9999, y: -9999 };
                this.colorA = { r: 138, g: 92, b: 242 };
                this.colorB = { r: 209, g: 148, b: 255 };
                this._init();
            }
            Simple2DFallback.prototype._init = function(){
                this.canvas.width = window.innerWidth; this.canvas.height = window.innerHeight;
                for (let i=0;i<this.count;i++){
                    const ang = Math.random() * Math.PI * 2;
                    const r = 20 + Math.pow(Math.random(), 1.5) * Math.max(window.innerWidth, window.innerHeight) * 0.6;
                    const speed = 0.002 + Math.random() * 0.01;
                    // increase fallback particle size and mark some as followers
                    const isFollower = (Math.random() < 0.20);
                    const size = 3.2 + Math.random() * 5.0;
                    this.particles.push({ ang, r, speed, phase: Math.random()*Math.PI*2, size: size, vx:0, vy:0, isFollower });
                }
                window.addEventListener('resize', ()=>{ this.canvas.width = window.innerWidth; this.canvas.height = window.innerHeight; });
                window.addEventListener('pointermove', (e)=>{ this.cursor.x = e.clientX; this.cursor.y = e.clientY; });
                window.addEventListener('pointerdown', ()=>{ this.setMode('energized'); setTimeout(()=>this.setMode('calm'), 900); });
            };
            Simple2DFallback.prototype._tick = function(){
                if (!this.running) return;
                const ctx = this.ctx; if (!ctx) return; const w = this.canvas.width; const h = this.canvas.height;
                // defensive: if context became unavailable, stop to avoid errors
                try { ctx.clearRect(0,0,w,h); } catch (e){ this.stop(); return; }
                // subtle gradient background
                const g = ctx.createLinearGradient(0,0,w,h);
                const bgStart = mixRgb(this.colorA, { r: 5, g: 4, b: 18 }, this.mode === 'energized' ? 0.32 : 0.18);
                const bgEnd = mixRgb(this.colorB, { r: 8, g: 5, b: 20 }, this.mode === 'energized' ? 0.26 : 0.16);
                g.addColorStop(0, rgbaFrom(bgStart, 1));
                g.addColorStop(1, rgbaFrom(bgEnd, 1));
                ctx.fillStyle = g; ctx.fillRect(0,0,w,h);

                // center offset
                const cx = w/2, cy = h/2;
                // smooth cursor target (larger lerp for snappier, more noticeable follow)
                this._smoothedCursor.x += (this.cursor.x - this._smoothedCursor.x) * 0.42;
                this._smoothedCursor.y += (this.cursor.y - this._smoothedCursor.y) * 0.42;
                for (let i=0;i<this.particles.length;i++){
                    const p = this.particles[i];
                    p.ang += p.speed * this.speedMult;
                    const x = cx + Math.cos(p.ang + p.phase) * p.r * 0.6;
                    const y = cy + Math.sin(p.ang + p.phase) * p.r * 0.3;
                    // cursor attraction: stronger, smoother pull so particles convincingly follow
                    const dx = this._smoothedCursor.x - x, dy = this._smoothedCursor.y - y; const d2 = dx*dx+dy*dy;
                    if (d2 < 200000){
                        const f = (200000 - d2) / 200000;
                        // stronger acceleration; followers get a much larger multiplier
                        // followers accelerate much more strongly toward cursor
                        const accel = p.isFollower ? 0.015 : 0.003;
                        p.vx += (dx * accel) * f * this.speedMult;
                        p.vy += (dy * accel) * f * this.speedMult;
                    }
                    // integrated velocity with damping; followers keep momentum differently for responsiveness
                    const damp = p.isFollower ? 0.96 : 0.78;
                    p.vx *= damp; p.vy *= damp;
                    const fx = x + p.vx * 60; const fy = y + p.vy * 60;
                    // color by speed
                    const speedVis = Math.min(1, (Math.abs(p.vx)+Math.abs(p.vy))*3);
                    const tint = mixRgb(this.colorA, this.colorB, speedVis);
                    const rcol = tint.r;
                    const gcol = tint.g;
                    const bcol = tint.b;
                    ctx.fillStyle = `rgba(${rcol},${gcol},${bcol},0.88)`;
                    // draw followers larger for stronger visual emphasis
                    const drawSize = p.size * (p.isFollower ? 2.0 : 1.0);
                    ctx.beginPath(); ctx.arc(fx, fy, drawSize, 0, Math.PI*2); ctx.fill();
                }
                // lightweight connections
                ctx.strokeStyle = rgbaFrom(mixRgb(this.colorA, this.colorB, 0.4), 0.14); ctx.lineWidth = 0.95;
                for (let i=0;i<120;i+=6){
                    const p = this.particles[i];
                    const x1 = cx + Math.cos(p.ang + p.phase) * p.r * 0.6;
                    const y1 = cy + Math.sin(p.ang + p.phase) * p.r * 0.3;
                    for (let j=i+1;j<i+8 && j<this.particles.length;j++){
                        const q = this.particles[j];
                        const x2 = cx + Math.cos(q.ang + q.phase) * q.r * 0.6;
                        const y2 = cy + Math.sin(q.ang + q.phase) * q.r * 0.3;
                        const dx = x1-x2, dy = y1-y2; if (dx*dx+dy*dy < 9000){ ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke(); }
                    }
                }
                this._raf = requestAnimationFrame(this._tick.bind(this));
            };
            Simple2DFallback.prototype.start = function(){ if (this.running) return; this.running = true; this._tick(); };
            Simple2DFallback.prototype.stop = function(){ if (!this.running) return; this.running = false; if (this._raf) cancelAnimationFrame(this._raf); };
            Simple2DFallback.prototype.dispose = function(){ this.stop(); if (this._ownsCanvas && this.canvas && this.canvas.parentNode) this.canvas.parentNode.removeChild(this.canvas); };
            Simple2DFallback.prototype.setSpeed = function(m){ this.speedMult = Math.max(0.1, Math.min(6, m)); };
            Simple2DFallback.prototype.setMode = function(mode){ this.mode = mode; if (mode==='energized') this.setSpeed(2.2); else this.setSpeed(1.0); };
            Simple2DFallback.prototype.setDensity = function(n){ /* not implemented runtime */ };
            Simple2DFallback.prototype.setColorScheme = function(a,b){
                this.colorA = normalizedToRgb(a);
                this.colorB = normalizedToRgb(b);
            };

            const fb = new Simple2DFallback(canvas);
            window.ThreeParticles = { start: ()=>fb.start(), stop: ()=>fb.stop(), setDensity: (n)=>fb.setDensity(n), setSpeed: (m)=>fb.setSpeed(m), setMode: (m)=>fb.setMode(m), setColorScheme: (a,b)=>fb.setColorScheme(a,b), _instance: fb };
            fb.start();
            return;
        }

        const tp = new ThreeParticles(canvas);
        window.ThreeParticles = {
            start: ()=>tp.start(), stop: ()=>tp.stop(), setDensity: (n)=>tp.setDensity(n), setSpeed: (m)=>tp.setSpeed(m), setMode: (m)=>tp.setMode(m), setColorScheme: (a,b)=>tp.setColorScheme(a,b), _instance: tp
        };
        // auto-start
        tp.start();
    }

    // Wait for DOM ready
    if (document.readyState === 'complete' || document.readyState === 'interactive') initGlobal(); else document.addEventListener('DOMContentLoaded', initGlobal);
})();
