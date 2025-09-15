const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// AI API Configuration
const AI_API_CONFIG = {
    ollama: {
        url: process.env.OLLAMA_URL || 'https://ollama-phi3-mini.onrender.com/v1/chat/completions',
        headers: {
            'Content-Type': 'application/json'
        },
        model: process.env.OLLAMA_MODEL || 'phi3:mini'
    }
};

const DEFAULT_PROVIDER = process.env.AI_PROVIDER || 'ollama';

app.post('/api/chat', async (req, res) => {
    try {
        const { messages, stream = false, provider = DEFAULT_PROVIDER, model } = req.body;

        if (!messages || !Array.isArray(messages)) {
            return res.status(400).json({ error: 'Messages array is required' });
        }

        const config = AI_API_CONFIG[provider];
        if (!config) {
            return res.status(400).json({ error: `Unsupported provider: ${provider}` });
        }

        const requestBody = {
            model: model || config.model,
            messages: messages,
            stream: stream
        };

        if (stream) {
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');

            const apiResponse = await axios.post(config.url, requestBody, {
                headers: config.headers,
                responseType: 'stream'
            });

            apiResponse.data.on('data', (chunk) => {
                res.write(chunk);
            });

            apiResponse.data.on('end', () => {
                res.end();
            });

            apiResponse.data.on('error', (err) => {
                console.error('Stream error:', err);
                res.end();
            });
        } else {
            const apiResponse = await axios.post(config.url, requestBody, {
                headers: config.headers
            });
            res.json(apiResponse.data);
        }
    } catch (error) {
        console.error('AI API Error:', error.message);
        res.status(500).json({
            error: 'Failed to process request'
        });
    }
});

app.use(express.static('public'));
app.get('*', (req, res) => {
    res.sendFile(__dirname + '/public/index.html');
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
