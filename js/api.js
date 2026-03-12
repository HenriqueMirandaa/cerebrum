import * as db from './data.js';
import { showToast, generateSchedule, calculateStats } from './utils/helpers.js';

// Unified API service (singleton)
function createApiService() {
    const baseUrl = window.BASE_URL || '';
    const viteApiOrigin = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_API_ORIGIN)
        ? String(import.meta.env.VITE_API_ORIGIN).trim()
        : '';
    const runningOnVercel = /\.vercel\.app$/i.test(window.location.hostname);
    // Prefer explicit API origin when provided (window.API_ORIGIN).
    // In Vercel environments, prefer same-origin (/api) to avoid CORS on preview domains.
    // In local development, default to Node backend on port 3001.
    const backendOrigin = (window.API_ORIGIN && String(window.API_ORIGIN).trim()) ||
        (!runningOnVercel ? viteApiOrigin : '') ||
        ((window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
            ? `${window.location.protocol}//${window.location.hostname}:3001`
            : baseUrl || '');
    const apiBase = (String(backendOrigin).replace(/\/$/, '')) + '/api';

    const TOKEN_KEY = 'cerebrum_token';

    let offline = false;
    let profile = null;

    function getToken() {
        return localStorage.getItem(TOKEN_KEY);
    }

    function setToken(token) {
        if (token) localStorage.setItem(TOKEN_KEY, token);
        else localStorage.removeItem(TOKEN_KEY);
    }

    async function request(endpoint, options = {}) {
        const url = `${apiBase}${endpoint}`;
        const defaultHeaders = { 'Content-Type': 'application/json' };
        const token = getToken();
        if (token) defaultHeaders['Authorization'] = `Bearer ${token}`;

        const config = {
            credentials: 'include',
            ...options,
            headers: {
                ...defaultHeaders,
                ...(options.headers || {})
            }
        };

        // Apply request timeout so UI falls back promptly when backend is slow/unreachable
        const timeoutMs = (window.API_TIMEOUT && Number(window.API_TIMEOUT)) || 3000;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
        config.signal = controller.signal;

        try {
            const res = await fetch(url, config);
            clearTimeout(timeoutId);
            const text = await res.text();
            let data = {};
            if (text) {
                try { data = JSON.parse(text); } catch (e) { data = { __raw: text }; }
            }

            // If server returns 404 for an endpoint that has an offline handler,
            // try the offline handler before throwing.
            if (!res.ok) {
                if (res.status === 404) {
                    try {
                        console.warn('[api] 404 received, attempting offline fallback for', endpoint);
                        const fallback = await handleOffline(endpoint, config);
                        return fallback;
                    } catch (fbErr) {
                        // continue to throw original error below
                        console.warn('[api] offline fallback failed', fbErr);
                    }
                }

                const message = (data && (data.error || data.message)) ? (data.error || data.message) : `HTTP ${res.status}`;
                const err = new Error(message);
                err.status = res.status;
                err.response = data;
                throw err;
            }

            offline = false;
            return data;
        } catch (err) {
            // distinguish abort errors for clearer logging
            if (err.name === 'AbortError') console.warn('[api] request aborted (timeout)', url);
            else console.error('[api] request failed', err);
            if (!navigator.onLine || (err.message && err.message.includes('Failed to fetch'))) {
                if (!offline) {
                    offline = true;
                    try { showToast('warning', 'Modo offline: usando dados locais'); } catch (e) { console.warn(e); }
                }
                return handleOffline(endpoint, options);
            }
            throw err;
        }
    }

    async function handleOffline(endpoint, options = {}) {
        const path = endpoint.split('?')[0];
        const method = (options.method || 'GET').toUpperCase();

        switch (`${method} ${path}`) {
            case 'GET /subjects/minhas':
            case 'GET /materias/minhas':
                return db.getSubjects();

            case 'GET /sessions':
                return db.getSessions();

            case 'GET /statistics':
            case 'GET /stats':
                return db.getStats();

            case 'POST /subjects/adicionar':
            case 'POST /materias/adicionar': {
                const data = JSON.parse(options.body || '{}');
                return db.addSubject(data);
            }

            case 'POST /sessions': {
                const data = JSON.parse(options.body || '{}');
                return db.addSession(data);
            }

            case 'PUT /sessions/complete': {
                const parts = path.split('/');
                const session_id = parts[2];
                const sessions = await db.getSessions();
                const session = sessions.find(s => String(s.id) === String(session_id));
                if (!session) throw new Error('Session not found');
                session.completed = true;
                return db.updateSession(session);
            }

            case 'PUT /subjects/progresso':
            case 'PUT /materias/progresso': {
                const data = JSON.parse(options.body || '{}');
                // expect payload { subject_id, hours_increment, last_studied }
                const inc = typeof data.hours_increment !== 'undefined' ? Number(data.hours_increment) : (typeof data.progress !== 'undefined' ? Number(data.progress) : 0);
                return db.updateProgress(data.subject_id, inc);
            }

            case 'GET /subjects/disponiveis':
            case 'GET /materias/disponiveis':
                return db.getSubjects();

            default:
                throw new Error(`Operation not available offline: ${method} ${path}`);
        }
    }

    return {
        // low-level request
        request,

        // token helpers (exposed for tests)
        setToken,
        getToken,

        // Auth
        async login(credentials) {
            const resp = await request('/login', { method: 'POST', body: JSON.stringify(credentials) });
            if (resp && resp.token) setToken(resp.token);
            profile = resp.user || null;
            return resp;
        },

        async register(userData) {
            const resp = await request('/register', { method: 'POST', body: JSON.stringify(userData) });
            if (resp && resp.token) setToken(resp.token);
            profile = resp.user || null;
            return resp;
        },

        async forgotPassword(email) {
            return request('/forgot-password', { method: 'POST', body: JSON.stringify({ email }) });
        },

        async resetPassword(token, password) {
            return request('/reset-password', { method: 'POST', body: JSON.stringify({ token, password }) });
        },

        async logout() {
            try { await request('/logout', { method: 'POST' }); } catch (e) { /* ignore */ }
            setToken(null);
            profile = null;
        },

        async getProfile() {
            if (offline && profile) return profile;
            const resp = await request('/profile');
            profile = resp;
            return resp;
        },

        // Subjects
        async getMinhasMaterias() {
            const resp = await request('/subjects/minhas');
            // normalize response: accept either array or { subjects: [...] }
            let subjects = [];
            if (Array.isArray(resp)) subjects = resp;
            else if (resp && Array.isArray(resp.subjects)) subjects = resp.subjects;
            else subjects = [];
            // Normalize field names coming from different backends (portuguese/english)
            subjects = subjects.map(s => {
                const obj = Object.assign({}, s);
                // id may be 'id' or 'subject_id' and might be string
                obj.id = (s.id || s.subject_id || '').toString();
                obj.name = s.name || s.nome || s.title || '';
                obj.description = s.description || s.descricao || s.desc || '';
                obj.progress = (typeof s.progress !== 'undefined') ? Number(s.progress) : ((typeof s.progresso !== 'undefined') ? Number(s.progresso) : 0);
                obj.total_hours = (typeof s.total_hours !== 'undefined') ? s.total_hours : (typeof s.horas_totais !== 'undefined' ? s.horas_totais : (s.totalHours || null));
                obj.exam_date = s.exam_date || s.data_prova || s.examDate || null;
                return obj;
            });

            // enrich with local progress (override if local DB has progress)
            await Promise.all(subjects.map(async s => {
                try {
                    const p = await db.getProgress(s.id);
                    if (p && typeof p.progress !== 'undefined') s.progress = p.progress;
                } catch (e) { /* ignore */ }
            }));
            // generate cronograma and stats when possible
            subjects.forEach(s => {
                try { s.cronograma = generateSchedule(s.exam_date, s.total_hours); s.stats = calculateStats(s.cronograma); } catch (e) { /* ignore */ }
            });
            return subjects;
        },

        async createMateria(payload) {
            // Admin endpoint to create a new subject record
            return request('/materias', { method: 'POST', body: JSON.stringify(payload) });
        },

        getMateriasDisponiveis() {
            return request('/subjects/disponiveis');
        },

        async adicionarMateria(subject_id, exam_date, total_hours, color) {
            const body = { subject_id, exam_date, total_hours };
            if (typeof color !== 'undefined' && color !== null) body.color = color;
            const resp = await request('/subjects/adicionar', { method: 'POST', body: JSON.stringify(body) });
            try { await db.updateProgress(subject_id, 0); } catch (e) { /* ignore */ }
            return resp;
        },

        async sugerirMateria(name, color, icon, exam_date, total_hours) {
            const payload = { name, color, icon, exam_date, total_hours };
            return request('/subjects/sugerir', { method: 'POST', body: JSON.stringify(payload) });
        },

        async removerMateria(subject_id) {
            const resp = await request(`/subjects/remover/${subject_id}`, { method: 'DELETE' });
            try { await db.deleteSubject(subject_id); } catch (e) { /* ignore */ }
            return resp;
        },

        async atualizarProgresso(payload) {
            // payload should be an object like { subject_id, hours_increment, last_studied }
            const resp = await request('/subjects/progresso', { method: 'PUT', body: JSON.stringify(payload) });
            try { if (payload && payload.subject_id && typeof payload.hours_increment !== 'undefined') await db.updateProgress(payload.subject_id, payload.hours_increment); } catch (e) { /* ignore */ }
            return resp;
        },

        // Sessions / schedule
    // Sessions: backend does not yet expose sessions endpoints in this API version
    // Keep using the same paths, but api.request will fallback to offline handlers on 404.
    getSessions() { return request('/sessions'); },
    createSession(subject_id, start_time, duration) { return request('/sessions', { method: 'POST', body: JSON.stringify({ subject_id, start_time, duration }) }); },
    completeSession(session_id) { return request(`/sessions/${session_id}/complete`, { method: 'PUT' }); },

        // Stats
        async getStats() {
            if (offline) {
                const subjects = await db.getSubjects();
                const sessions = await db.getSessions();
                return calculateStats(subjects, sessions);
            }
            // backend exposes overall statistics at /api/statistics
            return request('/statistics');
        },

        // AI
        getRecommendations() { if (offline) throw new Error('AI recommendations not available offline'); return request('/ai/recommendations'); },
        analyzeProgress() { if (offline) throw new Error('AI analysis not available offline'); return request('/ai/analyze'); },

        // Study plan generation
        async generateStudyPlan(subject_id) {
            if (offline) {
                const subjects = await db.getSubjects();
                const subject = subjects.find(s => String(s.id) === String(subject_id));
                if (!subject) throw new Error('Subject not found');
                return generateSchedule([subject], new Date().toISOString().slice(0,10));
            }
            return request(`/subjects/plan?subject_id=${subject_id}`);
        }
        ,
        // Cronograma (events)
        async getCronograma(from, to) {
            const q = `?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
            const resp = await request(`/cronograma${q}`);
            // normalize
            return resp.events || [];
        },
        async createEvent(payload) {
            const resp = await request('/cronograma', { method: 'POST', body: JSON.stringify(payload) });
            return resp.event || resp;
        },
        async updateEvent(id, payload) {
            const resp = await request(`/cronograma/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
            return resp.event || resp;
        },
        async deleteEvent(id) {
            return request(`/cronograma/${id}`, { method: 'DELETE' });
        }
    };
}

const api = createApiService();
export default api;
