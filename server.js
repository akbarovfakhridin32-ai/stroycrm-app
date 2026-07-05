// ============================================================
// СЕРВЕР СТРОЙCRM — РАБОТАЕТ С YANDEX CLOUD (РОССИЯ)
// ============================================================

const express = require('express');
const path = require('path');
const { Client } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================================
// ПОДКЛЮЧЕНИЕ К YANDEX CLOUD (РОССИЙСКАЯ БАЗА ДАННЫХ)
// ============================================================

const db = new Client({
    host: 'rc1b-usc3afv98f9jlu9u.mdb.yandexcloud.net',
    port: 6432,
    database: 'db1',
    user: 'user1',
    password: 'yci<9j4r]Uhi1H.U8(rvvs_wxx#=Q.GTikUT',
    ssl: {
        rejectUnauthorized: false
    }
});

db.connect((err) => {
    if (err) {
        console.error('❌ Ошибка подключения к Yandex Cloud:', err.message);
    } else {
        console.log('✅ Подключено к Yandex Cloud PostgreSQL');
        createTables();
    }
});

// ============================================================
// СОЗДАНИЕ ТАБЛИЦ (ЕСЛИ ИХ НЕТ)
// ============================================================

function createTables() {
    const queries = [
        `CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            login TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            full_name TEXT,
            role TEXT DEFAULT 'worker',
            phone TEXT,
            created_at TIMESTAMP DEFAULT NOW()
        )`,
        `CREATE TABLE IF NOT EXISTS projects (
            id SERIAL PRIMARY KEY,
            name TEXT NOT NULL,
            address TEXT,
            client_name TEXT,
            client_phone TEXT,
            budget INTEGER,
            status TEXT DEFAULT 'active',
            start_date DATE,
            end_date DATE,
            notes TEXT,
            created_at TIMESTAMP DEFAULT NOW()
        )`,
        `CREATE TABLE IF NOT EXISTS tasks (
            id SERIAL PRIMARY KEY,
            project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
            name TEXT NOT NULL,
            assignee_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
            due_date DATE,
            priority TEXT DEFAULT 'med',
            done BOOLEAN DEFAULT FALSE,
            comment TEXT,
            created_at TIMESTAMP DEFAULT NOW()
        )`,
        `CREATE TABLE IF NOT EXISTS project_members (
            id SERIAL PRIMARY KEY,
            project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
            user_id INTEGER REFERENCES users(id) ON DELETE CASCADE
        )`,
        `CREATE TABLE IF NOT EXISTS reports (
            id SERIAL PRIMARY KEY,
            project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
            user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
            comment TEXT,
            photos TEXT[],
            status TEXT DEFAULT 'sent',
            review_comment TEXT,
            stage_id INTEGER,
            created_at TIMESTAMP DEFAULT NOW()
        )`,
        `CREATE TABLE IF NOT EXISTS messages (
            id SERIAL PRIMARY KEY,
            project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
            user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
            text TEXT,
            photo_urls TEXT[],
            reply_to INTEGER,
            pinned BOOLEAN DEFAULT FALSE,
            edited BOOLEAN DEFAULT FALSE,
            created_at TIMESTAMP DEFAULT NOW()
        )`
    ];

    queries.forEach((q, i) => {
        db.query(q, (err) => {
            if (err) {
                console.error(`❌ Ошибка создания таблицы #${i+1}:`, err.message);
            } else {
                console.log(`✅ Таблица #${i+1} готова`);
            }
        });
    });

    // Проверяем, есть ли пользователь RUK-0001
    db.query(`SELECT * FROM users WHERE login = 'RUK-0001'`, (err, res) => {
        if (!err && res.rows.length === 0) {
            db.query(
                `INSERT INTO users (login, password, full_name, role) VALUES ($1, $2, $3, $4)`,
                ['RUK-0001', '1234', 'Руководитель', 'owner'],
                (err2) => {
                    if (!err2) console.log('✅ Пользователь RUK-0001 создан');
                }
            );
        }
    });
}

// ============================================================
// АВТОРИЗАЦИЯ
// ============================================================

app.use(express.json());
app.use(express.static(__dirname));

