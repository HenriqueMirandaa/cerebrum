const pool = require('../config/database');

// NOTE: older versions created a separate `user_subject_meta` table at runtime.
// To avoid requiring any DB schema changes we now persist per-user subject metadata
// (exam_date, total_hours) into `activity_logs.meta` as JSON entries with type='subject_meta'.
// This keeps compatibility with existing databases while allowing per-user metadata storage.

function toMySqlDateTime(input) {
    const candidate = input ? new Date(input) : new Date();
    const date = Number.isNaN(candidate.getTime()) ? new Date() : candidate;
    return date.toISOString().slice(0, 19).replace('T', ' ');
}

function parseHoursIncrement(input) {
    if (typeof input === 'number' && Number.isFinite(input)) return input;
    if (typeof input === 'string') {
        const trimmed = input.trim();
        if (!trimmed) return 0;

        // Accept "HH:MM" as an alternative input format.
        if (trimmed.includes(':')) {
            const [hRaw, mRaw] = trimmed.split(':');
            const h = Number.parseInt(hRaw, 10) || 0;
            const m = Number.parseInt(mRaw, 10) || 0;
            return h + (Math.max(0, Math.min(59, m)) / 60);
        }

        const normalized = trimmed.replace(',', '.');
        const n = Number(normalized);
        if (Number.isFinite(n)) return n;
    }
    return 0;
}

