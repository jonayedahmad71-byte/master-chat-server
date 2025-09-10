// server.js
const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const bodyParser = require('body-parser');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname)));

// SQLite Database
const db = new sqlite3.Database('./chat-history.db');

// Create table if not exists
db.serialize(() => {
    db.run(`
        CREATE TABLE IF NOT EXISTS chats (
            id TEXT PRIMARY KEY,
            user_id TEXT,
            title TEXT,
            messages TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);
});

// ✅ API: Get chat history for user
app.get('/api/chats/:userId', (req, res) => {
    const { userId } = req.params;
    db.all('SELECT * FROM chats WHERE user_id = ? ORDER BY created_at DESC', [userId], (err, rows) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json(rows.map(row => ({ ...row, messages: JSON.parse(row.messages) })));
    });
});

// ✅ API: Save chat
app.post('/api/chats', (req, res) => {
    const { id, userId, title, messages } = req.body;
    const stmt = db.prepare('INSERT OR REPLACE INTO chats (id, user_id, title, messages) VALUES (?, ?, ?, ?)');
    stmt.run(id, userId, title, JSON.stringify(messages), function(err) {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json({ id: this.lastID });
    });
    stmt.finalize();
});

// ✅ API: Get single chat
app.get('/api/chats/:userId/:chatId', (req, res) => {
    const { userId, chatId } = req.params;
    db.get('SELECT * FROM chats WHERE id = ? AND user_id = ?', [chatId, userId], (err, row) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        if (!row) {
            return res.status(404).json({ error: 'Chat not found' });
        }
        row.messages = JSON.parse(row.messages);
        res.json(row);
    });
});

// ✅ API: Send message to Groq (সিকিউর API কল)
app.post('/api/chat', async (req, res) => {
    try {
        const { messages, model = 'llama-3.1-8b-instant', stream = false } = req.body;

        const groqResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.GROQ_API_KEY}`
            },
            body: JSON.stringify({
                model,
                messages,
                max_tokens: 500,
                temperature: 0.7,
                stream
            })
        });

        if (!groqResponse.ok) {
            const errorData = await groqResponse.json();
            throw new Error(errorData.error?.message || 'Groq API Error');
        }

        if (stream) {
            // Streaming response
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');

            const reader = groqResponse.body.getReader();
            const decoder = new TextDecoder();

            while (true) {
                const { value, done } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value);
                res.write(chunk);
            }
            res.end();
        } else {
            // Normal response
            const data = await groqResponse.json();
            res.json(data);
        }
    } catch (error) {
        console.error('Server Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Serve frontend
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
    console.log(`✅ Server running on port ${PORT}`);
});
