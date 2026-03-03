const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/database');
const { sendWelcomeEmail } = require('../utils/mailer'); // <--- adicionado

const authController = {
    async register(req, res) {
        try {
            const { name, email, password } = req.body;

            // Validar dados
            if (!name || !email || !password) {
                return res.status(400).json({ error: 'Todos os campos são obrigatórios.' });
            }

            if (password.length < 6) {
                return res.status(400).json({ error: 'A senha deve ter pelo menos 6 caracteres.' });
            }

            // Verificar se utilizador já existe
            const [existing] = await pool.execute('SELECT id FROM users WHERE email = ?', [email]);
            if (existing.length > 0) {
                return res.status(400).json({ error: 'Este email já está cadastrado.' });
            }

            // Hash da senha
            const salt = await bcrypt.genSalt(10);
            const passwordHash = await bcrypt.hash(password, salt);

            // Inserir utilizador
            const [result] = await pool.execute(
                'INSERT INTO users (name, email, password, role, status, created_at) VALUES (?, ?, ?, ?, ?, NOW())',
                [name, email, passwordHash, 'user', 'active']
            );

            // envia email de boas-vindas de forma assíncrona (não bloqueante)
            sendWelcomeEmail(name, email)
                .then(ok => {
                    if (!ok) console.error('Falha no envio do email de boas-vindas para', email);
                })
                .catch(err => console.error('Erro ao tentar enviar email de boas-vindas:', err));

            // cria session server-side
            req.session.user = { id: result.insertId, name, email, role: 'user' };

            // token opcional para API clients
            const token = jwt.sign({ id: result.insertId }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });

            // Ensure session is saved before sending response so Set-Cookie is emitted
            req.session.save(err => {
                if (err) {
                    console.error('Erro ao salvar sessão no registro:', err);
                    return res.status(500).json({ error: 'Erro ao criar sessão.' });
                }
                console.log('[Auth] register response cookies:', res.getHeader('Set-Cookie'));
                res.status(201).json({ message: 'Utilizador criado com sucesso!', user: { id: result.insertId, name, email, role: 'user' }, token });
            });
        } catch (error) {
            console.error('Erro no registro:', error);
            res.status(500).json({ error: 'Erro interno do servidor.' });
        }
    },

    async login(req, res) {
        try {
            const { email, password } = req.body;
            console.debug('[Auth] login request headers:', { origin: req.headers.origin, cookie: req.headers.cookie });
            // Validar dados
            if (!email || !password) {
                return res.status(400).json({ error: 'Email e senha são obrigatórios.' });
            }

            // Buscar utilizador
            const [users] = await pool.execute('SELECT id, name, email, password, role, status FROM users WHERE email = ?', [email]);
            if (users.length === 0) return res.status(400).json({ error: 'Credenciais inválidas.' });

            const user = users[0];
            // Verificar senha
            const valid = await bcrypt.compare(password, user.password);
            if (!valid) return res.status(400).json({ error: 'Credenciais inválidas.' });

            // Save session
            req.session.user = { id: user.id, name: user.name, email: user.email, role: user.role };

            const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });

            // Ensure session saved so cookie is returned to client
            req.session.save(err => {
                if (err) {
                    console.error('Erro ao salvar sessão no login:', err);
                    return res.status(500).json({ error: 'Erro ao criar sessão.' });
                }
                console.log('[Auth] login response cookies:', res.getHeader('Set-Cookie'));
                res.json({ message: 'Login realizado com sucesso!', user: { id: user.id, name: user.name, email: user.email, role: user.role }, token });
            });
        } catch (error) {
            console.error('Erro no login:', error);
            res.status(500).json({ error: 'Erro interno do servidor.' });
        }
    },

    async getProfile(req, res) {
        try {
            res.json({ user: req.user || req.session.user });
        } catch (error) {
            console.error('Erro ao buscar perfil:', error);
            res.status(500).json({ error: 'Erro interno do servidor.' });
        }
    },

    async logout(req, res) {
        try {
            req.session.destroy(err => {
                if (err) return res.status(500).json({ error: 'Erro ao encerrar sessão.' });
                res.clearCookie(process.env.SESSION_KEY || 'cerebrum_sid');
                res.json({ message: 'Logout realizado com sucesso.' });
            });
        } catch (error) {
            console.error('Erro no logout:', error);
            res.status(500).json({ error: 'Erro interno do servidor.' });
        }
    }
};

module.exports = authController;