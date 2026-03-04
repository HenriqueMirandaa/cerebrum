const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const MySQLStore = require('express-mysql-session')(session);
require('dotenv').config();

const poolModule = require('./config/database');
const pool = poolModule;
const dbConfig = poolModule.dbConfig || {};
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const materiaRoutes = require('./routes/materias');
const cronogramaRoutes = require('./routes/cronograma');
const aiRoutes = require('./routes/offline_ai');

const app = express();
const PORT = process.env.PORT || 3001;
const missingRequired = [];
if (!dbConfig.host) missingRequired.push('DB_HOST/MYSQLHOST');
if (!dbConfig.user) missingRequired.push('DB_USER/MYSQLUSER');
if (!dbConfig.database) missingRequired.push('DB_NAME/MYSQLDATABASE');
if (!process.env.JWT_SECRET) missingRequired.push('JWT_SECRET');
if (!process.env.SESSION_SECRET) missingRequired.push('SESSION_SECRET');
if (missingRequired.length > 0) {
    const msg = `[config] Missing required env vars: ${missingRequired.join(', ')}`;
    if (process.env.NODE_ENV === 'production') {
        throw new Error(msg);
    }
    console.warn(msg);
}

// Security + parsing
app.use(helmet());
// CORS: prefer explicit allowed origins via env (comma-separated). If none provided, reflect origin (dev).
function normalizeOrigin(value) {
    if (!value) return '';
    return String(value).trim().replace(/\/+$/, '');
}

function isVercelPreviewOrigin(origin) {
    const o = normalizeOrigin(origin);
    return /^https:\/\/[a-z0-9-]+\.vercel\.app$/i.test(o);
}

function isAllowedOrigin(origin, allowedOrigin) {
    const originNormalized = normalizeOrigin(origin);
    const allowedNormalized = normalizeOrigin(allowedOrigin);
    if (!originNormalized || !allowedNormalized) return false;
    if (originNormalized === allowedNormalized) return true;

    // Support wildcard patterns such as https://*.vercel.app
    if (allowedNormalized.includes('*')) {
        const escaped = allowedNormalized
            .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
            .replace(/\*/g, '.*');
        const regex = new RegExp(`^${escaped}$`);
        return regex.test(originNormalized);
    }

    return false;
}

const allowedOrigins = (process.env.CORS_ALLOWED || process.env.FRONTEND_ORIGIN || process.env.SITE_URL || '')
    .split(',')
    .map((s) => normalizeOrigin(s))
    .filter(Boolean);
const allowVercelPreviews = process.env.ALLOW_VERCEL_PREVIEWS !== 'false';
if (allowedOrigins.length > 0) {
    app.use(cors({ origin: function(origin, cb) {
        // allow non-browser requests or same-origin with no Origin header
        if (!origin) return cb(null, true);
        if (allowVercelPreviews && isVercelPreviewOrigin(origin)) return cb(null, true);
        if (allowedOrigins.some((allowed) => isAllowedOrigin(origin, allowed))) return cb(null, true);
        console.warn('[CORS] blocked origin', origin);
        // Return false instead of throwing so blocked CORS doesn't become HTTP 500.
        return cb(null, false);
    }, credentials: true }));
} else {
    // development fallback: reflect origin (use carefully)
    app.use(cors({ origin: true, credentials: true }));
}
app.use(express.json());
app.use(cookieParser());

// Trust proxy when behind a reverse proxy (needed for secure cookies when using TLS offload)
if (process.env.TRUST_PROXY === '1' || process.env.TRUST_PROXY === 'true') {
    app.set('trust proxy', 1);
}

const isProduction = process.env.NODE_ENV === 'production';
const forceSecure = process.env.FORCE_SECURE === 'true';
const secureCookie = isProduction || forceSecure;
const cookieSameSite = process.env.COOKIE_SAME_SITE || (secureCookie ? 'none' : 'lax');
const cookieDomain = process.env.COOKIE_DOMAIN || undefined;
const sessionEnabled = process.env.SESSION_ENABLED !== 'false';
let sessionMiddleware = null;

if (sessionEnabled) {
    try {
        const sessionStore = new MySQLStore({
            host: dbConfig.host,
            port: dbConfig.port || 3306,
            user: dbConfig.user,
            password: dbConfig.password,
            database: dbConfig.database,
            ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: process.env.DB_SSL_STRICT === 'true' } : undefined
        });

        if (sessionStore && typeof sessionStore.on === 'function') {
            sessionStore.on('error', (error) => {
                console.error('[session-store] error:', error);
            });
        }

        sessionMiddleware = session({
            key: process.env.SESSION_KEY || 'cerebrum_sid',
            secret: process.env.SESSION_SECRET || 'please_change_me',
            store: sessionStore,
            resave: false,
            saveUninitialized: false,
            rolling: true, // refresh cookie expiry on activity
            cookie: {
                maxAge: 24 * 60 * 60 * 1000,
                httpOnly: true,
                sameSite: cookieSameSite,
                secure: secureCookie,
                path: '/',
                domain: cookieDomain
            }
        });
    } catch (error) {
        console.error('[session] initialization failed; continuing with JWT-only auth:', error);
        sessionMiddleware = null;
    }
}

