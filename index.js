const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// 讀取群組名稱對應群組 ID 的 JSON 檔案
function getGroupIdByName(name) {
  const groupPath = path.join(__dirname, 'groups.json');
  if (!fs.existsSync(groupPath)) return null;
  const groups = JSON.parse(fs.readFileSync(groupPath, 'utf8'));
  return groups[name] || null;
}

// webhook 路由：用來測試 Bot 是否正常運作
app.post('/webhook', async (req, res) => {
  const events = req.body.events;
  console.log('LINE webhook received:', events);

  for (let event of events) {
    if (event.type === 'message' && event.message.type === 'text') {
      const replyToken = event.replyToken;
      const userMessage = event.message.text;

      await axios.post(
        'https://api.line.me/v2/bot/message/reply',
        {
          replyToken: replyToken,
          messages: [{ type: 'text', text: `你說的是：${userMessage}` }]
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`
          }
        }
      );
    }
  }

  res.status(200).send('OK');
});

// 發送訊息的路由
app.post('/send-message', async (req, res) => {
  const {
    groupNames,       // 群組名稱陣列（如 ["小幫手", "Tina群"]）
    templateType,     // 模板類型，如 收款通知、入帳通知、自我介紹...
    title,            // 訊息標題
    content,          // 自訂內容（如果 templateType 為自訂）
    currency,         // 幣別（僅用於 收款 / 入帳通知）
    amount,           // 金額
    sendAt,           // 排程時間（目前未使用）
    isRecurring       // 是否週期性（目前未使用）
  } = req.body;

  // 預設模板內容
  const templates = {
    "收款通知": `親愛的客戶您好，請記得繳交款項。`,
    "入帳通知": `我們已收到您的款項（${currency || ''}${amount || ''}）。`,
    "發票寄送通知": `您的發票已寄至您的 e-mail，請注意查收。`,
    "自我介紹": `您好我是智慧媽咪 Line 通知系統，負責提醒各項事項，包含：請款、入款、發票等寄送通知。`,
    "專案進度詢問": `xxx 客戶的狀況如何了？`,
    "放假通知": `您好，我們將於 4/3~4/6 放假`,
    "會議提醒": `親愛的團隊成員，請記得參加今天的會議。`
  };

  // 套用模板或使用自訂內容
  const messageText =
    templateType === "自訂" ? content : templates[templateType] || content;

  try {
    for (const name of groupNames) {
      const groupId = getGroupIdByName(name);
      if (!groupId) {
        console.warn(`找不到群組名稱對應的 ID：${name}`);
        continue;
      }

      await axios.post(
        'https://api.line.me/v2/bot/message/push',
        {
          to: groupId,
          messages: [
            {
              type: 'text',
              text: `【${title}】\n${messageText}`
            }
          ]
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.LINE_ACCESS_TOKEN}`
          }
        }
      );
    }

    res.status(200).send({ success: true, message: '訊息已送出' });
  } catch (error) {
    console.error('發送失敗', error.response?.data || error);
    res.status(500).send({ success: false, error: error.message });
  }
});

// 啟動伺服器
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
