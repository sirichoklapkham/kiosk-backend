const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

app.use(cors());
app.use(express.json());

// =========================================================
// 1. ระบบจัดการคูปอง (In-Memory Database / Mock)
// =========================================================
let coupons = [];

// ฟังก์ชันสุ่มรหัสผ่าน 6 หลัก
function generateRandomCode() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

// ฟังก์ชันสร้างคูปองให้ครบ 100 ใบ (โดยไม่ทับรหัสเดิมที่ยังไม่ได้ใช้)
function initCoupons() {
    let currentUnused = coupons.filter(c => !c.used).length;
    let needed = 100 - currentUnused;

    for (let i = 0; i < needed; i++) {
        let code;
        do {
            code = generateRandomCode();
        } while (coupons.some(c => c.code === code));

        coupons.push({
            id: coupons.length + 1,
            code: code,
            used: false,
            usedAt: null
        });
    }
}

// เริ่มต้นสร้างรหัสครั้งแรก 100 ใบ
initCoupons();

// =========================================================
// 2. API Endpoints สำหรับ Kiosk และ Admin
// =========================================================

// ตรวจสอบรหัสคูปองจากตู้ Kiosk
app.post('/api/verify-code', (req, res) => {
    const { code } = req.body;

    if (!code) {
        return res.status(400).json({ success: false, message: "กรุณากรอกรหัสคูปอง" });
    }

    const coupon = coupons.find(c => c.code === code);

    if (!coupon) {
        return res.json({ success: false, message: "ไม่พบรหัสคูปองนี้ในระบบ" });
    }

    if (coupon.used) {
        return res.json({ success: false, message: "คูปองนี้ถูกใช้งานไปแล้ว" });
    }

    // ทำรายการตัดคูปอง
    coupon.used = true;
    coupon.usedAt = new Date().toISOString();

    // ส่งสัญญาณ Realtime ไปยังตู้ Kiosk ผ่าน WebSocket (Socket.IO)
    io.emit('PAYMENT_SUCCESS', { code: coupon.code });

    return res.json({
        success: true,
        message: "อนุมัติการใช้งานสำเร็จ",
        code: coupon.code
    });
});

// API สำหรับดึงข้อมูลคูปองทั้งหมด (สำหรับ Admin)
app.get('/api/admin/coupons', (req, res) => {
    res.json({
        total: coupons.length,
        unused: coupons.filter(c => !c.used).length,
        used: coupons.filter(c => c.used).length,
        coupons: coupons
    });
});

// API สำหรับสั่งเติมรหัสใหม่ให้ครบ 100 ใบ
app.post('/api/admin/generate', (req, res) => {
    initCoupons();
    res.json({ success: true, message: "เติมรหัสใหม่เรียบร้อยแล้ว" });
});

