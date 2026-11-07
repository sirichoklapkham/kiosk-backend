const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);

// กำหนด CORS ให้ C# WPF และไคลเอนต์อื่นๆ เชื่อมต่อ Socket.IO ได้
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Middleware สำหรับแกะข้อมูล JSON และ URL-encoded จาก Webhook
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// เก็บ Socket Instance ของตู้ Kiosk
let kioskSocket = null;

// 1. ระบบจัดการ WebSocket Connection
io.on('connection', (socket) => {
    console.log(`[Socket.IO] Client connected: ${socket.id}`);
    kioskSocket = socket;

    socket.on('disconnect', () => {
        console.log(`[Socket.IO] Client disconnected: ${socket.id}`);
        if (kioskSocket && kioskSocket.id === socket.id) {
            kioskSocket = null;
        }
    });
});

// 2. Health Check Endpoint (สำหรับเช็กสถานะเซิร์ฟเวอร์บน Render.com)
app.get('/', (req, res) => {
    res.send('Kiosk Backend Server is running online!');
});

// 3. Webhook Endpoint รับแจ้งเตือนการชำระเงินจาก ChillPay
app.post('/api/webhook/chillpay', (req, res) => {
    try {
        console.log('=== Received ChillPay Webhook ===');
        console.log(JSON.stringify(req.body, null, 2));

        // ChillPay จะส่ง PaymentStatus หรือ Code หรือ Status กลับมา
        // Status: 0 หรือ PaymentStatus: 0 / 1 หมายถึง ชำระเงินสำเร็จ
        const paymentStatus = req.body.PaymentStatus !== undefined ? req.body.PaymentStatus : req.body.Code;
        const status = req.body.Status;

        if (paymentStatus == 0 || paymentStatus == 1 || status == 0) {
            console.log('✅ Payment Confirmed! Emitting PAYMENT_SUCCESS to Kiosk...');

            // ส่งสัญญาณ PAYMENT_SUCCESS ผ่าน Socket.IO ไปยังตู้ WPF
            io.emit('PAYMENT_SUCCESS', {
                status: 'success',
                orderNo: req.body.OrderNo || req.body.orderNo || 'N/A',
                amount: req.body.Amount || req.body.amount || 0,
                transactionTime: new Date().toISOString()
            });

            // ตอบกลับ 200 OK ให้ ChillPay รับทราบ
            return res.status(200).send('OK');
        } else {
            console.log('❌ Payment Status not successful:', paymentStatus);
            return res.status(400).send('Payment Incomplete');
        }
    } catch (err) {
        console.error('💥 Webhook Processing Error:', err.message);
        return res.status(500).send('Server Internal Error');
    }
});

// 4. Test Endpoint สำหรับกดทดสอบยิงปลดล็อกตู้ผ่าน Browser
app.get('/api/test-unlock', (req, res) => {
    console.log('🧪 Manual Test Unlock triggered via Browser');
    io.emit('PAYMENT_SUCCESS', {
        status: 'success',
        orderNo: 'MANUAL_TEST',
        amount: 1.00
    });
    res.send('Sent PAYMENT_SUCCESS signal to Kiosk!');
});

// เริ่มต้นรัน HTTP Server บน Port ที่ Render กำหนด (default: 10000)
const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});
