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
            user_id TEXT DEFAULT 'anonymous',
            title TEXT,
            messages TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);
});

// ✅ Token estimation
function estimateTokenCount(text) {
    return Math.ceil(text.length / 4);
}

// ✅ Truncate messages to fit token limit
function truncateMessages(messages, maxTokens = 6000) {
    let totalTokens = 0;
    const truncated = [];

    for (let i = messages.length - 1; i >= 0; i--) {
        const msg = messages[i];
        const tokenCount = estimateTokenCount(msg.content || msg.text);

        if (totalTokens + tokenCount > maxTokens) {
            break;
        }

        truncated.unshift(msg);
        totalTokens += tokenCount;
    }

    return truncated;
}

// ✅ OpenRouter - 56 Free Models 🎲
const OPENROUTER_FREE_MODELS = [
    "meta-llama/llama-3-70b-instruct",
    "meta-llama/llama-3-8b-instruct",
    "anthropic/claude-3-haiku",
    "anthropic/claude-3-sonnet",
    "google/gemini-pro-1.5",
    "google/gemini-flash-1.5",
    "mistralai/mixtral-8x7b-instruct",
    "mistralai/mistral-7b-instruct",
    "cohere/command-r-plus",
    "cohere/command-r",
    "openchat/openchat-7b",
    "huggingfaceh4/zephyr-7b-beta",
    "nousresearch/nous-hermes-2-mixtral-8x7b-dpo",
    "cognitivecomputations/dolphin-mixtral-8x7b",
    "teknium/openhermes-2.5-mistral-7b",
    "undi95/remm-slerp-l2-13b",
    "lizpreciatior/lzlv-70b-fp16-hf",
    "neversleep/llama-3-lumimaid-70b",
    "gryphe/mythomax-l2-13b",
    "undi95/toppy-m-7b",
    "sophosympatheia/midnight-rose-70b",
    "thebloke/neural-chat-7b-v3-1-awq",
    "qwen/qwen1.5-72b-chat",
    "qwen/qwen1.5-14b-chat",
    "deepseek/deepseek-llm-67b-chat",
    "zero-one-ai/yi-34b-chat",
    "snorkelai/snorkel-mistral-pairrm-dpo-7b",
    "mancer/weaver",
    "open-orca/mistral-7b-openorca",
    "huggingfaceh4/zephyr-7b-alpha",
    "nousresearch/hermes-2-pro-llama-3-8b",
    "sinoptik-ai/saiga-llama3-8b",
    "sao10k/l3-70b-euryale-v2.1",
    "sao10k/fimbulvetr-11b-v2",
    "neversleep/llama-3-lumimaid-8b",
    "thebloke/discoverfree-7b-v1-awq",
    "thebloke/llama-3-8b-instruct-awq",
    "thebloke/llama-3-70b-instruct-awq",
    "thebloke/mistral-7b-instruct-v0.2-awq",
    "thebloke/neural-chat-7b-v3-1-awq",
    "thebloke/openhermes-2.5-mistral-7b-awq",
    "thebloke/zephyr-7b-beta-awq",
    "thebloke/cinematika-7b-awq",
    "thebloke/deepseek-coder-6.7b-instruct-awq",
    "thebloke/mistral-7b-openorca-awq",
    "thebloke/neural-chat-7b-v3-3-awq",
    "thebloke/orca-2-13b-awq",
    "thebloke/solar-10.7b-instruct-awq",
    "thebloke/starling-lm-7b-alpha-awq",
    "thebloke/yi-34b-chat-awq",
    "thebloke/zephyr-7b-alpha-awq",
    "thebloke/discoverfree-3b-v1-awq",
    "thebloke/discoverfree-7b-v1-awq",
    "thebloke/llamaguard-7b-awq"
];

