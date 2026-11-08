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
// ระบบคลังรหัสสุ่มมั่ว (รองรับการ Refill เติมเฉพาะส่วนที่ใช้ไปแล้ว)
// ----------------------------------------------------
let passcodeDatabase = [];
const TARGET_POOL_SIZE = 100;

// ฟังก์ชันเติมรหัสให้ครบ 100 ใบ โดยไม่กระทบรหัสเดิมที่ยังไม่ได้ใช้
function refillPasscodes() {
    // 1. เก็บเฉพาะรหัสที่ยังไม่ได้ใช้งานไว้ (isUsed: false)
    const activePasscodes = passcodeDatabase.filter(item => !item.isUsed);
    
    // ดึงเฉพาะตัวเลขรหัสเดิมมาเช็กไม่ให้สุ่มได้ซ้ำ
    const existingCodes = new Set(activePasscodes.map(item => item.code));

    // 2. สุ่มรหัสใหม่เติมจนกว่าจะครบ 100 ใบ
    while (existingCodes.size < TARGET_POOL_SIZE) {
        const randomCode = Math.floor(100000 + Math.random() * 900000).toString();
        existingCodes.add(randomCode);
    }

    // 3. ประกอบคลังรหัสใหม่
    const newDatabase = [];
    existingCodes.forEach(code => {
        // ถ้ารหัสนี้เป็นรหัสเดิมที่ยังไม่ใช้ ให้คงค่าเดิมไว้
        const existingItem = activePasscodes.find(item => item.code === code);
        if (existingItem) {
            newDatabase.push(existingItem);
        } else {
            newDatabase.push({ code: code, isUsed: false });
        }
    });

    passcodeDatabase = newDatabase;
    console.log(`[Database] Refilled pool. Current unused passcodes: ${passcodeDatabase.filter(x => !x.isUsed).length}/${passcodeDatabase.length}`);
}

// สร้างรหัสเริ่มต้น 100 ใบเมื่อเปิดเซิร์ฟเวอร์
refillPasscodes();

// ----------------------------------------------------
// Endpoints & API
// ----------------------------------------------------

// 1. Health Check
app.get('/', (req, res) => {
    res.send('Kiosk Random Passcode Backend is Running!');
});

// 2. API ตรวจสอบรหัส 6 หลักจากตู้ Kiosk
app.post('/api/verify-code', (req, res) => {
    const { code } = req.body;

    if (!code) {
        return res.status(400).json({ success: false, message: 'กรุณาระบุรหัสผ่าน' });
    }

    const foundItem = passcodeDatabase.find(item => item.code === code.trim());

    if (!foundItem) {
        return res.json({ success: false, message: 'รหัสผ่านไม่ถูกต้อง' });
    }

    if (foundItem.isUsed) {
        return res.json({ success: false, message: 'รหัสผ่านนี้ถูกใช้งานไปแล้ว' });
    }

    foundItem.isUsed = true;
    console.log(`[Passcode Used] Code ${code} successfully unlocked kiosk.`);

    io.emit('PAYMENT_SUCCESS', { status: 'success', codeUsed: code });

    return res.json({ success: true, message: 'ปลดล็อกสำเร็จ' });
});

// 3. API สำหรับดูรายการรหัสทั้งหมด
app.get('/api/admin/codes', (req, res) => {
    res.json(passcodeDatabase);
});

// 4. API Refill: สุ่มสร้างรหัสใหม่เฉพาะจำนวนที่ใช้ไปแล้ว (ไม่ทับรหัสที่ยังไม่ได้ใช้)
app.get('/api/admin/refill', (req, res) => {
    refillPasscodes();
    res.json({
        success: true,
        message: 'Refilled passcodes successfully!',
        totalCodes: passcodeDatabase.length,
        unusedCount: passcodeDatabase.filter(x => !x.isUsed).length
    });
});

// 5. API Reset ล้างทั้งหมดและสุ่มใหม่เต็ม 100 ใบ
app.get('/api/admin/reset', (req, res) => {
    passcodeDatabase = [];
    refillPasscodes();
    res.json({
        success: true,
        message: 'Reset all codes and generated 100 new passcodes!',
        totalCodes: passcodeDatabase.length
    });
});