app.post('/login', (req, res) => {
    const { login, password } = req.body;
    console.log('🔐 Попытка входа:', login);

    db.query(
        `SELECT * FROM users WHERE login = $1 AND password = $2`,
        [login, password],
        (err, result) => {
            if (err) {
                console.error('❌ Ошибка БД:', err.message);
                return res.status(500).json({ success: false, error: 'Ошибка сервера' });
            }

            if (result.rows.length === 0) {
                return res.status(401).json({ success: false, error: 'Неверный логин или пароль' });
            }

            const user = result.rows[0];
            res.json({
                success: true,
                user: {
                    id: user.id,
                    login: user.login,
                    name: user.full_name,
                    role: user.role,
                    full_name: user.full_name
                }
            });
        }
    );
});

// ============================================================
// API ДЛЯ ОБЪЕКТОВ
// ============================================================

app.get('/api/projects', (req, res) => {
    db.query(`SELECT * FROM projects ORDER BY created_at DESC`, (err, result) => {
        if (err) {
            console.error('❌ Ошибка получения объектов:', err.message);
            return res.status(500).json({ error: err.message });
        }
        res.json(result.rows);
    });
});

app.post('/api/projects', (req, res) => {
    const { name, address, client_name, client_phone, budget, status, start_date, end_date, notes } = req.body;
    db.query(
        `INSERT INTO projects (name, address, client_name, client_phone, budget, status, start_date, end_date, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
        [name, address, client_name, client_phone, budget, status, start_date, end_date, notes],
        (err, result) => {
            if (err) {
                console.error('❌ Ошибка создания объекта:', err.message);
                return res.status(500).json({ error: err.message });
            }
            res.json(result.rows[0]);
        }
    );
});

app.put('/api/projects/:id', (req, res) => {
    const { name, address, client_name, client_phone, budget, status, start_date, end_date, notes } = req.body;
    const id = req.params.id;
    db.query(
        `UPDATE projects SET
            name = COALESCE($1, name),
            address = COALESCE($2, address),
            client_name = COALESCE($3, client_name),
            client_phone = COALESCE($4, client_phone),
            budget = COALESCE($5, budget),
            status = COALESCE($6, status),
            start_date = COALESCE($7, start_date),
            end_date = COALESCE($8, end_date),
            notes = COALESCE($9, notes),
            updated_at = NOW()
         WHERE id = $10 RETURNING *`,
        [name, address, client_name, client_phone, budget, status, start_date, end_date, notes, id],
        (err, result) => {
            if (err) {
                console.error('❌ Ошибка обновления объекта:', err.message);
                return res.status(500).json({ error: err.message });
            }
            res.json(result.rows[0]);
        }
    );
});

app.delete('/api/projects/:id', (req, res) => {
    const id = req.params.id;
    db.query(`DELETE FROM projects WHERE id = $1`, [id], (err) => {
        if (err) {
            console.error('❌ Ошибка удаления объекта:', err.message);
            return res.status(500).json({ error: err.message });
        }
        res.json({ success: true });
    });
});

// ============================================================
// API ДЛЯ СОТРУДНИКОВ
// ============================================================

app.get('/api/users', (req, res) => {
    db.query(`SELECT * FROM users ORDER BY id`, (err, result) => {
        if (err) {
            console.error('❌ Ошибка получения сотрудников:', err.message);
            return res.status(500).json({ error: err.message });
        }
        res.json(result.rows);
    });
});

app.post('/api/users', (req, res) => {
    const { login, password, full_name, role, phone } = req.body;
    db.query(
        `INSERT INTO users (login, password, full_name, role, phone) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [login, password, full_name, role, phone],
        (err, result) => {
            if (err) {
                console.error('❌ Ошибка создания сотрудника:', err.message);
                return res.status(500).json({ error: err.message });
            }
            res.json(result.rows[0]);
        }
    );
});

app.put('/api/users/:id', (req, res) => {
    const { login, password, full_name, role, phone } = req.body;
    const id = req.params.id;
    db.query(
        `UPDATE users SET
            login = COALESCE($1, login),
            password = COALESCE($2, password),
            full_name = COALESCE($3, full_name),
            role = COALESCE($4, role),
            phone = COALESCE($5, phone)
         WHERE id = $6 RETURNING *`,
        [login, password, full_name, role, phone, id],
        (err, result) => {
            if (err) {
                console.error('❌ Ошибка обновления сотрудника:', err.message);
                return res.status(500).json({ error: err.message });
            }
            res.json(result.rows[0]);
        }
    );
});

