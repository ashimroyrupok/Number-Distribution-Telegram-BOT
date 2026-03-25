
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');

const token = '8637771357:AAERd9Bn7GRXftbqcvLH5wtFto5k2KblOfY';
const bot = new TelegramBot(token, { polling: true });

const userCooldown = new Map();
const userCountry = new Map();
const userLastMessage = new Map();

const COOLDOWN_MS = 10 * 1000;

const countries = {
    '🇧🇩': { name: 'Bangladesh', file: 'bd.txt' },
    '🇺🇸': { name: 'USA', file: 'usa.txt' },
    '🇬🇧': { name: 'UK', file: 'uk.txt' },
    '🇮🇳': { name: 'India', file: 'india.txt' },
    '🇨🇦': { name: 'Canada', file: 'canada.txt' },
    '🇩🇪': { name: 'Germany', file: 'germany.txt' }
};

// Country buttons
function getCountryKeyboard() {
    const keyboard = [];
    let row = [];

    Object.keys(countries).forEach(flag => {
        row.push({
            text: `${flag} ${countries[flag].name}`,
            callback_data: `country_${flag}`
        });

        if (row.length === 2) {
            keyboard.push(row);
            row = [];
        }
    });

    if (row.length) keyboard.push(row);

    return { inline_keyboard: keyboard };
}

// Show numbers (edit message)
async function sendNumbers(chatId, numbersToSend, remaining, flag) {
    const countryName = countries[flag].name;

    const text =
        `📱 Dust New WhatsApp\n\n` +
        `🌍 Country: ${flag} ${countryName}\n` +
        `📊 Remaining: ${remaining}\n\n` +
        `📋 Numbers:\n` +
        numbersToSend.map(n => `• ${n}`).join('\n');

    const keyboard = {
        inline_keyboard: [
            [{ text: "➡️ Next 3 Numbers", callback_data: "next_numbers" }],
            [{ text: "🌍 Change Country", callback_data: "change_country" }]
        ]
    };

    try {
        if (userLastMessage.has(chatId)) {
            const msgId = userLastMessage.get(chatId);
            await bot.editMessageText(text, {
                chat_id: chatId,
                message_id: msgId,
                reply_markup: keyboard
            });
        } else {
            const sent = await bot.sendMessage(chatId, text, {
                reply_markup: keyboard
            });
            userLastMessage.set(chatId, sent.message_id);
        }
    } catch (err) {
        const sent = await bot.sendMessage(chatId, text, {
            reply_markup: keyboard
        });
        userLastMessage.set(chatId, sent.message_id);
    }
}

// Read + remove numbers
function getNumbers(filePath) {
    if (!fs.existsSync(filePath)) return null;

    const data = fs.readFileSync(filePath, 'utf8');
    let numbers = data.split('\n').filter(n => n.trim());

    if (numbers.length < 3) return null;

    const sendList = numbers.slice(0, 3);
    const remainingList = numbers.slice(3);

    fs.writeFileSync(filePath, remainingList.join('\n'));

    return {
        sendList,
        remaining: remainingList.length
    };
}

// Callback handler
bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const data = query.data;

    try {
        await bot.answerCallbackQuery(query.id);
    } catch (e) {}

    // Select country
    if (data.startsWith('country_')) {
        const flag = data.replace('country_', '');
        userCountry.set(chatId, flag);

        const filePath = `./numbers/${countries[flag].file}`;
        const result = getNumbers(filePath);

        if (!result) {
            return bot.sendMessage(chatId, "❌ Not enough numbers!");
        }

        userCooldown.set(chatId, Date.now());
        await sendNumbers(chatId, result.sendList, result.remaining, flag);
    }

    // Next numbers
    else if (data === 'next_numbers') {
        const lastTime = userCooldown.get(chatId) || 0;

        const now = Date.now();
        const diff = now - lastTime;

        if (diff < COOLDOWN_MS) {
            const remainingMs = COOLDOWN_MS - diff;
            const remainingSec = Math.ceil(remainingMs / 1000);

            return bot.answerCallbackQuery(query.id, {
                text: `⏳ Please wait ${remainingSec} sec`,
                show_alert: true
            });
        }

        const flag = userCountry.get(chatId);
        if (!flag) {
            return bot.sendMessage(chatId, "🌍 Select country first!");
        }

        const filePath = `./numbers/${countries[flag].file}`;
        const result = getNumbers(filePath);

        if (!result) {
            return bot.sendMessage(chatId, "❌ No numbers left!");
        }

        userCooldown.set(chatId, Date.now());
        await sendNumbers(chatId, result.sendList, result.remaining, flag);
    }

    // Change country
    else if (data === 'change_country') {
        const sent = await bot.sendMessage(chatId, "🌍 Select country:", {
            reply_markup: getCountryKeyboard()
        });

        userLastMessage.set(chatId, sent.message_id);
    }
});

// Start command
bot.onText(/\/start|\/getnumber/, (msg) => {
    bot.sendMessage(msg.chat.id, "🌍 Welcome!\nSelect country:", {
        reply_markup: getCountryKeyboard()
    });
});

console.log("✅ Bot Running...");

