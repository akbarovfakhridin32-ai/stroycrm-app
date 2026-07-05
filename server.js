// ============================================================
// СЕРВЕР СТРОЙCRM — YANDEX CLOUD (БЕЗ SSL)
// ============================================================

const express = require('express');
const path = require('path');
const { Client } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================================
// ПОДКЛЮЧЕНИЕ К YANDEX CLOUD (БЕЗ SSL)
// ============================================================

const db = new Client({
    host: 'rc1b-usc3afv98f9jlu9u.mdb.yandexcloud.net',
    port: 6432,
    database: 'db1',
    user: 'user1',
    password: 'yci<9j4r]Uhi1H.U8(rvvs_wxx#=Q.GTikUT',
    // SSL отключён для теста
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
// СОЗДАНИЕ ТАБЛИЦ
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

    // Создаём пользователя RUK-0001
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
            notes = COALESCE($9, notes)
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
// ЗАПУСК СЕРВЕРА
// ============================================================

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
    console.log(`🚀 СтройCRM сервер запущен на порту ${PORT}`);
    console.log(`📡 База данных: Yandex Cloud PostgreSQL (Россия)`);
});