app.delete('/api/users/:id', (req, res) => {
    const id = req.params.id;
    db.query(`DELETE FROM users WHERE id = $1`, [id], (err) => {
        if (err) {
            console.error('❌ Ошибка удаления сотрудника:', err.message);
            return res.status(500).json({ error: err.message });
        }
        res.json({ success: true });
    });
});

// ============================================================
// API ДЛЯ ЗАДАЧ
// ============================================================

app.get('/api/tasks/:projectId', (req, res) => {
    const projectId = req.params.projectId;
    db.query(
        `SELECT t.*, u.full_name as assignee_name
         FROM tasks t
         LEFT JOIN users u ON t.assignee_id = u.id
         WHERE t.project_id = $1
         ORDER BY t.created_at DESC`,
        [projectId],
        (err, result) => {
            if (err) {
                console.error('❌ Ошибка получения задач:', err.message);
                return res.status(500).json({ error: err.message });
            }
            res.json(result.rows);
        }
    );
});

app.post('/api/tasks', (req, res) => {
    const { project_id, name, assignee_id, due_date, priority, comment } = req.body;
    db.query(
        `INSERT INTO tasks (project_id, name, assignee_id, due_date, priority, comment)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [project_id, name, assignee_id, due_date, priority, comment],
        (err, result) => {
            if (err) {
                console.error('❌ Ошибка создания задачи:', err.message);
                return res.status(500).json({ error: err.message });
            }
            res.json(result.rows[0]);
        }
    );
});

app.put('/api/tasks/:id', (req, res) => {
    const { name, assignee_id, due_date, priority, done, comment } = req.body;
    const id = req.params.id;
    db.query(
        `UPDATE tasks SET
            name = COALESCE($1, name),
            assignee_id = COALESCE($2, assignee_id),
            due_date = COALESCE($3, due_date),
            priority = COALESCE($4, priority),
            done = COALESCE($5, done),
            comment = COALESCE($6, comment)
         WHERE id = $7 RETURNING *`,
        [name, assignee_id, due_date, priority, done, comment, id],
        (err, result) => {
            if (err) {
                console.error('❌ Ошибка обновления задачи:', err.message);
                return res.status(500).json({ error: err.message });
            }
            res.json(result.rows[0]);
        }
    );
});

app.delete('/api/tasks/:id', (req, res) => {
    const id = req.params.id;
    db.query(`DELETE FROM tasks WHERE id = $1`, [id], (err) => {
        if (err) {
            console.error('❌ Ошибка удаления задачи:', err.message);
            return res.status(500).json({ error: err.message });
        }
        res.json({ success: true });
    });
});

// ============================================================
// API ДЛЯ ПРОЕКТНЫХ ЗАПИСЕЙ (УЧАСТНИКИ)
// ============================================================

app.get('/api/members/:projectId', (req, res) => {
    const projectId = req.params.projectId;
    db.query(
        `SELECT pm.*, u.full_name, u.role, u.phone
         FROM project_members pm
         JOIN users u ON pm.user_id = u.id
         WHERE pm.project_id = $1`,
        [projectId],
        (err, result) => {
            if (err) {
                console.error('❌ Ошибка получения участников:', err.message);
                return res.status(500).json({ error: err.message });
            }
            res.json(result.rows);
        }
    );
});

app.post('/api/members', (req, res) => {
    const { project_id, user_id } = req.body;
    db.query(
        `INSERT INTO project_members (project_id, user_id) VALUES ($1, $2) RETURNING *`,
        [project_id, user_id],
        (err, result) => {
            if (err) {
                console.error('❌ Ошибка добавления участника:', err.message);
                return res.status(500).json({ error: err.message });
            }
            res.json(result.rows[0]);
        }
    );
});

app.delete('/api/members/:id', (req, res) => {
    const id = req.params.id;
    db.query(`DELETE FROM project_members WHERE id = $1`, [id], (err) => {
        if (err) {
            console.error('❌ Ошибка удаления участника:', err.message);
            return res.status(500).json({ error: err.message });
        }
        res.json({ success: true });
    });
});

// ============================================================
// API ДЛЯ ОТЧЁТОВ
// ============================================================

app.get('/api/reports/:projectId', (req, res) => {
    const projectId = req.params.projectId;
    db.query(
        `SELECT r.*, u.full_name as user_name
         FROM reports r
         JOIN users u ON r.user_id = u.id
         WHERE r.project_id = $1
         ORDER BY r.created_at DESC`,
        [projectId],
        (err, result) => {
            if (err) {
                console.error('❌ Ошибка получения отчётов:', err.message);
                return res.status(500).json({ error: err.message });
            }
            res.json(result.rows);
        }
    );
});

app.post('/api/reports', (req, res) => {
    const { project_id, user_id, comment, photos, status, stage_id } = req.body;
    db.query(
        `INSERT INTO reports (project_id, user_id, comment, photos, status, stage_id)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [project_id, user_id, comment, photos, status, stage_id],
        (err, result) => {
            if (err) {
                console.error('❌ Ошибка создания отчёта:', err.message);
                return res.status(500).json({ error: err.message });
            }
            res.json(result.rows[0]);
        }
    );
});

