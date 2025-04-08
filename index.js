const express = require('express');
const axios = require('axios');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

app.post('/webhook', async (req, res) => {
  const events = req.body.events;
  console.log('LINE webhook received:', events);

  for (let event of events) {
    if (event.type === 'message' && event.message.type === 'text') {
      const replyToken = event.replyToken;
      const userMessage = event.message.text;

      await axios.post('https://api.line.me/v2/bot/message/reply', {
        replyToken: replyToken,
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
app.use(express.json());

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
app.post('/send-message', async (req, res) => {
  const {
    groupIds,
    templateType,
    title,
    content,
    currency,
    amount,
    sendAt,
    isRecurring
  } = req.body;

  // 模板定義
  const templates = {
    "收款通知": `親愛的客戶您好，請記得繳交款項。`,
    "入帳通知": `我們已收到您的款項（${currency || ''}）${amount || ''}。`,
    "發票寄送通知": `您的發票已寄至您的 e-mail，請注意查收。`,
    "自我介紹": `您好我是智慧媽咪 Line 通知系統，負責提醒各項事項，包含：請款、入款、發票等寄送通知。`,
    "專案進度詢問": `xxx 客戶的狀況如何了？`,
    "放假通知": `您好，我們將於 4/3~4/6 放假`,
    "會議提醒": `親愛的團隊成員，請記得參加今天的會議。`
  };

  // 要送出的訊息
  const messageText = templateType === "自訂"
    ? content
    : templates[templateType] || content;

  try {
    for (const groupId of groupIds) {
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