// ✅ OpenRouter API Call (Random Model)
async function callOpenRouterAPI(messages) {
    const model = OPENROUTER_FREE_MODELS[Math.floor(Math.random() * OPENROUTER_FREE_MODELS.length)];
    const truncatedMessages = truncateMessages(messages);

    try {
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
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
            const errorData = await response.json();
            throw new Error(`Model ${model} failed: ${errorData.error?.message}`);
        }

        const data = await response.json();
        console.log(`✅ ${model} responded successfully!`);
        return data.choices[0].message.content;
    } catch (error) {
        console.warn(`⚠️ ${model} failed:`, error.message);
        throw error;
    }
}

// ✅ Groq API
async function callGroqAPI(messages) {
    const truncatedMessages = truncateMessages(messages);
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.GROQ_API_KEY}`
        },
        body: JSON.stringify({
            model: 'llama3-70b-8192',
            messages: truncatedMessages,
            max_tokens: 1024,
            temperature: 0.7,
            stream: false
        })
    });

    if (!response.ok) throw new Error('Groq API failed');
    const data = await response.json();
    return data.choices[0].message.content;
}

// ✅ Perplexity API
async function callPerplexityAPI(messages) {
    const lastMessage = messages[messages.length - 1];
    const response = await fetch('https://api.perplexity.ai/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.PERPLEXITY_API_KEY}`
        },
        body: JSON.stringify({
            model: 'pplx-7b-online',
            messages: [{ role: 'user', content: lastMessage.content || lastMessage.text }],
            max_tokens: 512
        })
    });

    if (!response.ok) throw new Error('Perplexity API failed');
    const data = await response.json();
    return data.choices[0].message.content;
}

// ✅ Hugging Face API
async function callHuggingFaceAPI(messages) {
    const lastMessage = messages[messages.length - 1];
    const response = await fetch(
        `https://api-inference.huggingface.co/models/HuggingFaceH4/zephyr-7b-beta`,
        {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${process.env.HUGGINGFACE_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                inputs: lastMessage.content || lastMessage.text,
                parameters: { max_new_tokens: 512 }
            })
        }
    );

    if (!response.ok) throw new Error('Hugging Face API failed');
    const data = await response.json();
    return data[0]?.generated_text || 'No response from Hugging Face.';
}

// ✅ Master AI with fallback
async function getBotResponseWithFallback(messages) {
    const apis = [
        { name: 'Groq', fn: callGroqAPI },
        { name: 'OpenRouter', fn: callOpenRouterAPI },
        { name: 'Perplexity', fn: callPerplexityAPI },
        { name: 'HuggingFace', fn: callHuggingFaceAPI }
    ];

    for (let api of apis) {
        try {
            console.log(`Trying ${api.name}...`);
            const response = await api.fn(messages);
            if (response && response.trim() !== '') {
                console.log(`${api.name} succeeded!`);
                return response;
            }
        } catch (error) {
            console.warn(`${api.name} failed:`, error.message);
            continue;
        }
    }

    throw new Error('All APIs failed. Please try again later.');
}

// ✅ Special APIs

// 🌦️ Weather API
async function getWeatherInBangladesh(city = 'Dhaka') {
    const response = await fetch(`https://api.weatherapi.com/v1/current.json?key=${process.env.WEATHER_API_KEY}&q=${city},Bangladesh`);
    if (!response.ok) throw new Error('Weather API failed');
    const data = await response.json();
    return `📍 ${data.location.name}, ${data.location.country}\n🌡️ তাপমাত্রা: ${data.current.temp_c}°C\n☁️ ${data.current.condition.text}\n💧 আর্দ্রতা: ${data.current.humidity}%\n💨 বাতাস: ${data.current.wind_kph} km/h`;
}

// 📰 News API
async function getLatestNewsBangladesh() {
    const response = await fetch(`https://newsapi.org/v2/top-headlines?country=bd&apiKey=${process.env.NEWS_API_KEY}`);
    if (!response.ok) throw new Error('News API failed');
    const data = await response.json();
    const articles = data.articles.slice(0, 3);
    return articles.map((a, i) => `${i+1}. 📰 [${a.title}](${a.url})\n   _${a.source.name}_`).join('\n\n');
}