if (sessionMiddleware) {
    app.use((req, res, next) => {
        sessionMiddleware(req, res, (error) => {
            if (error) {
                console.error('[session] middleware error; continuing with JWT-only auth:', error);
                req.session = null;
            }
            next();
        });
    });
} else {
    console.warn('[session] disabled or unavailable; API running with JWT-only auth');
}

// Mount routers to match requested endpoints
// Auth endpoints: /api/register, /api/login, /api/profile -> implemented in routes/auth.js
app.use('/api', authRoutes);

// Users endpoints -> /api/users
app.use('/api/users', userRoutes);

// Subjects endpoints -> /api/subjects
app.use('/api/subjects', materiaRoutes);

// Cronograma endpoints -> /api/cronograma
app.use('/api/cronograma', cronogramaRoutes);

// Offline AI endpoints -> /api/ai
app.use('/api/ai', aiRoutes);

// Statistics endpoint
app.get('/api/statistics', async (req, res) => {
    try {
        const [[{ users_count }]] = await pool.execute('SELECT COUNT(*) AS users_count FROM users');
        const [[{ subjects_count }]] = await pool.execute('SELECT COUNT(*) AS subjects_count FROM subjects');
        const [[{ total_hours }]] = await pool.execute('SELECT IFNULL(SUM(hours_studied),0) AS total_hours FROM user_progress');
        res.json({ users: users_count, subjects: subjects_count, total_hours });
    } catch (error) {
        console.error('Erro em /api/statistics', error);
        res.status(500).json({ error: 'Erro interno ao buscar estatísticas.' });
    }
});

// User progress (dashboard)
app.get('/api/user/progress', require('./middleware/auth'), async (req, res) => {
    try {
        const userId = req.user.id;
        const [rows] = await pool.execute(
            `SELECT up.id, up.user_id, up.subject_id, up.hours_studied, up.last_studied, s.name AS subject_name, s.description
             FROM user_progress up
             JOIN subjects s ON up.subject_id = s.id
             WHERE up.user_id = ?`,
            [userId]
        );
        res.json({ progress: rows });
    } catch (error) {
        console.error('Erro em /api/user/progress', error);
        res.status(500).json({ error: 'Erro interno ao buscar progresso.' });
    }
});

// Health check (includes lightweight DB probe for production diagnostics)
app.get('/api/health', async (req, res) => {
    const payload = { message: 'API Cerebrum funcionando!', timestamp: new Date().toISOString(), db: { ok: false } };
    try {
        await pool.execute('SELECT 1');
        payload.db = { ok: true };
    } catch (error) {
        payload.db = {
            ok: false,
            code: error && error.code ? error.code : 'DB_ERROR',
            message: error && error.message ? String(error.message) : 'unknown',
        };
    }
    res.json(payload);
});

// Debug endpoint to inspect session and cookies (development only)
app.get('/api/debug/session', (req, res) => {
    try {
        res.json({
            cookies: req.cookies,
            session: typeof req.session === 'object' ? { id: req.session.id, user: req.session.user, cookie: req.session.cookie } : null,
            headers: { origin: req.headers.origin, cookie: req.headers.cookie }
        });
    } catch (err) {
        res.status(500).json({ error: 'debug failed', details: String(err) });
    }
});

// Error handler
app.use((err, req, res, next) => {
    if (err && err.type === 'entity.parse.failed') {
        return res.status(400).json({ error: 'JSON invalido no corpo da requisicao.' });
    }
    console.error(err.stack);
    res.status(500).json({ error: 'Algo deu errado!' });
});

app.use('*', (req, res) => {
    res.status(404).json({ error: 'Rota não encontrada' });
});

app.listen(PORT, () => {
    console.log(`🚀 Servidor Cerebrum rodando na porta ${PORT}`);
    console.log(`📊 Banco: ${process.env.DB_NAME}`);
    console.log(`🔗 Health check: http://localhost:${PORT}/api/health`);
    console.log(`🌐 CORS origin: reflected dynamically (dev mode)`);
    console.log('🧭 Session settings:', sessionMiddleware ? {
        enabled: true,
        key: process.env.SESSION_KEY || 'cerebrum_sid',
        sameSite: cookieSameSite,
        secure: secureCookie
    } : { enabled: false, mode: 'jwt-only' });
});
