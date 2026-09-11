const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// Bot tokeningiz
const BOT_TOKEN = '8533710758:AAEQ7hx3lyqiMayBC0Vt-IMJsv4hRIdFGwg';
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// Adminlarning Telegram ID raqamlari
const ADMIN_IDS = ['8511645883', '8276788287'];

// Buyurtmalarni vaqtinchalik xotirada saqlash
const orders = {};

// Unikal Vaqt Stampi (Order ID) yaratish funksiyasi
function generateOrderId() {
    const now = new Date();
    const year = String(now.getFullYear()).slice(-2);
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');

    return `${year}${month}${day}-${hours}${minutes}${seconds}`;
}

// Server holatini tekshirish
app.get('/', (req, res) => {
    res.send('Qallama shop serveri faol ishlamoqda!');
});

// Buyurtma holatini tekshirish API (To'liq ID yoki oxirgi qisqa raqamlar bo'yicha)
app.get('/api/order/:id', (req, res) => {
    const inputId = req.params.id.trim();

    // Exact match yoki oxirgi raqamlar mos kelishini izlash
    const foundOrderId = Object.keys(orders).find(id => id === inputId || id.endsWith(inputId));

    if (foundOrderId) {
        const order = orders[foundOrderId];
        res.status(200).json({
            success: true,
            orderId: foundOrderId,
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
        const orderData = req.body || {};
        const orderId = generateOrderId();

        orders[orderId] = {
            userId: orderData.userId || null,
            status: "📥 Yangi buyurtma",
            details: orderData,
            adminMessageIds: {}
        };

        const name = orderData.userName || 'Mijoz';
        const handle = orderData.userHandle ? `@${orderData.userHandle}` : 'Mavjud emas';
        const phone = orderData.phone || 'Ko\'rsatilmadi';
        const pref = orderData.contactPreference || 'telegram';
        const date = orderData.date || 'Ko\'rsatilmadi';
        const time = orderData.time || 'Ko\'rsatilmadi';
        const branch = orderData.branch || 'Ko\'rsatilmadi';
        const items = orderData.items || 'Mahsulot tanlanmagan';
        const total = orderData.totalPrice || '0';

        let messageText = `📥 <b>BUYURTMA #${orderId}</b>\n\n`;
        messageText += `👤 <b>Xaridor:</b> ${name} (${handle})\n`;
        messageText += `📞 <b>Tel:</b> ${phone}\n`;
        messageText += `💬 <b>Aloqa usuli:</b> ${pref}\n`;
        messageText += `📅 <b>Sana:</b> ${date}\n`;
        messageText += `⏰ <b>Vaqt:</b> ${time}\n`;
        messageText += `📍 <b>Filial:</b> ${branch}\n\n`;
        messageText += `🫓 <b>Buyurtma tarkibi:</b>\n${items}\n`;
        messageText += `💰 <b>Jami summa:</b> ${total} so'm\n\n`;
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
                console.error(`Admin ${adminId} ga yuborishda xato:`, err.message);
            }
        }

        return res.status(200).json({ success: true, orderId: orderId });

    } catch (error) {
        console.error("SERVER XATOLIGI:", error);
        return res.status(500).json({ success: false, error: error.message });
    }
});

// Adminlar statusni o'zgartirganda
bot.on('callback_query', async (query) => {
    try {
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

        order.status = statusText;

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
                } catch (err) {}
            }
        }

        if (order.userId) {
            try {
                await bot.sendMessage(order.userId, customerMessage);
            } catch (err) {}
        }

        bot.answerCallbackQuery(query.id, { text: `Status saqlandi: ${statusText}` });
    } catch (e) {
        console.error("Callback xatosi:", e);
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Server ${PORT}-portda ishlamoqda...`));
