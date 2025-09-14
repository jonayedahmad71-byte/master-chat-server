// server.js
const express = require('express');
const cors = require('cors');
const { createProxyMiddleware } = require('http-proxy-middleware');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// ✅ কনফিগারেবল AI API — এখানে তুমি যেকোনো API সেট করতে পারবে
const AI_API_CONFIG = {
    // ✅ Groq API (ডিফল্ট)
    groq: {
        url: 'https://api.groq.com/openai/v1/chat/completions',
        headers: {
            'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
            'Content-Type': 'application/json'
        },
        model: 'llama3-70b-8192' // ডিফল্ট মডেল
    },

    // ✅ OpenAI API (অপশনাল)
    openai: {
        url: 'https://api.openai.com/v1/chat/completions',
        headers: {
            'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
            'Content-Type': 'application/json'
        },
        model: 'gpt-4-turbo'
    },

    // ✅ Mistral API (অপশনাল)
    mistral: {
        url: 'https://api.mistral.ai/v1/chat/completions',
        headers: {
            'Authorization': `Bearer ${process.env.MISTRAL_API_KEY}`,
            'Content-Type': 'application/json'
        },
        model: 'mistral-large-latest'
    },

    // ✅ Ollama (লোকাল/রিমোট)
    ollama: {
        url: process.env.OLLAMA_URL || 'http://localhost:11434/v1/chat/completions',
        headers: {
            'Content-Type': 'application/json'
        },
        model: process.env.OLLAMA_MODEL || 'llama3'
    }
};

// ✅ ডিফল্ট API প্রোভাইডার (পরিবর্তনযোগ্য)
const DEFAULT_PROVIDER = process.env.AI_PROVIDER || 'groq';

app.post('/api/chat', async (req, res) => {
    try {
        const { messages, stream = false, provider = DEFAULT_PROVIDER, model } = req.body;

        // ভ্যালিডেশন
        if (!messages || !Array.isArray(messages)) {
            return res.status(400).json({ error: 'Messages array is required' });
        }

        // প্রোভাইডার সিলেক্ট
        const config = AI_API_CONFIG[provider];
        if (!config) {
            return res.status(400).json({ error: `Unsupported provider: ${provider}` });
        }

        // রিকোয়েস্ট বডি বিল্ড
        const requestBody = {
            model: model || config.model,
            messages: messages,
            stream: stream
        };

        // স্ট্রিমিং রেসপন্স
        if (stream) {
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');

            const response = await axios.post(config.url, requestBody, {
                headers: config.headers,
                responseType: 'stream'
            });

            response.data.on('data', (chunk) => {
                res.write(chunk);
            });

            response.data.on('end', () => {
                res.end();
            });

            response.data.on('error', (err) => {
                console.error('Stream error:', err);
                res.end();
            });

        } else {
            // নন-স্ট্রিমিং
            const response = await axios.post(config.url, requestBody, {
                headers: config.headers
            });

            res.json(response.data);
        }

    } catch (error) {
        console.error('AI API Error:', error.message);
        res.status(500).json({
            error: 'Failed to process request',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// হেলথ চেক
app.get('/health', (req, res) => {
    res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// স্ট্যাটিক ফাইল সার্ভ (আমাদের index.html)
app.use(express.static('public'));

// ফলব্যাক — SPA সাপোর্ট
app.get('*', (req, res) => {
    res.sendFile(__dirname + '/public/index.html');
});

app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`🌐 Access at: http://localhost:${PORT}`);
    console.log(`🤖 Default AI Provider: ${DEFAULT_PROVIDER}`);
});
