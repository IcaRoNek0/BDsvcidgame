const express = require('express');
const axios = require('axios');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// 静态文件服务
app.use(express.static(path.join(__dirname, 'public')));

/**
 * 百度街景图片代理接口
 * GET /api/streetview?panoid=xxx&fallback_heading=0
 *
 * 流程：
 * 1. 请求 `qt=sdata` 元数据接口获取真实 Heading（最多 5 次，指数退避）
 * 2. 构造 `qt=pr3d` 图片 URL（1024x1024，pitch=-90，fovy=120，quality=100）
 * 3. 下载图片并返回二进制数据（最多 5 次，指数退避）
 */
app.get('/api/streetview', async (req, res) => {
  const { panoid, fallback_heading = '0' } = req.query;

  if (!panoid) {
    return res.status(400).json({ error: 'Missing panoid parameter' });
  }

  // 指数退避延时函数
  function backoffDelay(attempt) {
    return Math.min(1000 * Math.pow(2, attempt), 10000);
  }

  try {
    // ---- 第一步：获取元数据，提取真实 Heading ----
    let heading = fallback_heading;
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const metaUrl = `https://mapsv0.bdimg.com/?qt=sdata&sid=${panoid}`;
        const metaRes = await axios.get(metaUrl, { timeout: 10000 });
        if (metaRes.status === 200) {
          const metaData = metaRes.data;
          const content = metaData && metaData.content;
          if (content && content.length > 0 && content[0].Heading !== undefined) {
            heading = content[0].Heading;
            break;
          }
        }
      } catch (metaErr) {
        // 忽略，继续重试
      }
      if (attempt < 4) {
        await new Promise(resolve => setTimeout(resolve, backoffDelay(attempt)));
      }
    }

    // ---- 第二步：下载街景图片 ----
    const imageUrl = `https://mapsv0.bdimg.com/?qt=pr3d&fovy=120&quality=100&panoid=${panoid}&heading=${heading}&pitch=-90&width=1024&height=1024`;

    let imageBuffer = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const imgRes = await axios.get(imageUrl, {
          responseType: 'arraybuffer',
          timeout: 20000
        });
        if (imgRes.status === 200) {
          imageBuffer = imgRes.data;
          break;
        }
      } catch (imgErr) {
        // 忽略，继续重试
      }
      if (attempt < 4) {
        await new Promise(resolve => setTimeout(resolve, backoffDelay(attempt)));
      }
    }

    if (!imageBuffer) {
      throw new Error('Failed to fetch image after 5 retries');
    }

    // 返回图片二进制数据
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.end(Buffer.from(imageBuffer));
  } catch (err) {
    console.error(`[ERROR] Failed to fetch streetview for ${panoid}:`, err.message);
    res.status(502).json({ error: 'Failed to fetch street view image' });
  }
});

// 所有其他路由返回 index.html（SPA 支持）
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Streetview Game Server running at http://localhost:${PORT}`);
});
