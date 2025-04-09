const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// === 載入群組 ID 對照表 ===
const GROUP_FILE = path.join(__dirname, 'groups.json');
function loadGroups() {
  if (!fs.existsSync(GROUP_FILE)) return {};
  return JSON.parse(fs.readFileSync(GROUP_FILE, 'utf8'));
}
function saveGroups(groups) {
  fs.writeFileSync(GROUP_FILE, JSON.stringify(groups, null, 2));
}
function getGroupIdByName(name) {
  const groups = loadGroups();
  return groups[name] || null;
}

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

// === Webhook 回覆 ===
app.post('/webhook', async (req, res) => {
  const events = req.body.events || [];
  for (let event of events) {
    if (event.type === 'message' && event.message.type === 'text') {
      await axios.post('https://api.line.me/v2/bot/message/reply', {
        replyToken: event.replyToken,
        messages: [{ type: 'text', text: `你說的是：${event.message.text}` }]
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

// === 新增群組名稱與 ID ===
app.post('/add-group', (req, res) => {
  const { name, id } = req.body;
  const groups = loadGroups();
  groups[name] = id;
  saveGroups(groups);
  res.send({ success: true, message: `已新增群組：${name}` });
});

// === 發送訊息（立即或排程）===
const scheduledMessages = [];

app.post('/send-message', async (req, res) => {
  const {
    groupNames,
    templateType,
    title,
    content,
    currency,
    amount,
    sendAt,
    isRecurring,
    recurringType,
    weekDay
  } = req.body;

  const messageText =
    templateType === '自訂'
      ? content
      : typeof templates[templateType] === 'function'
        ? templates[templateType](currency, amount)
        : content;

  const targetGroups = groupNames.map(getGroupIdByName).filter(Boolean);

  if (sendAt) {
    // 加入排程隊列
    scheduledMessages.push({
      groupIds: targetGroups,
      title,
      messageText,
      sendAt: new Date(sendAt),
      isRecurring,
      recurringType,
      weekDay
    });
    return res.send({ success: true, message: '已排程發送' });
  }

  // 立即發送
  try {
    for (let id of targetGroups) {
      await axios.post('https://api.line.me/v2/bot/message/push', {
        to: id,
        messages: [{ type: 'text', text: `【${title}】\n${messageText}` }]
      }, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.LINE_ACCESS_TOKEN}`
        }
      });
    }
    res.send({ success: true, message: '訊息已立即送出' });
  } catch (err) {
    console.error('發送失敗', err.response?.data || err);
    res.status(500).send({ success: false, error: err.message });
  }
});

// === 每分鐘檢查排程 ===
setInterval(async () => {
  const now = new Date();
  for (let msg of scheduledMessages) {
    const isDue = Math.abs(now - msg.sendAt) < 60000;
    const isToday = now.getDay() === msg.weekDay;

    if (isDue || (msg.isRecurring && (
      (msg.recurringType === 'daily') ||
      (msg.recurringType === 'weekly' && isToday)
    ))) {
      for (let id of msg.groupIds) {
        await axios.post('https://api.line.me/v2/bot/message/push', {
          to: id,
          messages: [{ type: 'text', text: `【${msg.title}】\n${msg.messageText}` }]
        }, {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.LINE_ACCESS_TOKEN}`
          }
        });
      }
      msg.sent = true;
    }
  }
}, 60000);

// 啟動 Server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
