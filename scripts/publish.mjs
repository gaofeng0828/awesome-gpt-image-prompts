#!/usr/bin/env node
/**
 * 一键发布：本地采集 + 本地构建 + 直推 gh-pages 分支
 * 跳过 GitHub Actions，约 5-10 秒上线
 *
 * 用法: npm run publish -- "推文链接" "提示词内容"
 * 首次使用: 需在 GitHub 仓库 Settings → Pages → Source 改为 "Deploy from a branch"，分支选 gh-pages
 */

import { readFileSync, writeFileSync, existsSync, statSync, mkdirSync } from 'node:fs';
import { dirname, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const docsDir = join(root, 'docs');
const dataDir = join(root, 'data');
const galleryFile = join(docsDir, 'gallery.md');
const categoriesFile = join(dataDir, 'categories.json');
const casesFile = join(dataDir, 'cases.json');
const wtDir = join(root, '.claude', 'gh-pages-wt');

const OWNER = 'gaofeng0828';
const REPO = 'awesome-gpt-image-prompts';

// ===== 配置加载 =====

function loadEnv() {
  const envFile = join(root, '.env');
  if (!existsSync(envFile)) return {};
  const content = readFileSync(envFile, 'utf8');
  const env = {};
  for (const line of content.split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.+)$/);
    if (m) env[m[1]] = m[2].trim();
  }
  return env;
}

const envVars = loadEnv();
const TOKEN = process.env.GITHUB_TOKEN || envVars.GITHUB_TOKEN;
const PROXY = process.env.HTTP_PROXY || process.env.HTTPS_PROXY || envVars.HTTP_PROXY || envVars.HTTPS_PROXY;

if (!TOKEN) {
  console.error('❌ 未找到 GitHub Token，请在 .env 中添加: GITHUB_TOKEN=ghp_xxxx');
  process.exit(1);
}

if (PROXY) console.log(`🌐 代理: ${PROXY}`);

// ===== 参数 =====

const args = process.argv.slice(2);
if (args.length < 2) {
  console.log('用法: npm run publish -- "推文链接" "提示词内容"');
  process.exit(1);
}

const tweetUrl = args[0];
const userPrompt = args.slice(1).join(' ');

// ===== 工具 =====

function exec(cmd, opts = {}) {
  return execSync(cmd, { cwd: root, encoding: 'utf8', ...opts }).trim();
}

function execSilent(cmd, cwd = root) {
  execSync(cmd, { cwd, stdio: 'pipe' });
}

async function fetchJSON(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' }
  });
  if (!res.ok) return null;
  return res.json();
}

async function downloadImage(url) {
  if (PROXY) {
    const tmp = join(root, '.tmp_img.jpg');
    try {
      execSilent(`curl -sL --proxy "${PROXY}" -o "${tmp}" -H "User-Agent: Mozilla/5.0" -H "Referer: https://x.com/" "${url}"`);
      const data = readFileSync(tmp);
      execSilent(`rm -f "${tmp}"`);
      return data.length > 1024 ? data : null;
    } catch { return null; }
  }
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36', 'Referer': 'https://x.com/' }
    });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return buf.length > 1024 ? buf : null;
  } catch { return null; }
}

function getNextId(content) {
  const matches = [...content.matchAll(/<a name="case-(\d+)"><\/a>/g)];
  return matches.length === 0 ? 1 : Math.max(...matches.map(m => Number(m[1]))) + 1;
}

// ===== 主流程 =====

