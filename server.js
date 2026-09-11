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

// Buyurtmalarni xotirada saqlash
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

// Buyurtma holatini tekshirish API
app.get('/api/order/:id', (req, res) => {
    const inputId = req.params.id.trim();
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

        // 1. ADMINLAR UCHUN XABAR MATNI VA TUGMALAR
        let adminMessageText = `📥 <b>YANGI BUYURTMA #${orderId}</b>\n\n`;
        adminMessageText += `👤 <b>Xaridor:</b> ${name} (${handle})\n`;
        adminMessageText += `📞 <b>Tel:</b> ${phone}\n`;
        adminMessageText += `💬 <b>Aloqa usuli:</b> ${pref}\n`;
        adminMessageText += `📅 <b>Sana:</b> ${date}\n`;
        adminMessageText += `⏰ <b>Vaqt:</b> ${time}\n`;
        adminMessageText += `📍 <b>Filial:</b> ${branch}\n\n`;
        adminMessageText += `🫓 <b>Buyurtma tarkibi:</b>\n${items}\n`;
        adminMessageText += `💰 <b>Jami summa:</b> ${total} so'm\n\n`;
        adminMessageText += `🔄 <b>Holat:</b> <i>Yangi buyurtma</i>`;

        const adminKeyboard = {
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
                    { text: "🏁 Buyurtma yakunlandi", callback_data: `status_completed_${orderId}` }
                ],
                [
                    { text: "❌ bekor qilish", callback_data: `status_cancel_${orderId}` }
                ]
            ]
        };

        // Adminlarga yuborish
        for (const adminId of ADMIN_IDS) {
            try {
                const sentMsg = await bot.sendMessage(adminId, adminMessageText, {
                    parse_mode: 'HTML',
                    reply_markup: adminKeyboard
                });
                orders[orderId].adminMessageIds[adminId] = sentMsg.message_id;
            } catch (err) {
                console.error(`Admin ${adminId} ga yuborishda xato:`, err.message);
            }
        }

        // 2. XARIDORGA TASDIQ XABARI
        if (orderData.userId) {
            let customerMsg = `✅ <b>Buyurtmangiz muvaffaqiyatli qabul qilindi!</b>\n\n`;
            customerMsg += `🆔 <b>Buyurtma raqamingiz:</b> #${orderId}\n`;
            customerMsg += `📍 <b>Filial:</b> ${branch}\n`;
            customerMsg += `📅 <b>Sana va vaqt:</b> ${date} soat ${time} da\n`;
            customerMsg += `💰 <b>Jami summa:</b> ${total} so'm\n\n`;
            customerMsg += `🫓 <b>Tarkibi:</b>\n${items}\n\n`;
            customerMsg += `🔄 <b>Joriy holat:</b> 📥 Yangi buyurtma`;

            const customerKeyboard = {
                inline_keyboard: [
                    [
                        { text: "📜 Buyurtmalarim tarixi", callback_data: "user_order_history" }
                    ]
                ]
            };

            try {
                await bot.sendMessage(orderData.userId, customerMsg, {
                    parse_mode: 'HTML',
                    reply_markup: customerKeyboard
                });
            } catch (userErr) {
                console.error("Xaridorga Telegram xabar yuborishda xato:", userErr.message);
            }
        }

        return res.status(200).json({ success: true, orderId: orderId });

    } catch (error) {
        console.error("SERVER XATOLIGI:", error);
        return res.status(500).json({ success: false, error: error.message });
    }
});

// Telegram Bot Callback va buyruqlarni boshqarish
bot.on('callback_query', async (query) => {
    try {
        const data = query.data;
        const userId = query.from.id;

        // --- XARIDOR BUYURTMALAR TARIXINI BOSGANDA ---
        if (data === "user_order_history") {
            const userOrders = Object.entries(orders).filter(([id, o]) => String(o.userId) === String(userId));

            if (userOrders.length === 0) {
                bot.answerCallbackQuery(query.id, { text: "Sizda hali buyurtmalar mavjud emas.", show_alert: true });
                return;
            }

            let historyMsg = `📜 <b>SIZNING BUYURTMALAR TARIXINGIZ:</b>\n\n`;
            userOrders.reverse().slice(0, 10).forEach(([id, o], index) => {
                const shortId = id.slice(-6);
                const dt = o.details;
                const itemsText = dt.items ? dt.items : "Ko'rsatilmadi";

                historyMsg += `${index + 1}. <b>#${shortId}</b> (${dt.date || ''})\n`;
                historyMsg += `   📍 <b>Filial:</b> ${dt.branch || 'Ko\'rsatilmadi'}\n`;
                historyMsg += `   🫓 <b>Tarkibi:</b> ${itemsText}\n`;
                historyMsg += `   💰 <b>Summa:</b> ${dt.totalPrice || '0'} so'm\n`;
                historyMsg += `   🔄 <b>Holat:</b> ${o.status}\n`;
                historyMsg += `-----------------------------\n`;
            });

            await bot.sendMessage(userId, historyMsg, {
                parse_mode: 'HTML',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: "🔄 Yangilash", callback_data: "user_order_history" }]
                    ]
                }
            });

            bot.answerCallbackQuery(query.id);
            return;
        }

        // --- ADMINLAR STATUSNI O'ZGARTIRGANDA ---
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
                customerMessage = `🟢 Sizning <b>#${orderId}</b>-sonli buyurtmangiz qabul qilindi.`;
                break;
            case 'cooking':
                statusText = "👨‍🍳 tayyorlanmoqda";
                customerMessage = `👨‍🍳🫓 Sizning <b>#${orderId}</b>-sonli buyurtmangiz tayyorlanmoqda.`;
                break;
            case 'ready':
                statusText = "✅ tayyor (olib ketishingiz mumkin)";
                customerMessage = `🫓✨ Sizning <b>#${orderId}</b>-sonli buyurtmangiz tayyor bo'ldi! Uni filialdan olib ketishingiz mumkin.`;
                break;
            case 'courier':
                statusText = "🚚 kuryerga berildi";
                customerMessage = `🚚 Sizning <b>#${orderId}</b>-sonli buyurtmangiz kuryerga topshirildi.`;
                break;
            case 'completed':
                statusText = "✅ Yakunlandi";
                customerMessage = `🎉 Sizning <b>#${orderId}</b>-sonli buyurtmangiz muvaffaqiyatli yakunlandi. Xaridingiz uchun rahmat!`;
                break;
            case 'cancel':
                statusText = "❌ bekor qilindi";
                customerMessage = `❌ Afsuski, sizning <b>#${orderId}</b>-sonli buyurtmangiz bekor qilindi.`;
                break;
        }

        order.status = statusText;

        // Admin xabaridagi statusni yangilash
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

        // Xaridorga status o'zgargani haqida yangilangan xabar yuborish
        if (order.userId) {
            try {
                await bot.sendMessage(order.userId, customerMessage, {
                    parse_mode: 'HTML',
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: "📜 Buyurtmalarim tarixi", callback_data: "user_order_history" }]
                        ]
                    }
                });
            } catch (err) {}
        }

        bot.answerCallbackQuery(query.id, { text: `Status saqlandi: ${statusText}` });
    } catch (e) {
        console.error("Callback xatosi:", e);
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Server ${PORT}-portda ishlamoqda...`));
