const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ----------------------------------------------------
// ระบบคลังรหัสสุ่มมั่ว 100 ใบ (Random Unique 6-Digit Codes)
// ----------------------------------------------------
let passcodeDatabase = [];

// ฟังก์ชันสร้างรหัสสุ่มมั่ว 6 หลัก แบบไม่ซ้ำกัน 100 ใบ
function generateRandomPasscodes() {
    passcodeDatabase = [];
    const generatedCodes = new Set();

    while (generatedCodes.size < 100) {
        // สุ่มตัวเลขตั้งแต่ 100000 ถึง 999999
        const randomCode = Math.floor(100000 + Math.random() * 900000).toString();
        generatedCodes.add(randomCode);
    }

    // แปลงข้อมูลใส่ใน Database พร้อมสถานะยังไม่ได้ใช้งาน
    generatedCodes.forEach(code => {
        passcodeDatabase.push({ code: code, isUsed: false });
    });

    console.log(`[Database] Successfully generated ${passcodeDatabase.length} unique random passcodes.`);
}

// สร้างรหัสสุ่ม 100 ใบเมื่อเริ่มเปิดเซิร์ฟเวอร์
generateRandomPasscodes();

// ----------------------------------------------------
// Endpoints & API
// ----------------------------------------------------

// 1. Health Check
app.get('/', (req, res) => {
    res.send('Kiosk Random Passcode Backend is Running!');
});

// 2. API สำหรับตู้ Kiosk ยิงมาตรวจรหัส 6 หลัก
app.post('/api/verify-code', (req, res) => {
    const { code } = req.body;

    if (!code) {
        return res.status(400).json({ success: false, message: 'กรุณาระบุรหัสผ่าน' });
    }

    // ค้นหารหัสในระบบ
    const foundItem = passcodeDatabase.find(item => item.code === code.trim());

    if (!foundItem) {
        return res.json({ success: false, message: 'รหัสผ่านไม่ถูกต้อง' });
    }

    if (foundItem.isUsed) {
        return res.json({ success: false, message: 'รหัสผ่านนี้ถูกใช้งานไปแล้ว' });
    }

    // ถ้ารหัสถูกต้องและยังไม่ถูกใช้ -> เปลี่ยนสถานะเป็นใช้แล้ว
    foundItem.isUsed = true;
    console.log(`[Passcode Used] Code ${code} successfully unlocked kiosk.`);

    // ส่งสัญญาณ WebSocket ปลดล็อกไปยัง C# WPF
    io.emit('PAYMENT_SUCCESS', { status: 'success', codeUsed: code });

    return res.json({ success: true, message: 'ปลดล็อกสำเร็จ' });
});

// 3. API สำหรับดูรายการรหัสทั้งหมดพร้อมสถานะ (สำหรับให้แคชเชียร์ปริ้นท์ออกขาย)
app.get('/api/admin/codes', (req, res) => {
    res.json(passcodeDatabase);
});

// 4. API สำหรับสุ่มสร้างรหัสชุดใหม่ 100 ใบ (Reset ทั้งระบบ)
app.get('/api/admin/reset', (req, res) => {
    generateRandomPasscodes();
    res.json({
        message: 'Reset and generated 100 new random passcodes successfully!',
        sampleCodes: passcodeDatabase.slice(0, 5) // แสดงตัวอย่าง 5 รหัสแรก
    });
});

// WebSocket Connection
io.on('connection', (socket) => {
    console.log(`[Socket.IO] Kiosk Connected: ${socket.id}`);
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});
