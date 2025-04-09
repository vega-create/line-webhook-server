const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;
app.use(express.static(__dirname));

app.use(express.json());

// 載入群組名稱與ID對照
const groupMapPath = path.join(__dirname, 'groupMap.json');
let groupMap = {};
if (fs.existsSync(groupMapPath)) {
  groupMap = JSON.parse(fs.readFileSync(groupMapPath));
}

// 載入排程
const schedulerPath = path.join(__dirname, 'scheduler.json');
let scheduler = [];
if (fs.existsSync(schedulerPath)) {
  scheduler = JSON.parse(fs.readFileSync(schedulerPath));
}

// LINE Webhook 自動回覆
app.post('/webhook', async (req, res) => {
  const events = req.body.events;

  for (let event of events) {
    if (event.type === 'message' && event.message.type === 'text') {
      const replyToken = event.replyToken;
      const userMessage = event.message.text;

      await axios.post('https://api.line.me/v2/bot/message/reply', {
        replyToken,
        messages: [{ type: 'text', text: `你說的是：${userMessage}` }]
      }, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`
        }
      });
    }
  }

  res.status(200).send('OK');
});

// POST /send-message 發送訊息
app.post('/send-message', async (req, res) => {
  const {
    groupNames,
    templateType,
    title,
    content,
    currency,
    amount,
    sendAt
  } = req.body;

 // === 內建模板 ===
const templates = {
  "收款通知": (currency, amount) => `親愛的客戶您好，這個月的費用（${currency || ''}${amount || ''}）。請於5日前匯款至
    彰化銀行 009
    帳號：96038605494000
    戶名：智慧媽咪國際有限公司

    發票將於收到款項後提供`,
  "入帳通知": (currency, amount) => `我們已收到您的款項（${currency || ''}${amount || ''}）。`,
  "發票寄送通知": () => `您的發票已寄至您的 e-mail，請注意查收。`,
  "自我介紹": () => `您好我是智慧媽咪 Line 通知系統，負責提醒各項事項，包含：請款、入款、發票等寄送通知。`,
  "專案進度詢問": () => `xxx 客戶的狀況如何了？`,
  "放假通知": () => `您好，我們將於 4/3~4/6 放假`,
  "會議提醒": () => `親愛的團隊成員，請記得參加今天的會議。`
};

  const messageText = templateType === "自訂" ? content : templates[templateType] || content;
  const groupIds = groupNames.map(name => groupMap[name]).filter(Boolean);

  if (sendAt) {
    scheduler.push({
      groupIds,
      title,
      messageText,
      sendAt: new Date(sendAt).toISOString()
    });
    fs.writeFileSync(schedulerPath, JSON.stringify(scheduler, null, 2));
    return res.send({ success: true, message: '已排程發送' });
  }

  try {
    for (const groupId of groupIds) {
      await axios.post('https://api.line.me/v2/bot/message/push', {
        to: groupId,
        messages: [{ type: 'text', text: `【${title}】\n${messageText}` }]
      }, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.LINE_ACCESS_TOKEN}`
        }
      });
    }
    res.send({ success: true, message: '訊息已發送' });
  } catch (error) {
    console.error('發送失敗', error.response?.data || error.message);
    res.status(500).send({ success: false, error: error.message });
  }
});

// 每分鐘檢查排程
setInterval(async () => {
  const now = new Date();
  const toSend = scheduler.filter(item => new Date(item.sendAt) <= now);
  scheduler = scheduler.filter(item => new Date(item.sendAt) > now);
  fs.writeFileSync(schedulerPath, JSON.stringify(scheduler, null, 2));

  for (let job of toSend) {
    for (const groupId of job.groupIds) {
      try {
        await axios.post('https://api.line.me/v2/bot/message/push', {
          to: groupId,
          messages: [{ type: 'text', text: `【${job.title}】\n${job.messageText}` }]
        }, {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.LINE_ACCESS_TOKEN}`
          }
        });
      } catch (err) {
        console.error('排程發送失敗', err.response?.data || err.message);
      }
    }
  }
}, 60 * 1000);
const fs = require('fs');
const schedulerPath = path.join(__dirname, 'scheduler.json');

// ✅ GET：取得所有排程
app.get('/schedules', (req, res) => {
  const data = JSON.parse(fs.readFileSync(schedulerPath, 'utf8'));
  res.json(data);
});

// ✅ DELETE：刪除特定排程
app.delete('/schedules/:id', (req, res) => {
  const id = req.params.id;
  let data = JSON.parse(fs.readFileSync(schedulerPath, 'utf8'));
  const updated = data.filter(item => item.id !== id);
  fs.writeFileSync(schedulerPath, JSON.stringify(updated, null, 2));
  res.json({ success: true });
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`✅ Server is running on port ${PORT}`);
});
