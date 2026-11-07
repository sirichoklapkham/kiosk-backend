const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const bodyParser = require('body-parser');
const axios = require('axios');
const crypto = require('crypto');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

const CHILLPAY_MERCHANT_CODE = 'M039098';
const CHILLPAY_API_KEY = 'DPFLpagGhiCaSImw6tOIm3wrGKQFGU0ylbEOS8PaUvFEqt3dIdEuS8uNIw3u6Vnq';
const CHILLPAY_MD5_KEY = 'a5xCR28MUXLoTnKZvaTwmUaQsz9nTTDnUVIwth7St0Y9cg1Gj90ydBX62UJSr8PRVIDSQgTVaXqj8TtnDhB0bO2zCXwJFk4XmZ5CQBl1PAOG1A5Cf8i44mCdtUsAruVRfobd00hHMewKfbbTyD72tnydab78c9jNh4WGm';

// หากใช้ Merchant Code/Key จาก Sandbox ให้ใช้ URL นี้
const CHILLPAY_API_URL = 'https://api.chillpay.co/api/v2/Payment';

const WEBHOOK_URL = 'https://my-kiosk-backend.onrender.com/api/webhook/chillpay';

let kioskSocket = null;

io.on('connection', (socket) => {
  console.log('Kiosk connected:', socket.id);
  kioskSocket = socket;
  socket.on('disconnect', () => { 
    console.log('Kiosk disconnected');
    kioskSocket = null; 
  });
});

app.post('/api/create-qr', async (req, res) => {
  const { amount } = req.body;
  const orderNo = `ORD${Date.now()}`;
  const customerId = 'GUEST';
  const channelCode = 'epay_qr';

  const checksumRaw = `${CHILLPAY_MERCHANT_CODE}${orderNo}${customerId}${amount}${channelCode}${CHILLPAY_MD5_KEY}`;
  const checkSum = crypto.createHash('md5').update(checksumRaw).digest('hex');

  const payload = {
    MerchantCode: CHILLPAY_MERCHANT_CODE,
    ApiKey: CHILLPAY_API_KEY,
    OrderNo: orderNo,
    CustomerId: customerId,
    Amount: amount,
    ChannelCode: channelCode,
    Currency: 'THB',
    ResultUrl: WEBHOOK_URL,
    CheckSum: checkSum
  };

  try {
    const response = await axios.post(CHILLPAY_API_URL, payload);
    const data = response.data;

    console.log('ChillPay Response:', data); // พิมพ์ Log ดูค่าที่ ChillPay ส่งกลับมา

    if (data.Status === 0) {
      res.json({
        success: true,
        orderNo: orderNo,
        qrImage: data.QrCodeUrl
      });
    } else {
      // ส่งข้อความ Error จริงจาก ChillPay กลับไปให้ WPF
      res.status(400).json({ 
        success: false, 
        message: data.Message || `Error Status: ${data.Status}` 
      });
    }
  } catch (error) {
    console.error('API Error:', error.response ? error.response.data : error.message);
    res.status(500).json({ 
      success: false, 
      message: error.response?.data?.Message || error.message 
    });
  }
});

app.post('/api/webhook/chillpay', (req, res) => {
  const { MerchantCode, OrderNo, Amount, PaymentStatus, CheckSum } = req.body;

  const checksumRaw = `${MerchantCode}${OrderNo}${Amount}${PaymentStatus}${CHILLPAY_MD5_KEY}`;
  const calculatedChecksum = crypto.createHash('md5').update(checksumRaw).digest('hex');

  if (calculatedChecksum.toLowerCase() === CheckSum.toLowerCase()) {
    if (PaymentStatus === '0' || PaymentStatus === 0) {
      console.log(`[Payment Success] Order: ${OrderNo}`);
      if (kioskSocket) {
        kioskSocket.emit('PAYMENT_SUCCESS', {
          orderNo: OrderNo,
          amount: Amount / 100
        });
      }
    }
    return res.status(200).send('OK');
  } else {
    return res.status(400).send('Invalid Checksum');
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Backend Server running on port ${PORT}`);
});