async function main() {
  const t0 = Date.now();

  // 解析推文
  const tweetIdMatch = tweetUrl.match(/status\/(\d+)/);
  const screenNameMatch = tweetUrl.match(/(?:x\.com|twitter\.com)\/([^/]+)/);
  if (!tweetIdMatch) { console.error('❌ 无法解析推文链接'); process.exit(1); }

  const tweetId = tweetIdMatch[1];
  const screenName = screenNameMatch?.[1];

  // 获取推文数据
  console.log('📡 获取推文数据...');
  const data = await fetchJSON(`https://api.fxtwitter.com/${screenName || 'i'}/status/${tweetId}`);
  if (!data || data.code !== 200 || !data.tweet) { console.error('❌ 获取推文失败'); process.exit(1); }

  const tweet = data.tweet;
  const author = tweet.author || {};
  const authorHandle = author.screen_name || screenName || '';
  const authorName = author.name || authorHandle || '未知';
  const tweetText = tweet.text || '';
  const tweetUrlActual = tweet.url || tweetUrl;

  console.log(`👤 ${authorName} (@${authorHandle})`);

  // 标题
  const firstLine = tweetText.split('\n')[0]
    .replace(/https?:\/\/\S+/g, '')
    .replace(/[^\p{L}\p{N}\p{P}\p{S}\s]/gu, '')
    .trim() || '案例';
  const title = firstLine.length > 40 ? firstLine.slice(0, 40) + '...' : firstLine;

  // 下载图片
  let imageBuf = null;
  let imageName = null;
  const photos = tweet.media?.photos || [];

  if (photos.length > 0) {
    console.log('🖼️  下载图片...');
    const photoUrl = photos[0].url;
    const ext = extname(new URL(photoUrl).pathname) || '.jpg';
    imageBuf = await downloadImage(photoUrl);
    if (imageBuf) {
      imageName = `case${getNextId(readFileSync(galleryFile, 'utf8'))}${ext}`;
      console.log(`  ✅ ${(imageBuf.length / 1024).toFixed(0)} KB`);
    }
  }

  // 构建 gallery.md 条目
  console.log('📝 构建案例...');
  let galleryContent = readFileSync(galleryFile, 'utf8');
  const nextId = getNextId(galleryContent);

  if (!imageName && imageBuf) {
    const ext = extname(new URL(photos[0].url).pathname) || '.jpg';
    imageName = `case${nextId}${ext}`;
  }

  const sourceLabel = authorHandle ? `@${authorHandle}` : '社区分享';
  const imageRef = imageName ? `../data/images/${imageName}` : `../data/images/case${nextId}.jpg`;

  const newEntry = `
<a name="case-${nextId}"></a>

### 例 ${nextId}：${title}

![${title}](${imageRef})

**来源：** [${sourceLabel}](${tweetUrlActual})

**提示词：**

\`\`\`text
${userPrompt}
\`\`\`

***
`;

  const marker = /<!-- 在上方添加新案例[^>]*-->/;
  if (marker.test(galleryContent)) {
    galleryContent = galleryContent.replace(marker, newEntry + '\n' + marker.exec(galleryContent)[0]);
  } else {
    galleryContent = galleryContent.trimEnd() + '\n' + newEntry;
  }

  // 保存文件
  writeFileSync(galleryFile, galleryContent, 'utf8');
  if (imageBuf && imageName) {
    writeFileSync(join(dataDir, 'images', imageName), imageBuf);
  }

  // 生成 cases.json
  exec('node scripts/generate-site-data.mjs');
  const casesJsonContent = readFileSync(casesFile, 'utf8');

  // 后台推送源码到 main
  console.log('⬆️  推送源码...');
  try {
    exec(`git add docs/gallery.md data/cases.json${imageName ? ` data/images/${imageName}` : ''}`);
    exec(`git commit -m "scrape: ${tweetUrl}"`);
    exec('git push origin main');
  } catch (e) {
    console.log('  ⚠️  源码推送失败（不影响发布）');
  }

  // 本地构建
  console.log('🔨 构建网站...');
  exec('npm run build');

  // 推送到 gh-pages 分支
  console.log('🚀 部署 gh-pages...');

  // 初始化 worktree（仅首次）
  if (!existsSync(wtDir)) {
    mkdirSync(dirname(wtDir), { recursive: true });
    try {
      exec(`git worktree add --track -b gh-pages "${wtDir}" origin/gh-pages`);
    } catch {
      // 分支可能已存在但未 track
      try {
        exec(`git worktree add "${wtDir}" gh-pages`);
      } catch {
        // 全新创建
        exec(`git worktree add -b gh-pages "${wtDir}"`);
        execSilent('git checkout --orphan gh-pages', wtDir);
        execSilent('git rm -rf .', wtDir);
      }
    }
  }

  // 清空 worktree 并复制 dist
  execSilent('git rm -rf --ignore-unmatch .', wtDir);
  execSilent(`rsync -a --delete dist/ "${wtDir}/"`);
  writeFileSync(join(wtDir, '.nojekyll'), '');
  execSilent('git add -A', wtDir);

  try {
    execSilent(`git commit -m "deploy: case #${nextId}"`, wtDir);
    execSilent('git push origin gh-pages --force', wtDir);
  } catch {
    console.log('  ⚠️  无新内容需要部署');
  }

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log('');
  console.log('========================================');
  console.log(`✅ 发布成功！案例 #${nextId}「${title}」  (${elapsed}s)`);
  console.log('========================================');
  console.log(`🔗 https://${OWNER}.github.io/${REPO}/`);
}

main().catch(err => {
  console.error('❌ 发布失败:', err.message);
  process.exit(1);
});