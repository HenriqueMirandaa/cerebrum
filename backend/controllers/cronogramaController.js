const pool = require('../config/database');

const ensureTable = async () => {
    try {
        await pool.execute(`
            CREATE TABLE IF NOT EXISTS events (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                title VARCHAR(255) NOT NULL,
                materia_id INT NULL,
                start_iso DATETIME NOT NULL,
                end_iso DATETIME NOT NULL,
                all_day TINYINT(1) DEFAULT 0,
                color VARCHAR(50) DEFAULT NULL,
                notes TEXT DEFAULT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_user_id (user_id),
                INDEX idx_start_iso (start_iso),
                INDEX idx_end_iso (end_iso)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);
    } catch (err) {
        console.warn('Unable to ensure events table exists:', err.message || err);
    }
};

const parseDateTimeForSQL = (iso) => {
    if (!iso) return null;
    const d = new Date(iso);
    if (isNaN(d.getTime())) return null;
    // MySQL DATETIME format
    return d.toISOString().slice(0, 19).replace('T', ' ');
};

const cronogramaController = {
    async listEvents(req, res) {
        try {
            await ensureTable();
            const userId = req.user.id;
            const { from, to } = req.query;
            if (!from || !to) return res.status(400).json({ error: 'Parâmetros from e to são obrigatórios (ISO).' });

            // fetch events that overlap the requested window
            const sql = `
                SELECT id, user_id, title, materia_id, DATE_FORMAT(start_iso, '%Y-%m-%dT%H:%i:%sZ') AS start_iso, DATE_FORMAT(end_iso, '%Y-%m-%dT%H:%i:%sZ') AS end_iso, all_day, color, notes, created_at
                FROM events
                WHERE user_id = ? AND (
                    (start_iso BETWEEN ? AND ?) OR
                    (end_iso BETWEEN ? AND ?) OR
                    (start_iso <= ? AND end_iso >= ?)
                )
                ORDER BY start_iso ASC
            `;

            const sf = parseDateTimeForSQL(from);
            const tf = parseDateTimeForSQL(to);
            if (!sf || !tf) return res.status(400).json({ error: 'Parâmetros from/to inválidos.' });
            const params = [userId, sf, tf, sf, tf, sf, tf];
            const [rows] = await pool.execute(sql, params);
            res.json({ events: rows });
        } catch (error) {
            console.error('Erro ao listar events:', error);
            res.status(500).json({ error: 'Erro interno ao listar eventos.' });
        }
    },

    async createEvent(req, res) {
        try {
            await ensureTable();
            const userId = req.user.id;
            const { title, materia_id, start_iso, end_iso, all_day, color, notes } = req.body;

            if (!title || !String(title).trim()) return res.status(400).json({ error: 'Título é obrigatório.' });
            const s = parseDateTimeForSQL(start_iso);
            const e = parseDateTimeForSQL(end_iso);
            if (!s || !e) return res.status(400).json({ error: 'Datas inválidas.' });
            if (new Date(start_iso) >= new Date(end_iso)) return res.status(400).json({ error: 'start_iso deve ser anterior a end_iso.' });

            const [result] = await pool.execute(
                'INSERT INTO events (user_id, title, materia_id, start_iso, end_iso, all_day, color, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())',
                [userId, title.trim(), materia_id || null, s, e, all_day ? 1 : 0, color || null, notes || null]
            );

            const [rows] = await pool.execute('SELECT id, user_id, title, materia_id, DATE_FORMAT(start_iso, "%Y-%m-%dT%H:%i:%sZ") AS start_iso, DATE_FORMAT(end_iso, "%Y-%m-%dT%H:%i:%sZ") AS end_iso, all_day, color, notes, created_at FROM events WHERE id = ?', [result.insertId]);
            res.status(201).json({ event: rows[0] });
        } catch (error) {
            console.error('Erro ao criar evento:', error);
            res.status(500).json({ error: 'Erro interno ao criar evento.' });
        }
    },

    async updateEvent(req, res) {
        try {
            await ensureTable();
            const userId = req.user.id;
            const { id } = req.params;
            const { title, materia_id, start_iso, end_iso, all_day, color, notes } = req.body;

            const [[existing]] = await pool.execute('SELECT id, user_id FROM events WHERE id = ?', [id]);
            if (!existing) return res.status(404).json({ error: 'Evento não encontrado.' });
            if (Number(existing.user_id) !== Number(userId)) return res.status(403).json({ error: 'Não autorizado.' });

            if (title && !String(title).trim()) return res.status(400).json({ error: 'Título inválido.' });
            let s = null; let e = null;
            if (start_iso) s = parseDateTimeForSQL(start_iso);
            if (end_iso) e = parseDateTimeForSQL(end_iso);
            if (s && e && new Date(start_iso) >= new Date(end_iso)) return res.status(400).json({ error: 'start_iso deve ser anterior a end_iso.' });

            const fields = [];
            const params = [];
            if (typeof title !== 'undefined') { fields.push('title = ?'); params.push(title.trim()); }
            if (typeof materia_id !== 'undefined') { fields.push('materia_id = ?'); params.push(materia_id || null); }
            if (s) { fields.push('start_iso = ?'); params.push(s); }
            if (e) { fields.push('end_iso = ?'); params.push(e); }
            if (typeof all_day !== 'undefined') { fields.push('all_day = ?'); params.push(all_day ? 1 : 0); }
            if (typeof color !== 'undefined') { fields.push('color = ?'); params.push(color || null); }
            if (typeof notes !== 'undefined') { fields.push('notes = ?'); params.push(notes || null); }

            if (fields.length === 0) return res.status(400).json({ error: 'Nada para atualizar.' });

            params.push(id);
            const sql = `UPDATE events SET ${fields.join(', ')} WHERE id = ?`;
            await pool.execute(sql, params);

            const [rows] = await pool.execute('SELECT id, user_id, title, materia_id, DATE_FORMAT(start_iso, "%Y-%m-%dT%H:%i:%sZ") AS start_iso, DATE_FORMAT(end_iso, "%Y-%m-%dT%H:%i:%sZ") AS end_iso, all_day, color, notes, created_at FROM events WHERE id = ?', [id]);
            res.json({ event: rows[0] });
        } catch (error) {
            console.error('Erro ao atualizar evento:', error);
            res.status(500).json({ error: 'Erro interno ao atualizar evento.' });
        }
    },

    async deleteEvent(req, res) {
        try {
            await ensureTable();
            const userId = req.user.id;
            const { id } = req.params;
            const [[existing]] = await pool.execute('SELECT id, user_id FROM events WHERE id = ?', [id]);
            if (!existing) return res.status(404).json({ error: 'Evento não encontrado.' });
            if (Number(existing.user_id) !== Number(userId)) return res.status(403).json({ error: 'Não autorizado.' });

            await pool.execute('DELETE FROM events WHERE id = ?', [id]);
            res.json({ message: 'Evento removido com sucesso.' });
        } catch (error) {
            console.error('Erro ao deletar evento:', error);
            res.status(500).json({ error: 'Erro interno ao deletar evento.' });
        }
    }
};

module.exports = cronogramaController;
