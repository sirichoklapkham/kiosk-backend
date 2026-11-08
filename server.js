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
// หน้า Dashboard ปริ้นสลิปคูปองขนาด 80mm สำหรับแคชเชียร์
app.get('/admin', (req, res) => {
    res.send(`
    <!DOCTYPE html>
    <html lang="th">
    <head>
        <meta charset="UTF-8">
        <title>ระบบพิมพ์คูปอง Photo Booth (80mm)</title>
        <style>
            /* กำหนดระยะการแสดงผลบนหน้าจอคอมพิวเตอร์ */
            body { 
                font-family: 'Tahoma', 'Courier New', monospace; 
                padding: 20px; 
                background: #eef2f5; 
                margin: 0;
            }
            .no-print { margin-bottom: 20px; text-align: center; }
            button { 
                padding: 12px 24px; 
                font-size: 16px; 
                font-weight: bold;
                cursor: pointer; 
                background: #28a745; 
                color: white; 
                border: none; 
                border-radius: 8px; 
                margin: 0 5px; 
                box-shadow: 0 2px 5px rgba(0,0,0,0.2);
            }
            button:hover { background: #218838; }

            /* โครงสร้างใบเสร็จขนาด 80mm */
            .ticket {
                width: 72mm; /* ระยะพิมพ์จริงของกระดาษ 80mm */
                padding: 12px 5px;
                margin: 15px auto;
                background: #ffffff;
                border: 1px dashed #b5b5b5;
                text-align: center;
                box-sizing: border-box;
                color: #000000;
            }

            .header-title { font-size: 20px; font-weight: bold; letter-spacing: 1px; margin-bottom: 2px; }
            .header-sub { font-size: 13px; margin-bottom: 10px; }
            .divider { border-top: 1px dashed #000; margin: 8px 0; }
            
            .passcode-label { font-size: 13px; font-weight: bold; margin-top: 5px; }
            .code-box { 
                font-size: 32px; 
                font-weight: bold; 
                letter-spacing: 6px; 
                border: 2px solid #000; 
                padding: 8px 0; 
                margin: 10px auto; 
                width: 90%;
                background-color: #f9f9f9;
            }

            .footer-info { font-size: 11px; margin-top: 8px; line-height: 1.4; }

            /* -------------------------------------------------- */
            /* CSS สำหรับสั่งพิมพ์ออกเครื่อง Thermal Printer 80mm */
            /* -------------------------------------------------- */
            @media print {
                @page {
                    size: 80mm auto; /* กำหนดขนาดหน้ากระดาษม้วน 80mm */
                    margin: 0mm; /* ลบขอบกระดาษจากเบราว์เซอร์ */
                }
                html, body {
                    width: 80mm;
                    margin: 0;
                    padding: 0;
                    background: #ffffff;
                }
                .no-print { display: none !important; }
                .ticket {
                    width: 72mm;
                    margin: 0 auto;
                    border: none;
                    padding: 10px 2mm 15px 2mm;
                    page-break-after: always; /* บังคับตัดกระดาษแยกใบหลังจากพิมพ์เสร็จแต่ละคูปอง */
                    break-after: page;
                }
                .code-box {
                    background-color: transparent;
                }
            }
        </style>
    </head>
    <body>
        <div class="no-print">
            <h2>🖨️ ระบบคลังคูปอง Photo Booth (80mm Thermal Print)</h2>
            <button onclick="window.print()">🖨️ สั่งพิมพ์คูปองทั้งหมด</button>
            <button onclick="location.reload()" style="background:#007bff;">🔄 รีเฟรชรายการ</button>
        </div>

        <div id="tickets-container">กำลังโหลดข้อมูลคูปอง...</div>

        <script>
            fetch('/api/admin/codes')
                .then(res => res.json())
                .then(data => {
                    const container = document.getElementById('tickets-container');
                    container.innerHTML = '';
                    
                    data.forEach((item, index) => {
                        const statusText = item.isUsed ? '(ใช้งานแล้ว)' : '';
                        const ticketHtml = \`
                            <div class="ticket">
                                <div class="header-title">PHOTO BOOTH</div>
                                <div class="header-sub">คูปองเข้าใช้งานถ่ายภาพ</div>
                                <div class="divider"></div>
                                <div class="passcode-label">รหัสผ่านสำหรับเข้าตู้ (Passcode)</div>
                                <div class="code-box">\${item.code}</div>
                                <div class="divider"></div>
                                <div class="footer-info">
                                    ใบที่: \${index + 1} / \${data.length} \${statusText}<br>
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