app.put('/api/reports/:id', (req, res) => {
    const { comment, status, review_comment } = req.body;
    const id = req.params.id;
    db.query(
        `UPDATE reports SET
            comment = COALESCE($1, comment),
            status = COALESCE($2, status),
            review_comment = COALESCE($3, review_comment)
         WHERE id = $4 RETURNING *`,
        [comment, status, review_comment, id],
        (err, result) => {
            if (err) {
                console.error('❌ Ошибка обновления отчёта:', err.message);
                return res.status(500).json({ error: err.message });
            }
            res.json(result.rows[0]);
        }
    );
});

app.delete('/api/reports/:id', (req, res) => {
    const id = req.params.id;
    db.query(`DELETE FROM reports WHERE id = $1`, [id], (err) => {
        if (err) {
            console.error('❌ Ошибка удаления отчёта:', err.message);
            return res.status(500).json({ error: err.message });
        }
        res.json({ success: true });
    });
});

// ============================================================
// API ДЛЯ СООБЩЕНИЙ (ЧАТ)
// ============================================================

app.get('/api/messages/:projectId', (req, res) => {
    const projectId = req.params.projectId;
    db.query(
        `SELECT m.*, u.full_name as user_name
         FROM messages m
         JOIN users u ON m.user_id = u.id
         WHERE m.project_id = $1
         ORDER BY m.created_at ASC`,
        [projectId],
        (err, result) => {
            if (err) {
                console.error('❌ Ошибка получения сообщений:', err.message);
                return res.status(500).json({ error: err.message });
            }
            res.json(result.rows);
        }
    );
});

app.post('/api/messages', (req, res) => {
    const { project_id, user_id, text, photo_urls, reply_to } = req.body;
    db.query(
        `INSERT INTO messages (project_id, user_id, text, photo_urls, reply_to)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [project_id, user_id, text, photo_urls, reply_to],
        (err, result) => {
            if (err) {
                console.error('❌ Ошибка отправки сообщения:', err.message);
                return res.status(500).json({ error: err.message });
            }
            res.json(result.rows[0]);
        }
    );
});

app.put('/api/messages/:id', (req, res) => {
    const { text, pinned } = req.body;
    const id = req.params.id;
    db.query(
        `UPDATE messages SET
            text = COALESCE($1, text),
            pinned = COALESCE($2, pinned),
            edited = TRUE
         WHERE id = $3 RETURNING *`,
        [text, pinned, id],
        (err, result) => {
            if (err) {
                console.error('❌ Ошибка обновления сообщения:', err.message);
                return res.status(500).json({ error: err.message });
            }
            res.json(result.rows[0]);
        }
    );
});

app.delete('/api/messages/:id', (req, res) => {
    const id = req.params.id;
    db.query(`DELETE FROM messages WHERE id = $1`, [id], (err) => {
        if (err) {
            console.error('❌ Ошибка удаления сообщения:', err.message);
            return res.status(500).json({ error: err.message });
        }
        res.json({ success: true });
    });
});

// ============================================================
// ГЛАВНАЯ СТРАНИЦА
// ============================================================

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// ============================================================
// ЗАПУСК СЕРВЕРА
// ============================================================

app.listen(PORT, () => {
    console.log(`🚀 СтройCRM сервер запущен на порту ${PORT}`);
    console.log(`📡 База данных: Yandex Cloud PostgreSQL (Россия)`);
});