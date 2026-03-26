const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const https = require('https');

const token = '8637771357:AAFl9jNirQydnPDFry-AzaBIADP1FqSjIE8';   // ← তোমার নতুন Token
const bot = new TelegramBot(token, { polling: true });

// 🔐 ADMIN
const ADMIN_ID = 5474672519;

const userCooldown = new Map();
const userCountry = new Map();
const userLastMessage = new Map();
const adminState = new Map();

const COOLDOWN_MS = 10 * 1000;

// Countries (Admin নতুন যোগ করতে পারবে)
let countries = {
    '🇧🇩': { name: 'Bangladesh', file: 'bd.txt' },
    '🇺🇸': { name: 'USA', file: 'usa.txt' },
    '🇬🇧': { name: 'UK', file: 'uk.txt' },
    '🇮🇳': { name: 'India', file: 'india.txt' },
    '🇨🇦': { name: 'Canada', file: 'canada.txt' },
    '🇩🇪': { name: 'Germany', file: 'germany.txt' },
    '🇦🇫': { name: 'Afghanistan', file: 'af.txt' }
};

function isAdmin(id) {
    return id === ADMIN_ID;
}

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

// ==================== Dynamo OTP UI ====================
async function sendNumbers(chatId, numbersToSend, remaining, flag) {
    const countryName = countries[flag].name;

    let text = `🔥 *Dynamo OTP New Number*\n\n`;
    text += `🌍 Country: ${flag} ${countryName}\n`;
    text += `📊 Remaining: ${remaining}\n\n`;
    text += `📋 Numbers:\n\n`;

    numbersToSend.forEach(num => {
        text += `📋 ${flag} ${num.trim()}\n\n`;
    });

    const keyboard = {
        inline_keyboard: [
            [{ text: "➡️ Next 3 Numbers", callback_data: "next_numbers" }],
            [{ text: "🌍 Change Country", callback_data: "change_country" }],
            [{ text: "👥 OTP Group", url: "https://t.me/dynamo_otp_group" }]
        ]
    };

    try {
        if (userLastMessage.has(chatId)) {
            await bot.editMessageText(text, {
                chat_id: chatId,
                message_id: userLastMessage.get(chatId),
                reply_markup: keyboard
            });
        } else {
            const sent = await bot.sendMessage(chatId, text, { reply_markup: keyboard });
            userLastMessage.set(chatId, sent.message_id);
        }
    } catch (e) {
        const sent = await bot.sendMessage(chatId, text, { reply_markup: keyboard });
        userLastMessage.set(chatId, sent.message_id);
    }
}

// Get numbers
function getNumbers(filePath) {
    if (!fs.existsSync(filePath)) return null;

    const data = fs.readFileSync(filePath, 'utf8');
    let numbers = data.split('\n').filter(n => n.trim() !== '');

    if (numbers.length < 3) return null;

    const sendList = numbers.slice(0, 3);
    const remainingList = numbers.slice(3);

    fs.writeFileSync(filePath, remainingList.join('\n'));

    return { sendList, remaining: remainingList.length };
}

// ===================== CALLBACK =====================
bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const data = query.data;

    try { await bot.answerCallbackQuery(query.id); } catch {}

    // ADMIN PANEL
    if (data === "admin_panel" || data === "/admin") {
        if (!isAdmin(query.from.id)) return;
        return bot.sendMessage(chatId, "⚙️ Admin Panel", {
            reply_markup: {
                inline_keyboard: [
                    [{ text: "📤 Upload File", callback_data: "admin_upload" }],
                    [{ text: "🗑 Delete Country", callback_data: "admin_delete" }],
                    [{ text: "📂 Country List", callback_data: "admin_list" }],
                    [{ text: "➕ Add New Country", callback_data: "admin_add_country" }]
                ]
            }
        });
    }

    // ➕ ADD NEW COUNTRY
    if (data === "admin_add_country") {
        if (!isAdmin(query.from.id)) return;
        adminState.set(chatId, { step: "add_country_flag" });
        return bot.sendMessage(chatId, "➕ Add New Country\n\nSend Country Flag (যেমন: 🇧🇷)");
    }

    // ADMIN BUTTONS
    if (data === "admin_upload") {
        if (!isAdmin(query.from.id)) return;
        adminState.set(chatId, { step: "upload" });
        return bot.sendMessage(chatId, "📤 Send .txt file");
    }

    if (data === "admin_delete") {
        if (!isAdmin(query.from.id)) return;
        adminState.set(chatId, { step: "delete" });
        return bot.sendMessage(chatId, "🗑 Send file name (যেমন: bd.txt)");
    }

    if (data === "admin_list") {
        if (!isAdmin(query.from.id)) return;
        if (!fs.existsSync("./numbers")) return bot.sendMessage(chatId, "No folder");
        const files = fs.readdirSync("./numbers");
        return bot.sendMessage(chatId, "📂 Countries:\n\n" + files.join("\n"));
    }

    // COUNTRY SELECT
    if (data.startsWith('country_')) {
        const flag = data.replace('country_', '');
        userCountry.set(chatId, flag);

        const filePath = `./numbers/${countries[flag].file}`;
        const result = getNumbers(filePath);

        if (!result) return bot.sendMessage(chatId, "❌ Not enough numbers!");

        userCooldown.set(chatId, Date.now());
        userLastMessage.delete(chatId);
        await sendNumbers(chatId, result.sendList, result.remaining, flag);
    }

    // NEXT
    else if (data === 'next_numbers') {
        const lastTime = userCooldown.get(chatId) || 0;
        if (Date.now() - lastTime < COOLDOWN_MS) {
            const sec = Math.ceil((COOLDOWN_MS - (Date.now() - lastTime)) / 1000);
            return bot.answerCallbackQuery(query.id, { text: `⏳ Wait ${sec} sec`, show_alert: true });
        }

        const flag = userCountry.get(chatId);
        if (!flag) return bot.sendMessage(chatId, "Select country first");

        const filePath = `./numbers/${countries[flag].file}`;
        const result = getNumbers(filePath);

        if (!result) return bot.sendMessage(chatId, "❌ No numbers left!");

        userCooldown.set(chatId, Date.now());
        await sendNumbers(chatId, result.sendList, result.remaining, flag);
    }

    // CHANGE COUNTRY
    else if (data === 'change_country') {
        userLastMessage.delete(chatId);
        bot.sendMessage(chatId, "🌍 Select country:", {
            reply_markup: getCountryKeyboard()
        });
    }
});