// 6. หน้า Dashboard พิมพ์คูปองสลิป 80mm
app.get('/admin', (req, res) => {
    res.send(`
    <!DOCTYPE html>
    <html lang="th">
    <head>
        <meta charset="UTF-8">
        <title>ระบบพิมพ์คูปอง Photo Booth (80mm)</title>
        <style>
            body { 
                font-family: 'Tahoma', 'Courier New', monospace; 
                padding: 20px; 
                background: #eef2f5; 
                margin: 0;
            }
            .no-print { margin-bottom: 20px; text-align: center; }
            button { 
                padding: 10px 18px; 
                font-size: 15px; 
                font-weight: bold;
                cursor: pointer; 
                color: white; 
                border: none; 
                border-radius: 8px; 
                margin: 4px; 
                box-shadow: 0 2px 5px rgba(0,0,0,0.15);
            }
            .btn-print { background: #28a745; }
            .btn-print-unused { background: #17a2b8; }
            .btn-refill { background: #ff9800; }
            .btn-refresh { background: #007bff; }

            .ticket {
                width: 72mm;
                padding: 12px 5px;
                margin: 15px auto;
                background: #ffffff;
                border: 1px dashed #b5b5b5;
                text-align: center;
                box-sizing: border-box;
                color: #000000;
            }
            .ticket.used {
                opacity: 0.5;
                background: #f0f0f0;
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

            @media print {
                @page {
                    size: 80mm auto;
                    margin: 0mm;
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
                    page-break-after: always;
                    break-after: page;
                }
                .ticket.hide-on-print {
                    display: none !important;
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
            <div>
                <button class="btn-print" onclick="printAll()">🖨️ พิมพ์คูปองทั้งหมด</button>
                <button class="btn-print-unused" onclick="printOnlyUnused()">📄 พิมพ์เฉพาะใบยังไม่ใช้งาน</button>
                <button class="btn-refill" onclick="refillCodes()">🔄 เติมรหัสใหม่ให้ครบ 100 ใบ (ไม่ทับรหัสเดิม)</button>
                <button class="btn-refresh" onclick="loadCodes()">🔁 รีเฟรช</button>
            </div>
            <p id="summary-text" style="margin-top: 10px; font-weight: bold; color: #333;"></p>
        </div>

        <div id="tickets-container">กำลังโหลดข้อมูลคูปอง...</div>

        <script>
            let allCodes = [];

            function loadCodes() {
                fetch('/api/admin/codes')
                    .then(res => res.json())
                    .then(data => {
                        allCodes = data;
                        renderTickets(data);
                    });
            }

            function renderTickets(data) {
                const container = document.getElementById('tickets-container');
                container.innerHTML = '';
                
                const unusedCount = data.filter(x => !x.isUsed).length;
                const usedCount = data.length - unusedCount;
                document.getElementById('summary-text').innerText = \`รวมทั้งหมด \${data.length} ใบ | ยังไม่ได้ใช้: \${unusedCount} ใบ | ใช้งานแล้ว: \${usedCount} ใบ\`;

                data.forEach((item, index) => {
                    const usedClass = item.isUsed ? 'used' : '';
                    const statusText = item.isUsed ? '(ใช้งานแล้ว)' : '(ยังไม่ได้ใช้)';
                    const ticketHtml = \`
                        <div class="ticket \${usedClass}" data-used="\${item.isUsed}">
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
            }

            function refillCodes() {
                if (confirm('คุณต้องการสุ่มสร้างรหัสใหม่เฉพาะส่วนที่ถูกใช้ไปแล้วใช่หรือไม่? (รหัสที่ยังไม่ได้ใช้จะคงเดิม)')) {
                    fetch('/api/admin/refill')
                        .then(res => res.json())
                        .then(res => {
                            alert('เติมรหัสเรียบร้อยแล้ว!');
                            loadCodes();
                        });
                }
            }

            function printAll() {
                document.querySelectorAll('.ticket').forEach(el => el.classList.remove('hide-on-print'));
                window.print();
            }

            function printOnlyUnused() {
                document.querySelectorAll('.ticket').forEach(el => {
                    if (el.getAttribute('data-used') === 'true') {
                        el.classList.add('hide-on-print');
                    } else {
                        el.classList.remove('hide-on-print');
                    }
                });
                window.print();
            }

            // โหลดข้อมูลเมื่อเปิดหน้าเว็บ
            loadCodes();
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
