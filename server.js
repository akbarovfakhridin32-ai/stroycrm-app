
// ============================================================
// Сервер СтройCRM для Timeweb Cloud
// 1. Отдаёт сам сайт (index.html) всем посетителям
// 2. Принимает вопросы от ИИ-помощника и безопасно
//    пересылает их в GigaChat, пряча ключ авторизации
// ============================================================

const express = require('express');
const path = require('path');
const https = require('https');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(__dirname));

// ---- ВРЕМЕННАЯ АВТОРИЗАЦИЯ (ДЛЯ ВХОДА) ----
app.post('/login', (req, res) => {
    const { login, password } = req.body;
    console.log('Попытка входа:', login, password);

    // ВРЕМЕННО: пропускаем любого пользователя
    if (login && login.length > 0) {
        return res.json({
            success: true,
            user: {
                id: '1',
                login: login,
                name: 'Руководитель',
                role: 'owner',
                full_name: 'Руководитель'
            }
        });
    }
    res.status(401).json({
        success: false,
        error: 'Неверный логин или пароль'
    });
});

// ---- Работа с токеном GigaChat (обновляется автоматически) ----
let cachedToken = null;
let tokenExpiresAt = 0;

const insecureAgent = new https.Agent({ rejectUnauthorized: false });

function getAccessToken() {
  return new Promise((resolve, reject) => {
    const now = Date.now();
    if (cachedToken && now < tokenExpiresAt - 30000) {
      resolve(cachedToken);
      return;
    }

    const authKey = process.env.GIGACHAT_AUTH_KEY;
    if (!authKey) {
      reject(new Error('GIGACHAT_AUTH_KEY не настроен в переменных окружения'));
      return;
    }

    const body = 'scope=GIGACHAT_API_PERS';
    const options = {
      hostname: 'ngw.devices.sberbank.ru',
      port: 9443,
      path: '/api/v2/oauth',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
        'RqUID': generateUUID(),
        'Authorization': `Basic ${authKey}`,
        'Content-Length': Buffer.byteLength(body)
      },
      agent: insecureAgent
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (!json.access_token) {
            reject(new Error('Не удалось получить токен: ' + data));
            return;
          }
          cachedToken = json.access_token;
          tokenExpiresAt = json.expires_at ? json.expires_at * 1000 : now + 25 * 60 * 1000;
          resolve(cachedToken);
        } catch (e) {
          reject(new Error('Ошибка разбора ответа токена: ' + data));
        }
      });
    });

    req.on('error', (e) => reject(e));
    req.write(body);
    req.end();
  });
}

function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function askGigaChat(token, messages) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: 'GigaChat',
      messages,
      temperature: 0.7,
      max_tokens: 1000
    });

    const options = {
      hostname: 'gigachat.devices.sberbank.ru',
      port: 443,
      path: '/api/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': `Bearer ${token}`,
        'Content-Length': Buffer.byteLength(body)
      },
      agent: insecureAgent
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve(json);
        } catch (e) {
          reject(new Error('Ошибка разбора ответа GigaChat: ' + data));
        }
      });
    });

    req.on('error', (e) => reject(e));
    req.write(body);
    req.end();
  });
});

// ---- Маршрут для ИИ-помощника ----
app.post('/api/ai-assistant', async (req, res) => {
  try {
    const { system, messages } = req.body;

    const gigaMessages = [
      { role: 'system', content: system || '' },
      ...(messages || []).map(m => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.content
      }))
    ];

    const token = await getAccessToken();
    const gigaData = await askGigaChat(token, gigaMessages);

    const answer = gigaData.choices?.[0]?.message?.content
      || gigaData.error
      || 'Не получилось получить ответ от GigaChat.';

    res.json({ answer });
  } catch (err) {
    console.error('Ошибка ИИ-помощника:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ---- Все остальные запросы - отдаём главную страницу ----
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`СтройCRM сервер запущен на порту ${PORT}`);
});