// =========================================================
// 3. หน้าเว็บ Admin Portal (A4 Print Layout)
// =========================================================
app.get('/admin', (req, res) => {
    const html = `
<!DOCTYPE html>
<html lang="th">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>ระบบคลังคูปอง Photo Booth (A4 Layout)</title>
    <style>
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background-color: #f4f6f9;
            margin: 0;
            padding: 20px;
        }

        .header-panel {
            text-align: center;
            margin-bottom: 20px;
        }

        .header-title {
            font-size: 24px;
            font-weight: bold;
            color: #2c3e50;
            margin-bottom: 15px;
        }

        .btn-group {
            display: flex;
            justify-content: center;
            gap: 10px;
            margin-bottom: 15px;
            flex-wrap: wrap;
        }

        .btn {
            padding: 10px 18px;
            font-size: 14px;
            font-weight: bold;
            color: white;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            transition: 0.2s;
        }

        .btn-print-all { background-color: #27ae60; }
        .btn-print-unused { background-color: #2980b9; }
        .btn-generate { background-color: #e67e22; }
        .btn-refresh { background-color: #00a8ff; }
        .btn:hover { opacity: 0.9; }

        .stats-text {
            font-size: 14px;
            font-weight: bold;
            color: #333;
        }

        /* ------------------------------------------------------------- */
        /* การจัดเรียงแสดงผลบนหน้าจอเว็บ (Grid Layout) */
        /* ------------------------------------------------------------- */
        .coupon-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
            gap: 15px;
            max-width: 1200px;
            margin: 0 auto;
        }

        .coupon-card {
            background: white;
            border: 2px dashed #95a5a6;
            border-radius: 8px;
            padding: 12px;
            text-align: center;
            box-shadow: 0 2px 4px rgba(0,0,0,0.05);
            box-sizing: border-box;
            page-break-inside: avoid;
            break-inside: avoid;
        }

        .coupon-title {
            font-size: 15px;
            font-weight: bold;
            margin: 0;
            color: #2c3e50;
        }

        .coupon-subtitle {
            font-size: 11px;
            color: #7f8c8d;
            margin-bottom: 8px;
        }

        .passcode-box {
            border: 2px solid #2c3e50;
            border-radius: 6px;
            padding: 6px 0;
            font-size: 24px;
            font-weight: bold;
            letter-spacing: 4px;
            color: #111;
            background-color: #f8f9fa;
            margin: 8px 0;
        }

        .coupon-footer {
            font-size: 10px;
            color: #7f8c8d;
            line-height: 1.3;
        }

        .used-badge {
            color: #e74c3c;
            font-weight: bold;
        }

        /* ------------------------------------------------------------- */
        /* CSS คำสั่งเฉพาะตอนกดสั่งพิมพ์ลงกระดาษ A4 (@media print) */
        /* ------------------------------------------------------------- */
        @media print {
            @page {
                size: A4 portrait; /* กำหนดขนาดกระดาษ A4 แนวตั้ง */
                margin: 8mm;       /* ระยะขอบ 8 มม. */
            }

            body {
                background: white !important;
                padding: 0 !important;
                margin: 0 !important;
            }

            /* ซ่อนเมนู ปุ่มกด และข้อความส่วนเกิน */
            .header-panel, .btn-group, .stats-text {
                display: none !important;
            }

            /* จัดเรียงเป็นตาราง 3 คอลัมน์ บนกระดาษ A4 */
            .coupon-grid {
                display: grid !important;
                grid-template-columns: repeat(3, 1fr) !important;
                gap: 8mm !important;
                max-width: 100% !important;
                margin: 0 !important;
            }

            .coupon-card {
                border: 1px dashed #000 !important; /* เส้นประสีดำสำหรับใช้กรรไกรตัด */
                box-shadow: none !important;
                padding: 10px !important;
                page-break-inside: avoid !important;
                break-inside: avoid !important;
            }

            .passcode-box {
                border: 1.5px solid #000 !important;
                background: #fff !important;
                font-size: 22px !important;
            }

            /* ซ่อนคูปองที่ใช้แล้วเมื่อเลือกพิมพ์เฉพาะใบที่ยังไม่ได้ใช้ */
            .hide-on-print {
                display: none !important;
            }
        }
    </style>
</head>
<body>

    <div class="header-panel">
        <div class="header-title">📄 ระบบคลังคูปอง Photo Booth (A4 Layout)</div>
        <div class="btn-group">
            <button class="btn btn-print-all" onclick="printCoupons(false)">🖨️ พิมพ์คูปองทั้งหมด (A4)</button>
            <button class="btn btn-print-unused" onclick="printCoupons(true)">📄 พิมพ์เฉพาะใบยังไม่ได้ใช้ (A4)</button>
            <button class="btn btn-generate" onclick="generateNewCodes()">🔄 เติมรหัสใหม่ให้ครบ 100 ใบ</button>
            <button class="btn btn-refresh" onclick="loadCoupons()">🔄 รีเฟรช</button>
        </div>
        <div class="stats-text" id="stats">กำลังโหลดข้อมูล...</div>
    </div>

    <!-- ตารางแสดงรายการคูปอง -->
    <div class="coupon-grid" id="couponContainer"></div>

    <script>
        let allCoupons = [];

        async function loadCoupons() {
            try {
                const res = await fetch('/api/admin/coupons');
                const data = await res.json();
                allCoupons = data.coupons;

                document.getElementById('stats').innerText = 
                    \`รวมทั้งหมด \${data.total} ใบ | ยังไม่ได้ใช้: \${data.unused} ใบ | ใช้งานแล้ว: \${data.used} ใบ\`;

                renderCoupons(allCoupons);
            } catch (err) {
                document.getElementById('stats').innerText = 'ไม่สามารถโหลดข้อมูลคูปองได้';
            }
        }

        function renderCoupons(coupons) {
            const container = document.getElementById('couponContainer');
            container.innerHTML = '';

            coupons.forEach(coupon => {
                const card = document.createElement('div');
                card.className = 'coupon-card';
                card.setAttribute('data-used', coupon.used);

                card.innerHTML = \`
                    <div class="coupon-title">PHOTO BOOTH</div>
                    <div class="coupon-subtitle">คูปองเข้าใช้งานถ่ายภาพ</div>
                    <hr style="border: 0; border-top: 1px dashed #ccc; margin: 5px 0;">
                    <div style="font-size: 11px; color: #555;">รหัสผ่านสำหรับเข้าตู้ (Passcode)</div>
                    <div class="passcode-box">\${coupon.code}</div>
                    <div class="coupon-footer">
                        ใบที่: \${coupon.id} / 100 \${coupon.used ? '<span class="used-badge">(ใช้แล้ว)</span>' : ''}<br>
                        *ใช้ได้ 1 ครั้งต่อ 1 สิทธิ์การถ่ายภาพ*
                    </div>
                \`;
                container.appendChild(card);
            });
        }

        function printCoupons(onlyUnused) {
            const cards = document.querySelectorAll('.coupon-card');
            cards.forEach(card => {
                if (onlyUnused && card.getAttribute('data-used') === 'true') {
                    card.classList.add('hide-on-print');
                } else {
                    card.classList.remove('hide-on-print');
                }
            });
            window.print();
        }

        async function generateNewCodes() {
            if (confirm('คุณต้องการเติมรหัสใหม่ให้ครบ 100 ใบใช่หรือไม่?')) {
                await fetch('/api/admin/generate', { method: 'POST' });
                loadCoupons();
            }
        }

        // โหลดข้อมูลเมื่อเปิดหน้าเว็บ
        loadCoupons();
    </script>
</body>
</html>
    `;
    res.send(html);
});

// =========================================================
// 4. เริ่มต้นทำงาน Server
// =========================================================
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
