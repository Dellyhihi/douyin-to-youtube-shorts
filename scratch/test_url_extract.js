function extractUrls(text) {
  if (!text) return [];
  // Match any http/https URL anywhere in the string
  const urlMatches = [...text.matchAll(/https?:\/\/[^\s"'<>\u4e00-\u9fa5，,]+/gi)].map(m => m[0]);
  if (urlMatches.length > 0) {
    return Array.from(new Set(urlMatches.map(u => u.replace(/[.,!?;:)\]>]+$/, ''))));
  }
  // If user pasted without https (e.g. v.douyin.com/xxx)
  const noHttpMatches = [...text.matchAll(/(?:v\.douyin\.com|douyin\.com|tiktok\.com)\/[^\s"'<>\u4e00-\u9fa5，,]+/gi)].map(m => 'https://' + m[0]);
  if (noHttpMatches.length > 0) {
    return Array.from(new Set(noHttpMatches.map(u => u.replace(/[.,!?;:)\]>]+$/, ''))));
  }
  return [];
}

console.log('1. Normal link:', extractUrls('https://v.douyin.com/qLENPvwvgvw/'));
console.log('2. Share text with chinese:', extractUrls('5.87 06/04 icN:/ :8pm W@m.dn 悟空队vs超人队 https://v.douyin.com/qLENPvwvgvw/ 复制此链接，打开Dou音搜索，直接观看视频！'));
console.log('3. Multiple links in one paragraph:', extractUrls('check this https://v.douyin.com/qLENPvwvgvw/ and also https://v.douyin.com/ZqPAlD5Yaw8/ wow'));
console.log('4. Link without https:', extractUrls('v.douyin.com/qLENPvwvgvw/'));
