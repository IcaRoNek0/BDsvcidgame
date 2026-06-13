const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// 静态文件服务（SPA）
app.use(express.static(path.join(__dirname, 'public')));

// 所有路由返回 index.html（SPA 支持）
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Streetview Game Server running at http://localhost:${PORT}`);
});
