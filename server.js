const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// 1. Telegram Bot Tokeningiz
const BOT_TOKEN = '8533710758:AAH6yGGAEYEzhLMPUpBO4wtVWscEBiR7Mus';
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// 2. Buyurtmalar tushadigan Telegram Guruh ID si
// (Guruh ID si -100 bilan boshlanadi)
const ADMIN_GROUP_ID = '-100XXXXXXX'; // Guruh ID sini yozasiz

let orderCounter = 1000;
const orders = {};

app.post('/api/order', async (req, res) => {
    try {
        const orderData = req.body;
        orderCounter++;
        const orderId = orderCounter;

        orders[orderId] = {
            userId: orderData.userId,
            details: orderData
        };

        let messageText = `📥 <b>BUYURTMA #${orderId}</b>\n\n`;
        messageText += `👤 <b>Xaridor:</b> ${orderData.userName} (@${orderData.userHandle || 'yoq'})\n`;
        if (orderData.phone) messageText += `📞 <b>Tel:</b> ${orderData.phone}\n`;
        messageText += `📅 <b>Sana:</b> ${orderData.date}\n`;
        messageText += `⏰ <b>Vaqt:</b> ${orderData.time}\n`;
        messageText += `📍 <b>Filial:</b> ${orderData.branch}\n\n`;
        messageText += `🫓 <b>Buyurtma tarkibi:</b>\n${orderData.items}\n`;
        messageText += `💰 <b>Jami summa:</b> ${orderData.totalPrice} so'm\n\n`;
        messageText += `🔄 <b>Holat:</b> <i>Yangi buyurtma</i>`;

        // Siz so'ragan 5 xil tugma:
        const keyboard = {
            inline_keyboard: [
                [
                    { text: "📥 qabul qilindi", callback_data: `status_accepted_${orderId}` },
                    { text: "👨‍🍳 tayyorlanmoqda", callback_data: `status_cooking_${orderId}` }
                ],
                [
                    { text: "✅ tayyor (olib ketishingiz mumkin)", callback_data: `status_ready_${orderId}` }
                ],
                [
                    { text: "🚚 kuryerga berildi", callback_data: `status_courier_${orderId}` },
                    { text: "❌ bekor qilish", callback_data: `status_cancel_${orderId}` }
                ]
            ]
        };

        await bot.sendMessage(ADMIN_GROUP_ID, messageText, {
            parse_mode: 'HTML',
            reply_markup: keyboard
        });

        res.status(200).json({ success: true, orderId: orderId });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Guruhda tugma bosilganda mijozga avtomatik javob ketishi
bot.on('callback_query', async (query) => {
    const data = query.data;
    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;

    const parts = data.split('_');
    const action = parts[1];
    const orderId = parts[2];

    const order = orders[orderId];
    if (!order) {
        bot.answerCallbackQuery(query.id, { text: "Buyurtma topilmadi!", show_alert: true });
        return;
    }

    let statusText = "";
    let customerMessage = "";

    switch (action) {
        case 'accepted':
            statusText = "📥 qabul qilindi";
            customerMessage = `Sizning #${orderId}-sonli buyurtmangiz qabul qilindi. 🟢`;
            break;
        case 'cooking':
            statusText = "👨‍🍳 tayyorlanmoqda";
            customerMessage = `Sizning #${orderId}-sonli buyurtmangiz tayyorlanmoqda. 👨‍🍳🫓`;
            break;
        case 'ready':
            statusText = "✅ tayyor (olib ketishingiz mumkin)";
            customerMessage = `Sizning #${orderId}-sonli buyurtmangiz tayyor bo'ldi! Uni filialdan olib ketishingiz mumkin. 🫓✨`;
            break;
        case 'courier':
            statusText = "🚚 kuryerga berildi";
            customerMessage = `Sizning #${orderId}-sonli buyurtmangiz kuryerga topshirildi. 🚚`;
            break;
        case 'cancel':
            statusText = "❌ bekor qilindi";
            customerMessage = `Afsuski, sizning #${orderId}-sonli buyurtmangiz bekor qilindi. ❌`;
            break;
    }

    const updatedText = query.message.text.replace(/🔄 Holat: .*/, `🔄 <b>Holat:</b> ${statusText}`);

    try {
        await bot.editMessageText(updatedText, {
            chat_id: chatId,
            message_id: messageId,
            parse_mode: 'HTML',
            reply_markup: query.message.reply_markup
        });

        // Xaridorga avtomatik xabar boradi
        await bot.sendMessage(order.userId, customerMessage);
        bot.answerCallbackQuery(query.id, { text: `Status o'zgartirildi: ${statusText}` });
    } catch (err) {
        console.error(err);
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server ishladi!`));
