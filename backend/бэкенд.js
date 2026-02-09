// бэкенд.js - Сервер для ИИ-стилиста
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();

app.use(cors({
    origin: '*',
    credentials: true
}));
app.use(express.json());

// МАША НЕ ПРОСРИ КЛЮЧИ
const API_KEY = process.env.YANDEX_API_KEY;
const FOLDER_ID = process.env.YANDEX_FOLDER_ID;

// Хранилище
const conversations = {};

app.post('/api/chat', async (req, res) => {
    console.log('📩 Вопрос:', req.body.message?.substring(0, 50));
    
    try {
        const { message, userId = 'guest' } = req.body;
        
        if (!message || message.trim() === '') {
            return res.json({ 
                success: false, 
                error: 'Напиши вопрос!' 
            });
        }

        // Проверка ключей
        if (!API_KEY || !FOLDER_ID) {
            console.error('❌ API ключи не настроены в .env!');
            return res.status(500).json({
                success: false,
                error: 'Сервер не настроен.'
            });
        }

        // История созд
        let history = conversations[userId] || [];
        
        const allMessages = [];
        
        // Промпт
        allMessages.push({
            role: "system",
            text: `Ты — ассистент-стилист. Старайся брать информацию из открытого доступа.  НЕ ПИШИ ОТВЕТ ПО ПУНКТАМ, ПО ОДНОМУ ШАБЛОНУ. ДОЛЖНО СОЗДАВАТЬСЯ ОЩУЩЕНИЕ ЖИВОГО ДИАЛОГА МЕЖДУ ТОБОЙ И ПОЛЬЗОВАТЕЛЕМ. Отвечай развернутыми предложениями, давай необходимую информацию. 
            Поясняй информацию, которую пользователь может не понять сразу. Можешь давать дополнительные советы. Участвуй в диалоге, подстраивайся под стиль общения пользователя,
            не делай диалог официальным. В процессе рекомендаций можешь ссылаться на вещи в интернет-магазинах. Стиль ответов — разговорный, живой.
            Запомни, все твои ответы должны быть связаны со стилем.`
        });
        
        // История
        if (history.length > 0) {
            const recentHistory = history.slice(-4);
            for (const msg of recentHistory) {
                allMessages.push({
                    role: msg.role === 'user' ? 'user' : 'assistant',
                    text: msg.content
                });
            }
        }
        
        // Текущий вопрос
        allMessages.push({
            role: "user",
            text: message
        });

        console.log('📊 Всего сообщений для Яндекса:', allMessages.length);
        
        // В Яндекс
        const response = await axios.post(
            'https://llm.api.cloud.yandex.net/foundationModels/v1/completion',
            {
                modelUri: `gpt://${FOLDER_ID}/yandexgpt-lite`,
                completionOptions: {
                    stream: false,
                    temperature: 0.7,
                    maxTokens: 800
                },
                messages: allMessages
            },
            {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Api-Key ${API_KEY}`
                },
                timeout: 15000
            }
        );

        const aiReply = response.data.result.alternatives[0].message.text;
        console.log('✅ Яндекс ответил!');
        
        history.push(
            { role: 'user', content: message },
            { role: 'assistant', content: aiReply }
        );
        
        if (history.length > 6) {
            history = history.slice(-6);
        }
        
        conversations[userId] = history;
        
        res.json({
            success: true,
            reply: aiReply
        });

    } catch (error) {
        console.error('❌ Ошибка:', error.response?.data || error.message);
        
        let errorMessage = 'Что-то пошло не так';
        
        if (error.response) {
            if (error.response.status === 400) {
                errorMessage = 'Яндекс не понял запрос';
            } else if (error.response.status === 429) {
                errorMessage = 'Слишком много запросов';
            } else if (error.response.status === 403) {
                errorMessage = 'Проблема с API ключом';
            }
        } else if (error.request) {
            errorMessage = 'Яндекс не отвечает';
        }
        
        res.status(500).json({
            success: false,
            error: errorMessage
        });
    }
});

app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        users: Object.keys(conversations).length,
        apiConfigured: !!(API_KEY && FOLDER_ID)
    });
});

app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Бэкенд ИИ-стилиста</title>
            <meta charset="UTF-8">
            <style>
                body { font-family: Arial; padding: 40px; text-align: center; }
                h1 { color: #b21ddc; }
                .card { 
                    background: white; 
                    border-radius: 15px; 
                    padding: 30px; 
                    box-shadow: 0 5px 20px rgba(0,0,0,0.1);
                    display: inline-block;
                    margin: 20px;
                }
                .status { color: green; font-weight: bold; }
                .reset-btn { 
                    background: #b21ddc; 
                    color: white; 
                    border: none; 
                    padding: 10px 20px; 
                    border-radius: 10px; 
                    cursor: pointer; 
                    margin: 10px; 
                }
                .api-status {
                    padding: 5px 10px;
                    border-radius: 5px;
                    font-weight: bold;
                }
                .api-ok { background: #d4edda; color: #155724; }
                .api-error { background: #f8d7da; color: #721c24; }
            </style>
        </head>
        <body>
            <div class="card">
                <h1>🎨 Бэкенд ИИ-стилиста</h1>
                <p class="status">✅ Сервер работает</p>
                <p>Порт: ${process.env.PORT || 3000}</p>
                <p>API ключи: <span class="api-status ${API_KEY && FOLDER_ID ? 'api-ok' : 'api-error'}">
                    ${API_KEY && FOLDER_ID ? '✅ Настроены' : '❌ Не настроены'}
                </span></p>
                <p>Пользователей: ${Object.keys(conversations).length}</p>
                
                <div style="margin: 20px;">
                    <button class="reset-btn" onclick="resetHistory()">Сбросить историю</button>
                </div>
                
                <div>
                    <a href="/api/health">Проверка здоровья</a>
                </div>
            </div>
            
            <script>
                function resetHistory() {
                    fetch('/api/reset', { method: 'POST' })
                        .then(() => alert('История сброшена!'))
                        .catch(() => alert('Ошибка'));
                }
            </script>
        </body>
        </html>
    `);
});

app.post('/api/reset', (req, res) => {
    const { userId = 'guest' } = req.body;
    if (conversations[userId]) {
        delete conversations[userId];
    }
    res.json({ success: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`
    🚀 Бэкенд запущен!
    📍 Локально: http://localhost:${PORT}
    📌 API ключи: ${API_KEY && FOLDER_ID ? '✅ Настроены' : '❌ Не настроены'}
    `);

});