// ===================== ADMIN MESSAGE HANDLER (Add New Country) =====================
bot.on("message", async (msg) => {
    const chatId = msg.chat.id;
    if (!isAdmin(msg.from.id)) return;
    if (!adminState.has(chatId)) return;

    const state = adminState.get(chatId);
    const text = msg.text;

    // Step 1: Flag
    if (state.step === "add_country_flag") {
        adminState.set(chatId, { step: "add_country_name", flag: text });
        return bot.sendMessage(chatId, `Flag Received: ${text}\n\nNow send Country Full Name (Example: Brazil)`);
    }

    // Step 2: Country Name
    if (state.step === "add_country_name") {
        adminState.set(chatId, { step: "add_country_file", flag: state.flag, name: text });
        return bot.sendMessage(chatId, `Country Name: ${text}\n\nNow send File Name (Example: brazil.txt)`);
    }

    // Step 3: File Name + Save
    if (state.step === "add_country_file") {
        const newFlag = state.flag;
        const newName = state.name;
        const newFile = text.endsWith('.txt') ? text : text + '.txt';

        countries[newFlag] = { name: newName, file: newFile };

        bot.sendMessage(chatId, `✅ New Country Added Successfully!\n\nFlag: ${newFlag}\nName: ${newName}\nFile: ${newFile}\n\nNow upload numbers in ${newFile}`);

        adminState.delete(chatId);
    }

    // UPLOAD
    if (state.step === "upload" && msg.document) {
        const fileId = msg.document.file_id;
        const fileName = msg.document.file_name;

        if (!fileName.endsWith(".txt")) {
            return bot.sendMessage(chatId, "Only .txt files allowed");
        }

        const link = await bot.getFileLink(fileId);
        if (!fs.existsSync("./numbers")) fs.mkdirSync("./numbers");

        const file = fs.createWriteStream(`./numbers/${fileName}`);

        https.get(link, (res) => {
            res.pipe(file);
            file.on("finish", () => {
                bot.sendMessage(chatId, `✅ File ${fileName} Uploaded Successfully!`);
            });
        });

        adminState.delete(chatId);
    }

    // DELETE
    if (state.step === "delete") {
        const file = `./numbers/${text}`;
        if (fs.existsSync(file)) {
            fs.unlinkSync(file);
            bot.sendMessage(chatId, "✅ Deleted");
        } else {
            bot.sendMessage(chatId, "❌ File not found");
        }
        adminState.delete(chatId);
    }
});

// ===================== ADMIN COMMAND =====================
bot.onText(/\/admin/, (msg) => {
    if (!isAdmin(msg.from.id)) return;

    bot.sendMessage(msg.chat.id, "⚙️ Admin Panel", {
        reply_markup: {
            inline_keyboard: [
                [{ text: "📤 Upload File", callback_data: "admin_upload" }],
                [{ text: "🗑 Delete Country", callback_data: "admin_delete" }],
                [{ text: "📂 Country List", callback_data: "admin_list" }],
                [{ text: "➕ Add New Country", callback_data: "admin_add_country" }]
            ]
        }
    });
});

// START
bot.onText(/\/start|\/getnumber/, (msg) => {
    bot.sendMessage(msg.chat.id, "🌍 Welcome to Dynamo OTP!\nPlease select your country:", {
        reply_markup: getCountryKeyboard()
    });
});

console.log("✅ Dynamo OTP Bot Running with Add New Country Feature!");
