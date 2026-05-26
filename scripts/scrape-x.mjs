import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { dirname, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const docsDir = join(root, 'docs');
const imagesDir = join(root, 'data', 'images');
const galleryFile = join(docsDir, 'gallery.md');
const categoriesFile = join(root, 'data', 'categories.json');

// 加载 .env 文件中的代理配置
let proxyUrl = '';
const envFile = join(root, '.env');
if (existsSync(envFile)) {
  const envContent = readFileSync(envFile, 'utf8');
  const proxyMatch = envContent.match(/^HTTP_PROXY=(.+)$/m) ||
                     envContent.match(/^HTTPS_PROXY=(.+)$/m);
  if (proxyMatch) proxyUrl = proxyMatch[1].trim();
}
if (proxyUrl) console.log(`🌐 使用代理: ${proxyUrl}\n`);

// ===== 工具函数 =====

function fetchJSON(url) {
  try {
    const result = execSync(
      `curl -sL "${url}" -H "User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"`,
      { timeout: 15000, encoding: 'utf8' }
    );
    return JSON.parse(result);
  } catch {
    return null;
  }
}

function downloadImage(url, destPath) {
  try {
    const proxyFlag = proxyUrl ? `--proxy "${proxyUrl}"` : '';
    execSync(
      `curl -sL ${proxyFlag} -o "${destPath}" -H "User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36" -H "Referer: https://x.com/" "${url}"`,
      { timeout: 30000 }
    );
    // 检查文件是否有效（大于1KB说明不是错误页面）
    if (existsSync(destPath)) {
      const stat = statSync(destPath);
      return stat.size > 1024;
    }
    return false;
  } catch {
    return false;
  }
}

function extractTweetId(url) {
  // 支持格式:
  // https://x.com/user/status/123456
  // https://twitter.com/user/status/123456
  // 纯数字 123456
  const match = url.match(/status\/(\d+)/);
  if (match) return match[1];
  if (/^\d+$/.test(url.trim())) return url.trim();
  return null;
}

function extractScreenName(url) {
  const match = url.match(/(?:x\.com|twitter\.com)\/([^/]+)/);
  return match ? match[1] : null;
}

// 从文本中提取提示词
function extractPrompt(text) {
  if (!text) return '';

  // 策略1: 找 ``` 代码块
  const codeBlock = text.match(/```[\s\S]*?```/);
  if (codeBlock) return codeBlock[0].replace(/```/g, '').trim();

  // 策略2: 找 "提示词：" 后面的内容
  const promptLabel = text.match(/(?:提示词|prompt)[：:]\s*([\s\S]+)/i);
  if (promptLabel) return promptLabel[1].trim();

  // 策略3: 整段文本就是提示词（如果足够长且不含推文特征）
  // 推文特征：大量emoji开头行、@mention、#hashtag、"转发"/"评论"等
  const lines = text.split('\n').filter(l => l.trim());
  const tweetSignals = ['转发', '评论', '点赞', '关注', 'retweet', 'follow', 'http'];
  const isTweetLike = lines.filter(l =>
    tweetSignals.some(s => l.toLowerCase().includes(s))
  ).length > 2;

  if (!isTweetLike && text.length > 50) {
    return text.trim();
  }

  return '';
}

// 获取下一个案例编号
function getNextId() {
  const content = readFileSync(galleryFile, 'utf8');
  const matches = [...content.matchAll(/<a name="case-(\d+)"><\/a>/g)];
  if (matches.length === 0) return 1;
  return Math.max(...matches.map(m => Number(m[1]))) + 1;
}

// 推断分类
function inferCategory(title, prompt) {
  const config = JSON.parse(readFileSync(categoriesFile, 'utf8'));
  const text = `${title} ${prompt}`.toLowerCase();
  for (const cat of config.categories) {
    if (cat.keywords.length === 0) continue;
    if (cat.keywords.some(kw => text.includes(kw))) return cat.id;
  }
  return 'other';
}

// ===== 采集单个推文 =====

async function scrapeTweet(tweetUrl) {
  const tweetId = extractTweetId(tweetUrl);
  const screenName = extractScreenName(tweetUrl);
  if (!tweetId) {
    console.log(`  ❌ 无法解析链接: ${tweetUrl}`);
    return null;
  }

  // 1. 通过 fxtwitter API 获取推文数据
  console.log(`  📡 获取推文数据...`);
  const apiUrl = `https://api.fxtwitter.com/${screenName || 'i'}/status/${tweetId}`;
  const data = fetchJSON(apiUrl);

  if (!data || data.code !== 200 || !data.tweet) {
    console.log(`  ❌ 获取失败，推文可能已删除或为私密`);
    return null;
  }

  const tweet = data.tweet;
  const author = tweet.author || {};
  const authorName = author.name || author.screen_name || screenName || '未知';
  const authorHandle = author.screen_name || screenName || '';

  console.log(`  👤 作者: ${authorName} (@${authorHandle})`);

  // 2. 提取提示词
  console.log(`  📝 提取提示词...`);
  let prompt = extractPrompt(tweet.text || '');
  let title = '';

  if (!prompt) {
    // 推文本身没有提示词，用推文文本作为标题描述
    // 清理推文文本，去掉emoji和链接
    const cleanText = (tweet.text || '')
      .replace(/https?:\/\/\S+/g, '')
      .replace(/[^\p{L}\p{N}\p{P}\p{S}\s]/gu, '')
      .trim();

    // 取第一行作为标题
    const firstLine = cleanText.split('\n')[0]?.trim() || `案例`;
    title = firstLine.length > 30 ? firstLine.slice(0, 30) + '...' : firstLine;
    prompt = tweet.text || '';
    console.log(`  ⚠️  未在推文中找到明确的提示词格式，使用推文全文`);
  } else {
    // 从提示词中提取标题
    const firstLine = prompt.split('\n')[0]?.trim() || '';
    title = firstLine.length > 40 ? firstLine.slice(0, 40) + '...' : firstLine;
    if (!title) title = `案例`;
  }

  // 3. 下载图片
  const photos = tweet.media?.photos || [];
  const nextId = getNextId();
  let imageRef = '';

  if (photos.length > 0) {
    console.log(`  🖼️  下载 ${photos.length} 张图片...`);
    // 下载第一张作为封面
    const photoUrl = photos[0].url;
    const ext = extname(new URL(photoUrl).pathname) || '.jpg';
    const imageName = `case${nextId}${ext}`;
    const imagePath = join(imagesDir, imageName);

    if (downloadImage(photoUrl, imagePath)) {
      imageRef = `../data/images/${imageName}`;
      console.log(`  ✅ 封面已保存: ${imageName}`);
    } else {
      console.log(`  ⚠️  图片下载失败`);
    }
  }

  // 4. 构建来源信息
  const sourceLabel = `@${authorHandle}`;
  const sourceUrl = tweet.url || tweetUrl;

  return {
    id: nextId,
    title,
    image: imageRef,
    sourceLabel,
    sourceUrl,
    prompt,
    tweetText: tweet.text
  };
}

// ===== 写入画廊 =====

function addToGallery(caseData) {
  const imageBlock = caseData.image
    ? `![${caseData.title}](${caseData.image})`
    : `![${caseData.title}](../data/images/case${caseData.id}.jpg)`;

  const newCase = `
<a name="case-${caseData.id}"></a>

### 例 ${caseData.id}：${caseData.title}

${imageBlock}

**来源：** [${caseData.sourceLabel}](${caseData.sourceUrl})

**提示词：**

\`\`\`text
${caseData.prompt}
\`\`\`

***
`;

  let content = readFileSync(galleryFile, 'utf8');
  const insertMarker = /<!-- 在上方添加新案例[^>]*-->/;
  const match = content.match(insertMarker);

  if (match) {
    // 在标记前插入新案例，保留原标记
    content = content.replace(insertMarker, newCase + '\n' + match[0]);
  } else {
    content = content.trimEnd() + '\n\n' + newCase;
  }

  writeFileSync(galleryFile, content, 'utf8');
}

// ===== 主流程 =====

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log('\n========================================');
    console.log('   GPT-Image2 提示词 - X 自动采集工具');
    console.log('========================================\n');
    console.log('用法:');
    console.log('  node scripts/scrape-x.mjs <X链接1> [链接2] [链接3] ...');
    console.log('');
    console.log('示例:');
    console.log('  node scripts/scrape-x.mjs https://x.com/user/status/123456');
    console.log('  node scripts/scrape-x.mjs https://x.com/a/status/111 https://x.com/b/status/222');
    console.log('');
    console.log('也支持从文件批量读取（每行一个链接）:');
    console.log('  node scripts/scrape-x.mjs --file urls.txt');
    console.log('');
    return;
  }

  let urls = [];

  if (args[0] === '--file') {
    const filePath = args[1];
    if (!filePath || !existsSync(filePath)) {
      console.log(`文件不存在: ${filePath}`);
      return;
    }
    urls = readFileSync(filePath, 'utf8')
      .split('\n')
      .map(l => l.trim())
      .filter(l => l && !l.startsWith('#'));
    console.log(`📂 从文件读取到 ${urls.length} 个链接\n`);
  } else {
    urls = args;
  }

  console.log(`\n🚀 开始采集 ${urls.length} 个推文...\n`);

  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    console.log(`[${i + 1}/${urls.length}] ${url}`);

    const result = await scrapeTweet(url);

    if (result) {
      addToGallery(result);
      console.log(`  ✅ 案例 #${result.id}「${result.title}」已添加\n`);
      successCount++;
    } else {
      failCount++;
      console.log('');
    }

    // 间隔 1 秒，避免请求过快
    if (i < urls.length - 1) {
      execSync('sleep 1');
    }
  }

  console.log('========================================');
  console.log(`采集完成！成功 ${successCount} 个，失败 ${failCount} 个`);
  console.log('========================================\n');

  if (successCount > 0) {
    // 自动重新生成网站数据
    console.log('🔄 重新生成网站数据...');
    try {
      execSync('node scripts/generate-site-data.mjs', {
        cwd: root,
        stdio: 'inherit'
      });
    } catch {
      console.log('生成失败，请手动运行 npm run generate');
    }
  }
}

main();
