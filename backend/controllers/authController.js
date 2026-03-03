const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/database');
const { sendWelcomeEmail } = require('../utils/mailer');

function signToken(userId) {
    const secret = process.env.JWT_SECRET || process.env.SESSION_SECRET || 'fallback_change_me';
    return jwt.sign({ id: userId }, secret, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });
}

function respondAuthSuccess(res, statusCode, message, user, token) {
    return res.status(statusCode).json({
        message,
        user: {
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
        },
        token,
    });
}

const authController = {
    async register(req, res) {
        try {
            const { name, email, password } = req.body;

            if (!name || !email || !password) {
                return res.status(400).json({ error: 'Todos os campos sao obrigatorios.' });
            }

            if (password.length < 6) {
                return res.status(400).json({ error: 'A senha deve ter pelo menos 6 caracteres.' });
            }

            const [existing] = await pool.execute('SELECT id FROM users WHERE email = ?', [email]);
            if (existing.length > 0) {
                return res.status(400).json({ error: 'Este email ja esta cadastrado.' });
            }

            const salt = await bcrypt.genSalt(10);
            const passwordHash = await bcrypt.hash(password, salt);

            const [result] = await pool.execute(
                'INSERT INTO users (name, email, password, role, status, created_at) VALUES (?, ?, ?, ?, ?, NOW())',
                [name, email, passwordHash, 'user', 'active']
            );

            sendWelcomeEmail(name, email)
                .then((ok) => {
                    if (!ok) console.error('Falha no envio do email de boas-vindas para', email);
                })
                .catch((err) => console.error('Erro ao tentar enviar email de boas-vindas:', err));

            const user = { id: result.insertId, name, email, role: 'user' };
            const token = signToken(result.insertId);

            // If session store fails, keep login flow working via JWT token.
            if (req.session) {
                req.session.user = user;
                if (typeof req.session.save === 'function') {
                    return req.session.save((err) => {
                        if (err) {
                            console.error('Erro ao salvar sessao no registro (continuando com token):', err);
                        }
                        return respondAuthSuccess(res, 201, 'Utilizador criado com sucesso!', user, token);
                    });
                }
            }

            return respondAuthSuccess(res, 201, 'Utilizador criado com sucesso!', user, token);
        } catch (error) {
            console.error('Erro no registro:', error);
            return res.status(500).json({ error: 'Erro interno do servidor.' });
        }
    },

    async login(req, res) {
        try {
            const { email, password } = req.body;

            if (!email || !password) {
                return res.status(400).json({ error: 'Email e senha sao obrigatorios.' });
            }

            const [users] = await pool.execute('SELECT id, name, email, password, role, status FROM users WHERE email = ?', [email]);
            if (users.length === 0) {
                return res.status(400).json({ error: 'Credenciais invalidas.' });
            }

            const userRow = users[0];
            const valid = await bcrypt.compare(password, userRow.password);
            if (!valid) {
                return res.status(400).json({ error: 'Credenciais invalidas.' });
            }

            const user = { id: userRow.id, name: userRow.name, email: userRow.email, role: userRow.role };
            const token = signToken(userRow.id);

            // If session store fails, keep login flow working via JWT token.
            if (req.session) {
                req.session.user = user;
                if (typeof req.session.save === 'function') {
                    return req.session.save((err) => {
                        if (err) {
                            console.error('Erro ao salvar sessao no login (continuando com token):', err);
                        }
                        return respondAuthSuccess(res, 200, 'Login realizado com sucesso!', user, token);
                    });
                }
            }

            return respondAuthSuccess(res, 200, 'Login realizado com sucesso!', user, token);
        } catch (error) {
            console.error('Erro no login:', error);
            return res.status(500).json({ error: 'Erro interno do servidor.' });
        }
    },

    async getProfile(req, res) {
        try {
            return res.json({ user: req.user || (req.session && req.session.user) || null });
        } catch (error) {
            console.error('Erro ao buscar perfil:', error);
            return res.status(500).json({ error: 'Erro interno do servidor.' });
        }
    },

    async logout(req, res) {
        try {
            if (!req.session || typeof req.session.destroy !== 'function') {
                res.clearCookie(process.env.SESSION_KEY || 'cerebrum_sid');
                return res.json({ message: 'Logout realizado com sucesso.' });
            }

            req.session.destroy((err) => {
                if (err) return res.status(500).json({ error: 'Erro ao encerrar sessao.' });
                res.clearCookie(process.env.SESSION_KEY || 'cerebrum_sid');
                return res.json({ message: 'Logout realizado com sucesso.' });
            });
        } catch (error) {
            console.error('Erro no logout:', error);
            return res.status(500).json({ error: 'Erro interno do servidor.' });
        }
    },
};

module.exports = authController;
