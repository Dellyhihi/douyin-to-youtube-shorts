const axios = require('axios');

const shareUrl = 'https://v.douyin.com/qLENPvwvgvw/';
const MOBILE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1';

async function main() {
  console.log('Testing Douyin URL:', shareUrl);

  // 1. Resolve redirect to iesdouyin or douyin
  let resolvedUrl = shareUrl;
  try {
    const res = await axios.get(shareUrl, {
      headers: { 'User-Agent': MOBILE_UA },
      maxRedirects: 5,
      validateStatus: () => true
    });
    resolvedUrl = res.request?.res?.responseUrl || res.config?.url || shareUrl;
    console.log('1. Resolved URL:', resolvedUrl);
  } catch(e) {
    console.log('1. Resolve failed:', e.message);
  }

  // Extract ID
  const idMatch = resolvedUrl.match(/video\/(\d+)/) || resolvedUrl.match(/note\/(\d+)/) || resolvedUrl.match(/\/(\d{15,})/);
  const videoId = idMatch ? idMatch[1] : null;
  console.log('2. Extracted video ID:', videoId);

  if (videoId) {
    // Test iesdouyin detail endpoint
    try {
      const detailUrl = `https://www.iesdouyin.com/web/api/v2/aweme/iteminfo/?item_ids=${videoId}`;
      const res = await axios.get(detailUrl, {
        headers: {
          'User-Agent': MOBILE_UA,
          'Referer': 'https://www.iesdouyin.com/',
        }
      });
      console.log('3. iteminfo response:', res.data);
    } catch(e) {
      console.log('3. iteminfo error:', e.message);
    }

    // Test iesdouyin mobile web page
    try {
      const pageRes = await axios.get(`https://www.iesdouyin.com/share/video/${videoId}/`, {
        headers: { 'User-Agent': MOBILE_UA }
      });
      console.log('4. iesdouyin HTML len:', pageRes.data.length);
      const scriptMatch = pageRes.data.match(/_ROUTER_DATA\s*=\s*(\{.*?\});/s) ||
                          pageRes.data.match(/window\._SSR_DATA\s*=\s*(\{.*?\});/s);
      if (scriptMatch) {
        console.log('4. Found router data:', scriptMatch[1].substring(0, 300));
        const json = JSON.parse(scriptMatch[1]);
        console.log('4. Parsed JSON keys:', Object.keys(json));
      } else {
        // search for any play_addr or url_list
        const urlMatches = pageRes.data.match(/https?:\/\/[^"'\s]+\.mp4[^"'\s]*/g) ||
                           pageRes.data.match(/https?:\\\/\\\/[^"'\s]+play[^"'\s]*/g);
        console.log('4. Direct video urls in HTML:', urlMatches?.slice(0, 3));
      }
    } catch(e) {
      console.log('4. iesdouyin error:', e.message);
    }
  }

  // 5. Test public Douyin APIs
  const apis = [
    `https://api.douyin.wtf/douyin_video_data/?douyin_video_url=${encodeURIComponent(shareUrl)}`,
    `https://api.pearktrue.cn/api/douyin/?url=${encodeURIComponent(shareUrl)}`,
    `https://api.vvhan.com/api/wburl?url=${encodeURIComponent(shareUrl)}`,
    `https://tenapi.cn/v2/yis?url=${encodeURIComponent(shareUrl)}`,
    `https://api.bilibili.online/douyin?url=${encodeURIComponent(shareUrl)}`,
    `https://api.linhun.vip/api/douyin?url=${encodeURIComponent(shareUrl)}&apiKey=test`
  ];

  for (const api of apis) {
    try {
      const res = await axios.get(api, { timeout: 5000 });
      console.log('API:', api.split('?')[0], '->', JSON.stringify(res.data).substring(0, 120));
    } catch(e) {
      console.log('API failed:', api.split('?')[0], e.message);
    }
  }
}

main();
