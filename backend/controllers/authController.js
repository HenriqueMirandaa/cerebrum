const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const pool = require('../config/database');
const { sendWelcomeEmail, sendPasswordResetEmail } = require('../utils/mailer');

const RESET_TOKEN_MINUTES = Math.max(5, Number.parseInt(process.env.RESET_PASSWORD_TOKEN_MINUTES || '60', 10) || 60);
const RESET_GENERIC_MESSAGE = 'Se existir uma conta com este email, sera enviado um link para redefinir a senha.';

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

function buildAppUrl(pathname = '') {
    const raw = String(process.env.APP_URL || 'http://localhost:3000').trim();
    const normalizedBase = raw.endsWith('/') ? raw : `${raw}/`;
    const url = new URL(normalizedBase);
    const relativePath = String(pathname || '').replace(/^\/+/, '');
    url.pathname = relativePath ? `${url.pathname.replace(/\/?$/, '/')}${relativePath}` : url.pathname;
    return url;
}

function createResetToken() {
    const plainToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(plainToken).digest('hex');
    return { plainToken, tokenHash };
}

async function ensurePasswordResetTable() {
    await pool.execute(`
        CREATE TABLE IF NOT EXISTS password_reset_tokens (
            id INT UNSIGNED NOT NULL AUTO_INCREMENT,
            user_id INT UNSIGNED NOT NULL,
            token_hash VARCHAR(255) NOT NULL,
            expires_at DATETIME NOT NULL,
            used_at DATETIME NULL DEFAULT NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            KEY idx_password_reset_user_id (user_id),
            KEY idx_password_reset_expires_at (expires_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
}

function toMySqlDateTime(date) {
    return new Date(date).toISOString().slice(0, 19).replace('T', ' ');
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

            if (req.session) {
                req.session.user = user;
                if (typeof req.session.save === 'function') {
                    return req.session.save((err) => {
                        if (err) {
                            console.error('Erro ao salvar sessao no registro (continuando com token):', err);
                        }
                        return respondAuthSuccess(
                            res,
                            201,
                            'Utilizador criado com sucesso! Se o SMTP estiver configurado, sera enviado um email de boas-vindas.',
                            user,
                            token
                        );
                    });
                }
            }

            return respondAuthSuccess(
                res,
                201,
                'Utilizador criado com sucesso! Se o SMTP estiver configurado, sera enviado um email de boas-vindas.',
                user,
                token
            );
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

    async forgotPassword(req, res) {
        try {
            const email = String(req.body?.email || '').trim().toLowerCase();
            if (!email) {
                return res.status(400).json({ error: 'Email obrigatorio.' });
            }

            await ensurePasswordResetTable();

            const [users] = await pool.execute(
                'SELECT id, name, email FROM users WHERE email = ? AND status = ? LIMIT 1',
                [email, 'active']
            );

            if (!users.length) {
                return res.json({ message: RESET_GENERIC_MESSAGE });
            }

            const user = users[0];
            const { plainToken, tokenHash } = createResetToken();
            const expiresAt = new Date(Date.now() + (RESET_TOKEN_MINUTES * 60 * 1000));

            await pool.execute('DELETE FROM password_reset_tokens WHERE user_id = ?', [user.id]);
            await pool.execute(
                'INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES (?, ?, ?)',
                [user.id, tokenHash, toMySqlDateTime(expiresAt)]
            );

            const resetUrl = buildAppUrl('index.html');
            resetUrl.searchParams.set('mode', 'reset');
            resetUrl.searchParams.set('token', plainToken);

            sendPasswordResetEmail(user.name, user.email, resetUrl.toString(), RESET_TOKEN_MINUTES)
                .then((ok) => {
                    if (!ok) console.error('Falha ao enviar email de redefinicao para', user.email);
                })
                .catch((err) => console.error('Erro ao tentar enviar email de redefinicao:', err));

            return res.json({ message: RESET_GENERIC_MESSAGE });
        } catch (error) {
            console.error('Erro em forgotPassword:', error);
            return res.status(500).json({ error: 'Erro interno do servidor.' });
        }
    },

    async resetPassword(req, res) {
        try {
            const token = String(req.body?.token || '').trim();
            const password = String(req.body?.password || '');

            if (!token || !password) {
                return res.status(400).json({ error: 'Token e nova senha sao obrigatorios.' });
            }

            if (password.length < 6) {
                return res.status(400).json({ error: 'A senha deve ter pelo menos 6 caracteres.' });
            }

            await ensurePasswordResetTable();

            const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
            const [rows] = await pool.execute(
                `SELECT prt.id, prt.user_id, u.email
                 FROM password_reset_tokens prt
                 JOIN users u ON u.id = prt.user_id
                 WHERE prt.token_hash = ? AND prt.used_at IS NULL AND prt.expires_at > NOW()
                 ORDER BY prt.id DESC
                 LIMIT 1`,
                [tokenHash]
            );

            if (!rows.length) {
                return res.status(400).json({ error: 'Link de redefinicao invalido ou expirado.' });
            }

            const resetRow = rows[0];
            const salt = await bcrypt.genSalt(10);
            const passwordHash = await bcrypt.hash(password, salt);

            await pool.execute('UPDATE users SET password = ?, updated_at = NOW() WHERE id = ?', [passwordHash, resetRow.user_id]);
            await pool.execute('UPDATE password_reset_tokens SET used_at = NOW() WHERE id = ?', [resetRow.id]);
            await pool.execute('DELETE FROM password_reset_tokens WHERE user_id = ? AND id <> ?', [resetRow.user_id, resetRow.id]);

            return res.json({ message: 'Senha redefinida com sucesso. Ja podes entrar com a nova senha.' });
        } catch (error) {
            console.error('Erro em resetPassword:', error);
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
