const jwt = require('jsonwebtoken');
const pool = require('../config/database');

const auth = async (req, res, next) => {
    try {
        // Session-based
        if (req.session && req.session.user) {
            req.user = req.session.user;
            return next();
        } else {
            // helpful debug log when session exists but no user
            if (req.session) console.debug('[auth] session exists but no user:', !!req.session.user);
        }

        // Bearer token
        const token = req.header('Authorization')?.replace('Bearer ', '');
        if (!token) {
            return res.status(401).json({ error: 'Acesso negado. Token não fornecido.' });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const [users] = await pool.execute('SELECT id, name, email, role, status FROM users WHERE id = ?', [decoded.id]);
        if (users.length === 0) return res.status(401).json({ error: 'Token inválido.' });

        req.user = users[0];
        next();
    } catch (error) {
        console.error('Middleware auth error', error);
        res.status(401).json({ error: 'Token inválido.' });
    }
};

module.exports = auth;