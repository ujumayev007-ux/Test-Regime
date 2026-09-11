const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// Yangi bot tokeningiz
const BOT_TOKEN = '8533710758:AAEQ7hx3lyqiMayBC0Vt-IMJsv4hRIdFGwg';
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// Adminlarning Telegram ID raqamlari
const ADMIN_IDS = ['8511645883', '8276788287'];

let orderCounter = 1000;
const orders = {};

// Server holatini tekshirish
app.get('/', (req, res) => {
    res.send('Qallama shop serveri faol ishlamoqda!');
});

// 🔍 YANGI: Sayt orqali buyurtma holatini tekshirish API-si
app.get('/api/order/:id', (req, res) => {
    const orderId = req.params.id;
    const order = orders[orderId];

    if (order) {
        res.status(200).json({
            success: true,
            orderId: orderId,
            status: order.status || "📥 Yangi buyurtma",
            details: order.details
        });
    } else {
        res.status(404).json({ success: false, message: "Buyurtma topilmadi" });
    }
});

// Mini App / Web saytdan buyurtma qabul qilish
app.post('/api/order', async (req, res) => {
    try {
        const orderData = req.body;
        orderCounter++;
        const orderId = orderCounter;

        orders[orderId] = {
            userId: orderData.userId || null,
            status: "📥 Yangi buyurtma",
            details: orderData,
            adminMessageIds: {}
        };

        let messageText = `📥 <b>BUYURTMA #${orderId}</b>\n\n`;
        messageText += `👤 <b>Xaridor:</b> ${orderData.userName} (${orderData.userHandle ? '@' + orderData.userHandle : 'Saytdan'})\n`;
        if (orderData.phone) messageText += `📞 <b>Tel:</b> ${orderData.phone}\n`;
        messageText += `📅 <b>Sana:</b> ${orderData.date}\n`;
        messageText += `⏰ <b>Vaqt:</b> ${orderData.time}\n`;
        messageText += `📍 <b>Filial:</b> ${orderData.branch}\n\n`;
        messageText += `🫓 <b>Buyurtma tarkibi:</b>\n${orderData.items}\n`;
        messageText += `💰 <b>Jami summa:</b> ${orderData.totalPrice} so'm\n\n`;
        messageText += `🔄 <b>Holat:</b> <i>Yangi buyurtma</i>`;

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

        for (const adminId of ADMIN_IDS) {
            try {
                const sentMsg = await bot.sendMessage(adminId, messageText, {
                    parse_mode: 'HTML',
                    reply_markup: keyboard
                });
                orders[orderId].adminMessageIds[adminId] = sentMsg.message_id;
            } catch (err) {
                console.error(`Admin ${adminId} ga xabar yuborishda xatolik:`, err.message);
            }
        }

        res.status(200).json({ success: true, orderId: orderId });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Adminlardan biri tugmani bosganda ishlovchi mantiq
bot.on('callback_query', async (query) => {
    const data = query.data;
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

    // Xotiradagi statusni yangilaymiz
    order.status = statusText;

    // Adminlar chatidagi xabar tekstini yangilash
    for (const adminId of ADMIN_IDS) {
        const msgId = order.adminMessageIds[adminId];
        if (msgId) {
            try {
                const updatedText = query.message.text.replace(/🔄 Holat: .*/, `🔄 <b>Holat:</b> ${statusText}`);
                await bot.editMessageText(updatedText, {
                    chat_id: adminId,
                    message_id: msgId,
                    parse_mode: 'HTML',
                    reply_markup: query.message.reply_markup
                });
            } catch (err) {
                // Ignore edit error
            }
        }
    }

    // Agar Telegram userId bo'lsa, xaridorga botdan xabar boradi
    if (order.userId) {
        try {
            await bot.sendMessage(order.userId, customerMessage);
        } catch (err) {
            console.error("Xaridorga xabar yuborishda xatolik:", err.message);
        }
    }

    bot.answerCallbackQuery(query.id, { text: `Status saqlandi: ${statusText}` });
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Server ${PORT}-portda ishlamoqda...`));
