const pool = require('../config/database');
const { sendWelcomeEmail } = require('../utils/mailer'); // <--- adicionado

const userController = {
    async getAllUsers(req, res) {
        try {
            const [users] = await pool.execute(
                'SELECT id, name, email, role, status, created_at FROM users ORDER BY created_at DESC'
            );
            res.json({ users });
        } catch (error) {
            console.error('Erro ao buscar utilizadores:', error);
            res.status(500).json({ error: 'Erro interno do servidor.' });
        }
    },

    async createUser(req, res) {
        try {
            const { name, email, role = 'user', status = 'active', password } = req.body;
            if (!name || !email) return res.status(400).json({ error: 'Nome e email são obrigatórios.' });

            // Se receber senha, já insere (assuma que senha já foi hashada no backend antes)
            const bcrypt = require('bcryptjs');
            let passwordHash = null;
            if (password) {
                const salt = await bcrypt.genSalt(10);
                passwordHash = await bcrypt.hash(password, salt);
            }

            const [result] = await pool.execute(
                'INSERT INTO users (name, email, password, role, status, created_at) VALUES (?, ?, ?, ?, ?, NOW())',
                [name, email, passwordHash, role, status]
            );

            // envia email de boas-vindas de forma assíncrona (não bloqueante)
            sendWelcomeEmail(name, email)
                .then(ok => {
                    if (!ok) console.error('Falha no envio do email de boas-vindas para', email);
                })
                .catch(err => console.error('Erro ao tentar enviar email de boas-vindas:', err));

            res.status(201).json({ message: 'Utilizador criado com sucesso!', userId: result.insertId });
        } catch (error) {
            console.error('Erro ao criar utilizador:', error);
            res.status(500).json({ error: 'Erro interno do servidor.' });
        }
    },

    async updateUser(req, res) {
        try {
            const { id } = req.params;
            const { name, email, role, status, password } = req.body;

            if (password) {
                const bcrypt = require('bcryptjs');
                const salt = await bcrypt.genSalt(10);
                const passwordHash = await bcrypt.hash(password, salt);
                await pool.execute('UPDATE users SET name = ?, email = ?, role = ?, status = ?, password = ? WHERE id = ?', [name, email, role, status, passwordHash, id]);
            } else {
                await pool.execute('UPDATE users SET name = ?, email = ?, role = ?, status = ? WHERE id = ?', [name, email, role, status, id]);
            }

            res.json({ message: 'Utilizador atualizado com sucesso!' });
        } catch (error) {
            console.error('Erro ao atualizar utilizador:', error);
            res.status(500).json({ error: 'Erro interno do servidor.' });
        }
    },

    async deleteUser(req, res) {
        try {
            const { id } = req.params;

            if (parseInt(id) === req.user.id) {
                return res.status(400).json({ error: 'Não é possível deletar sua própria conta.' });
            }

            await pool.execute('DELETE FROM users WHERE id = ?', [id]);
            res.json({ message: 'Utilizador deletado com sucesso!' });
        } catch (error) {
            console.error('Erro ao deletar utilizador:', error);
            res.status(500).json({ error: 'Erro interno do servidor.' });
        }
    }
};

module.exports = userController;