const materiaController = {
    // Admin: Gerenciar disciplinas
    async getAllMaterias(req, res) {
        try {
            const [subjects] = await pool.execute('SELECT id, name, description, created_at FROM subjects ORDER BY name');
            res.json({ subjects });
        } catch (error) {
            console.error('Erro ao buscar disciplinas:', error);
            res.status(500).json({ error: 'Erro interno do servidor.' });
        }
    },

    async createMateria(req, res) {
        try {
            const { name, description, color } = req.body;
            const [result] = await pool.execute('INSERT INTO subjects (name, description, created_at) VALUES (?, ?, NOW())', [name, description]);
            const subject = { id: result.insertId, name, description };
            // If admin provided a color, try to persist it to the subjects table (best-effort)
            if (color) {
                try {
                    await pool.execute('UPDATE subjects SET color = ? WHERE id = ?', [color, subject.id]);
                    subject.color = color;
                } catch (e) {
                    // if column doesn't exist or update fails, ignore (non-fatal)
                    console.warn('Unable to persist subject color, table may not have color column', e.message || e);
                }
            }
            res.status(201).json({ message: 'Disciplina criada com sucesso!', subject });
        } catch (error) {
            console.error('Erro ao criar disciplina:', error);
            res.status(500).json({ error: 'Erro interno do servidor.' });
        }
    },

    async updateMateria(req, res) {
        try {
            const { id } = req.params;
            const { name, description } = req.body;
            await pool.execute('UPDATE subjects SET name = ?, description = ? WHERE id = ?', [name, description, id]);
            res.json({ message: 'Disciplina atualizada com sucesso!' });
        } catch (error) {
            console.error('Erro ao atualizar disciplina:', error);
            res.status(500).json({ error: 'Erro interno do servidor.' });
        }
    },

    async deleteMateria(req, res) {
        try {
            const { id } = req.params;
            await pool.execute('DELETE FROM subjects WHERE id = ?', [id]);
            res.json({ message: 'Disciplina deletada com sucesso!' });
        } catch (error) {
            console.error('Erro ao deletar disciplina:', error);
            res.status(500).json({ error: 'Erro interno do servidor.' });
        }
    },

    // Utilizador: Matérias disponíveis e progresso
    async getMinhasMaterias(req, res) {
        try {
            const [rows] = await pool.execute(
                `SELECT s.id, s.name, s.description, up.hours_studied, up.last_studied, up.progress
                 FROM user_progress up
                 JOIN subjects s ON up.subject_id = s.id
                 WHERE up.user_id = ?
                 ORDER BY up.last_studied DESC`,
                [req.user.id]
            );

            // Enrich each row with latest metadata stored in activity_logs.meta (exam_date, total_hours, metas)
            // Optimize: fetch latest meta entries for all subject IDs in a single query
            const enriched = [];
            const subjectIds = rows.map(r => r.id);
            let latestMetaBySubject = {};
            if (subjectIds.length > 0) {
                // fetch recent activity logs for these subjects
                try {
                    const placeholders = subjectIds.map(() => '?').join(',');
                    const [metaRows] = await pool.execute(
                        `SELECT meta FROM activity_logs WHERE user_id = ? AND type = 'subject_meta' AND JSON_EXTRACT(meta, '$.subject_id') IN (${placeholders}) ORDER BY created_at DESC`,
                        [req.user.id, ...subjectIds]
                    );
                    for (const mr of metaRows) {
                        try {
                            const parsed = typeof mr.meta === 'string' ? JSON.parse(mr.meta) : mr.meta;
                            const sid = parsed.subject_id != null ? String(parsed.subject_id) : null;
                            if (sid && !latestMetaBySubject[sid]) {
                                latestMetaBySubject[sid] = parsed;
                            }
                        } catch (e) { /* ignore parse errors */ }
                    }
                } catch (e) {
                    console.warn('Erro ao buscar metadata em lote:', e && (e.message || e));
                }
            }

            for (const r of rows) {
                const metaParsed = latestMetaBySubject[String(r.id)] || {};
                const exam_date = metaParsed.exam_date || null;
                const total_hours = (metaParsed.total_hours != null) ? metaParsed.total_hours : null;
                const metas = metaParsed.metas || [];
                const color = metaParsed.color || metaParsed.cor || null;

                enriched.push({
                    id: String(r.id),
                    nome: r.name,
                    descricao: r.description || '',
                    progresso: (r.progress != null) ? Number(r.progress) : 0,
                    tempoEstudado: Math.round((r.hours_studied || 0) * 60), // minutes
                    metas: Array.isArray(metas) ? metas : (metas ? [metas] : []),
                    exam_date,
                    total_hours,
                    // include both property names so front-end can read either
                    color: color,
                    cor: color
                });
            }

            // Send enriched result
            return res.json({ subjects: enriched });

        } catch (error) {
            console.error('Erro ao buscar matérias do utilizador:', error);
            res.status(500).json({ error: 'Erro interno do servidor.' });
        }
    },

    async getMateriasDisponiveis(req, res) {
        try {
            const [rows] = await pool.execute(
                `SELECT * FROM subjects WHERE id NOT IN (SELECT subject_id FROM user_progress WHERE user_id = ?) ORDER BY name`,
                [req.user.id]
            );
            res.json({ subjects: rows });
        } catch (error) {
            console.error('Erro ao buscar matérias disponíveis:', error);
            res.status(500).json({ error: 'Erro interno do servidor.' });
        }
    },

    async adicionarMateria(req, res) {
        try {
            const { subject_id, exam_date, total_hours } = req.body;
            // Insert to user_progress if not exists
            await pool.execute(
                'INSERT INTO user_progress (user_id, subject_id, hours_studied, progress, last_studied, created_at) VALUES (?, ?, 0, 0, NULL, NOW()) ON DUPLICATE KEY UPDATE updated_at = NOW()',
                [req.user.id, subject_id]
            );

            // Persist metadata into activity_logs.meta as JSON to avoid schema changes.
            const metasInput = req.body.metas;
            const metasArr = Array.isArray(metasInput) ? metasInput : (metasInput ? String(metasInput).split(',').map(s=>s.trim()).filter(Boolean) : []);
            // support color passed in payload (color or cor)
            const color = req.body.color || req.body.cor || null;
            const meta = { subject_id: +subject_id, exam_date: exam_date || null, total_hours: total_hours ? +total_hours : null, metas: metasArr, color };
            await pool.execute(
                `INSERT INTO activity_logs (user_id, type, description, meta, created_at)
                 VALUES (?, 'subject_meta', 'user subject metadata', ?, NOW())`,
                [req.user.id, JSON.stringify(meta)]
            );

            // If an exam_date was provided, create a calendar event for the exam
            if (exam_date) {
                try {
                    // normalize date to MySQL DATETIME strings (all-day event)
                    const startIso = (String(exam_date).length <= 10) ? `${exam_date} 00:00:00` : (new Date(exam_date)).toISOString().slice(0,19).replace('T',' ');
                    const endIso = (String(exam_date).length <= 10) ? `${exam_date} 23:59:59` : (new Date(exam_date)).toISOString().slice(0,19).replace('T',' ');

                    // Fetch subject name for a nicer event title (best-effort)
                    let subjectName = null;
                    try {
                        const [[row]] = await pool.execute('SELECT name FROM subjects WHERE id = ? LIMIT 1', [subject_id]);
                        if (row && row.name) subjectName = row.name;
                    } catch(e) { /* ignore */ }

                    const title = subjectName ? `Prova: ${subjectName}` : 'Prova';

                    // Avoid inserting duplicate exam events for same user/materia/date
                    const [[existingEvent]] = await pool.execute(
                        `SELECT id FROM events WHERE user_id = ? AND materia_id = ? AND DATE(start_iso) = DATE(?) LIMIT 1`,
                        [req.user.id, subject_id, startIso]
                    );
                    if (!existingEvent) {
                        await pool.execute(
                            `INSERT INTO events (user_id, title, materia_id, start_iso, end_iso, all_day, color, notes, created_at)
                             VALUES (?, ?, ?, ?, ?, 1, ?, ?, NOW())`,
                            [req.user.id, title, subject_id, startIso, endIso, meta.color || null, null]
                        );
                    }
                } catch (e) {
                    console.warn('Não foi possível criar evento de prova automaticamente:', e && (e.message || e));
                }
            }

            res.json({ message: 'Matéria adicionada com sucesso!' });
        } catch (error) {
            console.error('Erro ao adicionar matéria:', error);
            res.status(500).json({ error: 'Erro interno do servidor.' });
        }
    },

    async atualizarProgresso(req, res) {
        try {
            const { subject_id, hours_increment, last_studied } = req.body;
            const subjectId = Number.parseInt(subject_id, 10);
            if (!Number.isInteger(subjectId) || subjectId <= 0) {
                return res.status(400).json({ error: 'subject_id inválido.' });
            }

            const increment = parseHoursIncrement(hours_increment);
            const lastStudiedMySql = toMySqlDateTime(last_studied);

            // Increment hours_studied
            const [updateResult] = await pool.execute(
                'UPDATE user_progress SET hours_studied = hours_studied + ?, last_studied = ? WHERE user_id = ? AND subject_id = ?',
                [increment, lastStudiedMySql, req.user.id, subjectId]
            );
            if (!updateResult || !updateResult.affectedRows) {
                return res.status(404).json({ error: 'Matéria não encontrada para este utilizador.' });
            }

            // After increment, recompute progress if total_hours is present in metadata
            try {
                const [[metaRow]] = await pool.execute(
                    `SELECT meta FROM activity_logs WHERE user_id = ? AND type = 'subject_meta' AND JSON_EXTRACT(meta, '$.subject_id') = ? ORDER BY created_at DESC LIMIT 1`,
                    [req.user.id, subjectId]
                );
                if (metaRow && metaRow.meta) {
                    const parsed = typeof metaRow.meta === 'string' ? JSON.parse(metaRow.meta) : metaRow.meta;
                    const totalHours = parsed.total_hours ? Number(parsed.total_hours) : null;
                    if (totalHours && totalHours > 0) {
                        const [[upRow]] = await pool.execute('SELECT hours_studied FROM user_progress WHERE user_id = ? AND subject_id = ?', [req.user.id, subjectId]);
                        const hoursStudied = upRow ? Number(upRow.hours_studied || 0) : 0;
                        const progress = Math.min(100, Math.round((hoursStudied / totalHours) * 100));
                        await pool.execute('UPDATE user_progress SET progress = ? WHERE user_id = ? AND subject_id = ?', [progress, req.user.id, subjectId]);
                    }
                }
            } catch (e) {
                console.warn('Não foi possível recalcular progresso automaticamente:', e.message || e);
            }

            res.json({ message: 'Progresso atualizado com sucesso!' });
        } catch (error) {
            console.error('Erro ao atualizar progresso:', error);
            res.status(500).json({ error: 'Erro interno do servidor.' });
        }
    },

    async removerMateria(req, res) {
        try {
            const { subject_id } = req.params;
            await pool.execute('DELETE FROM user_progress WHERE user_id = ? AND subject_id = ?', [req.user.id, subject_id]);
            // Remove related activity_logs entries of type 'subject_meta' for this subject
            await pool.execute('DELETE FROM activity_logs WHERE user_id = ? AND type = ? AND JSON_EXTRACT(meta, "$.subject_id") = ?', [req.user.id, 'subject_meta', subject_id]);
            res.json({ message: 'Matéria removida com sucesso!' });
        } catch (error) {
            console.error('Erro ao remover matéria:', error);
            res.status(500).json({ error: 'Erro interno do servidor.' });
        }
    }
    ,

    // Allow users to suggest a new subject (creates subject if not exists and adds to user's materias)
    async sugerirMateria(req, res) {
        try {
            const { name, description, exam_date, total_hours, metas } = req.body;
            if (!name) return res.status(400).json({ error: 'Nome da matéria é obrigatório' });

            // Check if subject exists
            const [[existing]] = await pool.execute('SELECT id FROM subjects WHERE name = ? LIMIT 1', [name]);
            let subjectId = existing ? existing.id : null;

            if (!subjectId) {
                // Create subject as a lightweight entry (no admin required for this flow)
                const [result] = await pool.execute('INSERT INTO subjects (name, description, created_at) VALUES (?, ?, NOW())', [name, description || null]);
                subjectId = result.insertId;
            }

            // Reuse adicionarMateria logic: insert to user_progress and persist metadata
            await pool.execute(
                'INSERT INTO user_progress (user_id, subject_id, hours_studied, progress, last_studied, created_at) VALUES (?, ?, 0, 0, NULL, NOW()) ON DUPLICATE KEY UPDATE updated_at = NOW()',
                [req.user.id, subjectId]
            );

            const metasArr = Array.isArray(metas) ? metas : (metas ? String(metas).split(',').map(s=>s.trim()).filter(Boolean) : []);
            const color = req.body.color || req.body.cor || null;
            const meta = { subject_id: +subjectId, exam_date: exam_date || null, total_hours: total_hours ? +total_hours : null, metas: metasArr, color };
            await pool.execute(`INSERT INTO activity_logs (user_id, type, description, meta, created_at) VALUES (?, 'subject_meta', 'user suggested subject', ?, NOW())`, [req.user.id, JSON.stringify(meta)]);

            // If exam_date provided, create a calendar event for the exam (best-effort)
            if (exam_date) {
                try {
                    const startIso = (String(exam_date).length <= 10) ? `${exam_date} 00:00:00` : (new Date(exam_date)).toISOString().slice(0,19).replace('T',' ');
                    const endIso = (String(exam_date).length <= 10) ? `${exam_date} 23:59:59` : (new Date(exam_date)).toISOString().slice(0,19).replace('T',' ');
                    const title = `Prova: ${name}`;

                    const [[existingEvent]] = await pool.execute(
                        `SELECT id FROM events WHERE user_id = ? AND materia_id = ? AND DATE(start_iso) = DATE(?) LIMIT 1`,
                        [req.user.id, subjectId, startIso]
                    );
                    if (!existingEvent) {
                        await pool.execute(
                            `INSERT INTO events (user_id, title, materia_id, start_iso, end_iso, all_day, color, notes, created_at)
                             VALUES (?, ?, ?, ?, ?, 1, ?, ?, NOW())`,
                            [req.user.id, title, subjectId, startIso, endIso, color || null, null]
                        );
                    }
                } catch (e) {
                    console.warn('Não foi possível criar evento de prova automaticamente (sugerir):', e && (e.message || e));
                }
            }

            res.json({ message: 'Matéria sugerida e adicionada com sucesso!', subject_id: subjectId });
        } catch (err) {
            console.error('Erro ao sugerir matéria:', err);
            res.status(500).json({ error: 'Erro interno ao sugerir matéria.' });
        }
    },

    // Generate a simple study plan for the user across their subjects or for a single subject
    async getStudyPlan(req, res) {
        try {
            // Optional subject_id query param
            const subjectId = req.query.subject_id || null;
            const params = [req.user.id];
            let sql = `
                SELECT up.subject_id AS id, s.name, up.hours_studied
                FROM user_progress up
                JOIN subjects s ON up.subject_id = s.id
                WHERE up.user_id = ?
            `;
            if (subjectId) {
                sql += ' AND up.subject_id = ?';
                params.push(subjectId);
            }
            const [rows] = await pool.execute(sql, params);

            // Fetch latest metadata entries per subject from activity_logs
            const plans = [];
            for (const r of rows) {
                const [[metaRow]] = await pool.execute(`
                    SELECT meta
                    FROM activity_logs
                    WHERE user_id = ? AND type = 'subject_meta' AND JSON_EXTRACT(meta, '$.subject_id') = ?
                    ORDER BY created_at DESC
                    LIMIT 1
                `, [req.user.id, r.id]);

                let exam_date = null;
                let total_hours = null;
                if (metaRow && metaRow.meta) {
                    try {
                        const parsed = typeof metaRow.meta === 'string' ? JSON.parse(metaRow.meta) : metaRow.meta;
                        exam_date = parsed.exam_date || null;
                        total_hours = parsed.total_hours != null ? parsed.total_hours : null;
                    } catch (e) {
                        // ignore parse errors
                    }
                }

                // Compute days until exam
                let daysLeft = null;
                if (exam_date) {
                    const diff = Math.ceil((new Date(exam_date) - new Date()) / (1000*60*60*24));
                    daysLeft = diff > 0 ? diff : 0;
                }
                const remainingHours = (total_hours || 0) - (r.hours_studied || 0);
                const daily = daysLeft && daysLeft > 0 ? +(remainingHours / daysLeft).toFixed(2) : null;
                plans.push({ subject_id: r.id, name: r.name, exam_date: exam_date, total_hours: total_hours, hours_studied: r.hours_studied, remaining_hours: remainingHours, days_left: daysLeft, suggested_daily_hours: daily });
            }

            res.json({ plans });
        } catch (err) {
            console.error('Erro ao gerar plano de estudo:', err);
            res.status(500).json({ error: 'Erro interno ao gerar plano.' });
        }
    }
};

module.exports = materiaController;
