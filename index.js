const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid'); // 用來產生唯一排程 ID
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

const GROUP_FILE = path.join(__dirname, 'groups.json');
const SCHEDULE_FILE = path.join(__dirname, 'scheduler.json');

// ==== 工具函式 ====
function loadGroups() {
  if (!fs.existsSync(GROUP_FILE)) return {};
  return JSON.parse(fs.readFileSync(GROUP_FILE, 'utf8'));
}
function saveGroups(data) {
  fs.writeFileSync(GROUP_FILE, JSON.stringify(data, null, 2));
}
function getGroupIdByName(name) {
  const data = loadGroups();
  return data[name] || null;
}
function loadSchedules() {
  if (!fs.existsSync(SCHEDULE_FILE)) return [];
  return JSON.parse(fs.readFileSync(SCHEDULE_FILE, 'utf8'));
}
function saveSchedules(data) {
  fs.writeFileSync(SCHEDULE_FILE, JSON.stringify(data, null, 2));
}

// ==== Webhook 回覆 ====
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
  res.send('OK');
});

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

// ==== 新增群組 ====
app.post('/add-group', (req, res) => {
  const { name, id } = req.body;
  const groups = loadGroups();
  groups[name] = id;
  saveGroups(groups);
  res.send({ success: true, message: `已新增群組：${name}` });
});

// ==== 發送訊息邏輯 ====
async function sendMessage(groupIds, title, messageText) {
  for (let id of groupIds) {
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
}

// ==== 立即或排程發送訊息 ====
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

  const groupIds = groupNames.map(getGroupIdByName).filter(Boolean);
  const messageText =
    templateType === '自訂'
      ? content
      : typeof templates[templateType] === 'function'
        ? templates[templateType](currency, amount)
        : content;

  if (sendAt) {
    // 新增排程
    const schedules = loadSchedules();
    const newItem = {
      id: uuidv4(),
      groupIds,
      title,
      messageText,
      sendAt: new Date(sendAt).toISOString()
    };
    schedules.push(newItem);
    saveSchedules(schedules);
    return res.send({ success: true, message: '已排程發送', id: newItem.id });
  }

  // 立即發送
  try {
    await sendMessage(groupIds, title, messageText);
    res.send({ success: true, message: '訊息已立即送出' });
  } catch (err) {
    res.status(500).send({ success: false, error: err.message });
  }
});

// ==== 每分鐘檢查排程 ====
setInterval(() => {
  const now = new Date();
  const schedules = loadSchedules();
  const pending = schedules.filter(s => !s.sent && new Date(s.sendAt) <= now);
  for (let s of pending) {
    sendMessage(s.groupIds, s.title, s.messageText);
    s.sent = true;
  }
  if (pending.length > 0) saveSchedules(schedules);
}, 60000);

// ==== 查看所有排程 ====
app.get('/list-schedules', (req, res) => {
  const data = loadSchedules();
  res.send(data);
});

// ==== 刪除排程 ====
app.post('/delete-schedule', (req, res) => {
  const { id } = req.body;
  let data = loadSchedules();
  const before = data.length;
  data = data.filter(s => s.id !== id);
  saveSchedules(data);
  res.send({ success: true, deleted: before - data.length });
});

// ==== 編輯排程 ====
app.post('/edit-schedule', (req, res) => {
  const { id, newSendAt, newTitle, newContent } = req.body;
  const data = loadSchedules();
  const index = data.findIndex(s => s.id === id);
  if (index === -1) return res.status(404).send({ error: '排程不存在' });

  if (newSendAt) data[index].sendAt = new Date(newSendAt).toISOString();
  if (newTitle) data[index].title = newTitle;
  if (newContent) data[index].messageText = newContent;

  data[index].sent = false; // 重設發送狀態
  saveSchedules(data);
  res.send({ success: true, updated: true });
});

// ==== 啟動 ====
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
