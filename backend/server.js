const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const MySQLStore = require('express-mysql-session')(session);
require('dotenv').config();

const pool = require('./config/database');
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const materiaRoutes = require('./routes/materias');
const cronogramaRoutes = require('./routes/cronograma');
const aiRoutes = require('./routes/offline_ai');

const app = express();
const PORT = process.env.PORT || 3001;
const requiredEnv = ['DB_HOST', 'DB_USER', 'DB_NAME', 'JWT_SECRET', 'SESSION_SECRET'];
const missingRequired = requiredEnv.filter((key) => !process.env[key]);
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
const allowedOrigins = (process.env.CORS_ALLOWED || process.env.FRONTEND_ORIGIN || process.env.SITE_URL || '').split(',').map(s => s.trim()).filter(Boolean);
if (allowedOrigins.length > 0) {
    app.use(cors({ origin: function(origin, cb) {
        // allow non-browser requests or same-origin with no Origin header
        if (!origin) return cb(null, true);
        if (allowedOrigins.includes(origin)) return cb(null, true);
        console.warn('[CORS] blocked origin', origin);
        return cb(new Error('Not allowed by CORS'));
    }, credentials: true }));
} else {
    // development fallback: reflect origin (use carefully)
    app.use(cors({ origin: true, credentials: true }));
}
app.use(express.json());
app.use(cookieParser());

// Session store in MySQL
const sessionStore = new MySQLStore({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: process.env.DB_SSL_STRICT === 'true' } : undefined
});

// Trust proxy when behind a reverse proxy (needed for secure cookies when using TLS offload)
if (process.env.TRUST_PROXY === '1' || process.env.TRUST_PROXY === 'true') {
    app.set('trust proxy', 1);
}

const isProduction = process.env.NODE_ENV === 'production';
const forceSecure = process.env.FORCE_SECURE === 'true';
const secureCookie = isProduction || forceSecure;
const cookieSameSite = process.env.COOKIE_SAME_SITE || (secureCookie ? 'none' : 'lax');
const cookieDomain = process.env.COOKIE_DOMAIN || undefined;

app.use(session({
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
}));

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

// Health check
app.get('/api/health', (req, res) => {
    res.json({ message: 'API Cerebrum funcionando!', timestamp: new Date().toISOString() });
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
    console.log('🧭 Session cookie settings:', {
        key: process.env.SESSION_KEY || 'cerebrum_sid',
        sameSite: cookieSameSite,
        secure: secureCookie
    });
});