// 📚 Open Library API
async function searchBooks(query) {
    const response = await fetch(`https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&limit=3`);
    if (!response.ok) throw new Error('Open Library API failed');
    const data = await response.json();
    if (data.docs.length === 0) return 'কোনো বই পাওয়া যায়নি।';
    return data.docs.slice(0,3).map((book, i) => {
        const title = book.title;
        const author = book.author_name?.[0] || 'অজানা';
        const year = book.first_publish_year || 'অজানা';
        return `${i+1}. 📖 **${title}**\n   লেখক: ${author}\n   প্রকাশ: ${year}`;
    }).join('\n\n');
}

// 🔍 SerpAPI (Google Search)
async function googleSearch(query) {
    const response = await fetch(`https://serpapi.com/search.json?engine=google&q=${encodeURIComponent(query)}&api_key=${process.env.SERP_API_KEY}`);
    if (!response.ok) throw new Error('SerpAPI failed');
    const data = await response.json();
    if (!data.organic_results || data.organic_results.length === 0) return 'কোনো ফলাফল পাওয়া যায়নি।';
    const results = data.organic_results.slice(0, 3);
    return results.map((r, i) => `${i+1}. 🔗 [${r.title}](${r.link})\n   ${r.snippet}`).join('\n\n');
}

// ✅ Detect special commands
function detectSpecialCommand(text) {
    const lower = text.toLowerCase().trim();
    
    if (lower.includes('আবহাওয়া') || lower.includes('weather')) {
        let city = 'Dhaka';
        if (lower.includes('চট্টগ্রাম')) city = 'Chittagong';
        if (lower.includes('রাজশাহী')) city = 'Rajshahi';
        if (lower.includes('খুলনা')) city = 'Khulna';
        if (lower.includes('সিলেট')) city = 'Sylhet';
        return { type: 'weather', city };
    }
    
    if (lower.includes('খবর') || lower.includes('news') || lower.includes('headlines')) {
        return { type: 'news' };
    }
    
    if (lower.startsWith('বই') || lower.startsWith('book') || lower.includes('পড়তে চাই')) {
        const query = text.replace(/(বই|book|পড়তে চাই|read)/gi, '').trim();
        return { type: 'book', query };
    }
    
    if (lower.startsWith('গুগল') || lower.startsWith('google') || lower.includes('search for')) {
        const query = text.replace(/(গুগল|google|search for)/gi, '').trim();
        return { type: 'google', query };
    }
    
    return null;
}

// ✅ Main /api/chat endpoint
app.post('/api/chat', async (req, res) => {
    try {
        const { messages } = req.body;
        if (!messages || messages.length === 0) {
            throw new Error('No messages provided');
        }

        const lastMessage = messages[messages.length - 1];
        const userText = lastMessage.content || lastMessage.text;

        // Check for special command
        const command = detectSpecialCommand(userText);

        let botResponse = '';

        if (command) {
            switch (command.type) {
                case 'weather':
                    botResponse = await getWeatherInBangladesh(command.city);
                    break;
                case 'news':
                    botResponse = await getLatestNewsBangladesh();
                    break;
                case 'book':
                    botResponse = await searchBooks(command.query);
                    break;
                case 'google':
                    botResponse = await googleSearch(command.query);
                    break;
            }
        } else {
            // Use AI APIs
            botResponse = await getBotResponseWithFallback(messages);
        }

        res.json({ content: botResponse });
    } catch (error) {
        console.error('Server Error:', error);
        res.status(500).json({
            error: 'দুঃখিত, একটি ত্রুটি ঘটেছে। অনুগ্রহ করে পরে আবার চেষ্টা করুন। 🙏'
        });
    }
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

// Serve frontend
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
    console.log(`✅ Server running on port ${PORT}`);
});
