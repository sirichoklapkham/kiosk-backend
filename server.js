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

// 3. API สำหรับดูรายการรหัสทั้งหมดพร้อมสถานะ (สำหรับแคชเชียร์/ดึงข้อมูล)
app.get('/api/admin/codes', (req, res) => {
    res.json(passcodeDatabase);
});

// 4. API สำหรับสุ่มสร้างรหัสชุดใหม่ 100 ใบ (Reset ทั้งระบบ)
app.get('/api/admin/reset', (req, res) => {
    generateRandomPasscodes();
    res.json({
        message: 'Reset and generated 100 new random passcodes successfully!',
        sampleCodes: passcodeDatabase.slice(0, 5)
    });
});

// 5. หน้า Dashboard พิมพ์คูปองสลิป 80mm สำหรับแคชเชียร์
app.get('/admin', (req, res) => {
    res.send(`
    <!DOCTYPE html>
    <html lang="th">
    <head>
        <meta charset="UTF-8">
        <title>ระบบพิมพ์คูปอง Photo Booth (80mm)</title>
        <style>
            body { font-family: 'Courier New', monospace; padding: 20px; background: #f4f4f9; }
            .no-print { margin-bottom: 20px; }
            button { padding: 10px 20px; font-size: 16px; cursor: pointer; background: #4CAF50; color: white; border: none; border-radius: 5px; margin-right: 10px; }
            .ticket {
                width: 72mm;
                padding: 10px;
                margin: 10px 0;
                background: #fff;
                border: 1px dashed #ccc;
                text-align: center;
                box-sizing: border-box;
                page-break-after: always;
            }
            .title { font-size: 18px; font-weight: bold; margin-bottom: 5px; }
            .subtitle { font-size: 12px; margin-bottom: 15px; }
            .code-box { 
                font-size: 28px; 
                font-weight: bold; 
                letter-spacing: 4px; 
                border: 2px solid #000; 
                padding: 10px; 
                margin: 10px 0; 
                display: inline-block;
            }
            .footer { font-size: 11px; margin-top: 10px; }

            @media print {
                .no-print { display: none; }
                body { padding: 0; background: #fff; }
                .ticket { border: none; margin: 0; width: 100%; }
            }
        </style>
    </head>
    <body>
        <div class="no-print">
            <h2>คลังคูปอง Photo Booth (80mm Thermal Print)</h2>
            <button onclick="window.print()">🖨️ สั่งพิมพ์สลิปคูปองทั้งหมด</button>
            <button onclick="location.reload()" style="background:#2196F3;">🔄 รีเฟรชรายการ</button>
        </div>

        <div id="tickets-container">กำลังโหลดรหัส...</div>

        <script>
            fetch('/api/admin/codes')
                .then(res => res.json())
                .then(data => {
                    const container = document.getElementById('tickets-container');
                    container.innerHTML = '';
                    
                    data.forEach((item, index) => {
                        const ticketHtml = \`
                            <div class="ticket">
                                <div class="title">PHOTO BOOTH</div>
                                <div class="subtitle">คูปองเข้าใช้งานถ่ายภาพ</div>
                                <div>----------------------------------</div>
                                <div>รหัสผ่านสำหรับเข้าตู้ (Passcode)</div>
                                <div class="code-box">\${item.code}</div>
                                <div>----------------------------------</div>
                                <div class="footer">
                                    ใบที่: \${index + 1} / 100<br>
                                    *ใช้ได้ 1 ครั้งต่อ 1 สิทธิ์การถ่ายภาพ*
                                </div>
                            </div>
                        \`;
                        container.innerHTML += ticketHtml;
                    });
                });
        </script>
    </body>
    </html>
    `);
});

// WebSocket Connection
io.on('connection', (socket) => {
    console.log(`[Socket.IO] Kiosk Connected: ${socket.id}`);
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});
