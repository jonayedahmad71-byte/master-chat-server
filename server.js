const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const bodyParser = require('body-parser');
const path = require('path');
require('dotenv').config();

// ✅ Node.js fetch fallback (for Node < 18)
let fetchFn;
try {
    fetchFn = fetch;
} catch {
    fetchFn = require("node-fetch");
}

const app = express();
const PORT = process.env.PORT || 5000;

// -------------------- Middleware --------------------
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// -------------------- SQLite Database --------------------
const db = new sqlite3.Database(path.join(__dirname, 'chat-history.db'));

db.serialize(() => {
    db.run(`
        CREATE TABLE IF NOT EXISTS chats (
            id TEXT PRIMARY KEY,
            user_id TEXT DEFAULT 'anonymous',
            title TEXT,
            messages TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);
});

// -------------------- Token Handling --------------------
function estimateTokenCount(text) {
    return Math.ceil((text || "").length / 4);
}

function truncateMessages(messages, maxTokens = 6000) {
    let totalTokens = 0;
    const truncated = [];

    for (let i = messages.length - 1; i >= 0; i--) {
        const msg = messages[i];
        const tokenCount = estimateTokenCount(msg?.content || msg?.text || "");

        if (totalTokens + tokenCount > maxTokens) break;

        truncated.unshift(msg);
        totalTokens += tokenCount;
    }
    return truncated;
}

// -------------------- OpenRouter Setup --------------------
const OPENROUTER_FREE_MODELS = [
    "meta-llama/llama-3-8b-instruct",
    "mistralai/mistral-7b-instruct",
    "google/gemma-7b-it",
    "nousresearch/hermes-2-pro-mistral-7b",
    "openchat/openchat-7b",
    "cognitivecomputations/dolphin-mixtral-8x7b",
    "huggingfaceh4/zephyr-7b-beta",
    "teknium/openhermes-2.5-mistral-7b",
    "microsoft/phi-3-mini-128k-instruct",
    "qwen/qwen1.5-7b-chat"
];

async function callOpenRouterAPI(messages) {
    const model = OPENROUTER_FREE_MODELS[Math.floor(Math.random() * OPENROUTER_FREE_MODELS.length)];
    const truncatedMessages = truncateMessages(messages);

    try {
        const response = await fetchFn('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
                'HTTP-Referer': 'http://localhost:5000',
                'X-Title': 'Master Chat'
            },
            body: JSON.stringify({
                model,
                messages: truncatedMessages,
                max_tokens: 1024,
                temperature: 0.7
            })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(`Model ${model} failed: ${errorData.error?.message || response.statusText}`);
        }

        const data = await response.json();
        console.log("🔎 OpenRouter Full Response:", JSON.stringify(data, null, 2));

        return data.choices?.[0]?.message?.content || "⚠️ মডেল থেকে কোন উত্তর পাওয়া যায়নি";
    } catch (error) {
        console.error(`⚠️ OpenRouter Error (${model}):`, error.message);
        throw error;
    }
}

// -------------------- Weather API --------------------
async function getWeatherInBangladesh(city = 'Dhaka') {
    if (!process.env.WEATHER_API_KEY) {
        throw new Error("Missing WEATHER_API_KEY in .env");
    }

    const response = await fetchFn(`https://api.weatherapi.com/v1/current.json?key=${process.env.WEATHER_API_KEY}&q=${city},Bangladesh`);
    if (!response.ok) throw new Error('Weather API failed');

    const data = await response.json();
    return `📍 ${data.location.name}, ${data.location.country}\n🌡️ তাপমাত্রা: ${data.current.temp_c}°C\n☁️ ${data.current.condition.text}\n💧 আর্দ্রতা: ${data.current.humidity}%\n💨 বাতাস: ${data.current.wind_kph} km/h`;
}

function detectWeatherCommand(text) {
    const lower = (text || "").toLowerCase().trim();
    if (lower.includes('আবহাওয়া') || lower.includes('weather')) {
        let city = 'Dhaka';
        if (lower.includes('চট্টগ্রাম')) city = 'Chittagong';
        if (lower.includes('রাজশাহী')) city = 'Rajshahi';
        if (lower.includes('খুলনা')) city = 'Khulna';
        if (lower.includes('সিলেট')) city = 'Sylhet';
        return { type: 'weather', city };
    }
    return null;
}

// -------------------- Chat API Endpoint --------------------
app.post('/api/chat', async (req, res) => {
    try {
        const { messages } = req.body;
        if (!messages || messages.length === 0) {
            throw new Error('No messages provided');
        }

        const lastMessage = messages[messages.length - 1];
        const userText = lastMessage?.content || lastMessage?.text || "";

        const weatherCmd = detectWeatherCommand(userText);

        let botResponse = '';

        if (weatherCmd) {
            botResponse = await getWeatherInBangladesh(weatherCmd.city);
        } else {
            botResponse = await callOpenRouterAPI(messages);
        }

        console.log("BOT:", botResponse);

        res.json({ content: botResponse });
    } catch (error) {
        console.error('Server Error:', error);
        res.status(500).json({
            error: 'দুঃখিত, একটি ত্রুটি ঘটেছে। অনুগ্রহ করে পরে আবার চেষ্টা করুন। 🙏'
        });
    }
});

// -------------------- Serve Frontend --------------------
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// -------------------- Start Server --------------------
app.listen(PORT, () => {
    console.log(`✅ Server running on port ${PORT}`);
});
