#!/usr/bin/env node
/**
 * 一键发布：本地采集 + 本地构建 + 直推 gh-pages
 * 跳过 GitHub Actions，5-10 秒上线
 *
 * 用法: npm run publish -- "推文链接" "提示词内容"
 */

import { readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { dirname, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const docsDir = join(root, 'docs');
const dataDir = join(root, 'data');
const galleryFile = join(docsDir, 'gallery.md');
const casesFile = join(dataDir, 'cases.json');
const DEPLOY_DIR = '/tmp/gh-pages-deploy';

const OWNER = 'gaofeng0828';
const REPO = 'awesome-gpt-image-prompts';

// ===== 配置 =====

function loadEnv() {
  const envFile = join(root, '.env');
  if (!existsSync(envFile)) return {};
  return Object.fromEntries(
    readFileSync(envFile, 'utf8').split('\n')
      .map(l => l.match(/^([A-Z_]+)=(.+)$/))
      .filter(Boolean)
      .map(m => [m[1], m[2].trim()])
  );
}

const envVars = loadEnv();
const TOKEN = process.env.GITHUB_TOKEN || envVars.GITHUB_TOKEN;
const PROXY = process.env.HTTP_PROXY || process.env.HTTPS_PROXY || envVars.HTTP_PROXY || envVars.HTTPS_PROXY;

if (!TOKEN) { console.error('❌ 未找到 GITHUB_TOKEN，请在 .env 中配置'); process.exit(1); }
if (PROXY) console.log(`🌐 代理: ${PROXY}`);

const REMOTE_URL = `https://${OWNER}:${TOKEN}@github.com/${OWNER}/${REPO}.git`;

// ===== 参数 =====

const args = process.argv.slice(2);
if (args.length < 2) { console.log('用法: npm run publish -- "推文链接" "提示词内容"'); process.exit(1); }

const tweetUrl = args[0];
const userPrompt = args.slice(1).join(' ');

// ===== 工具 =====

function exec(cmd, cwd = root) {
  return execSync(cmd, { cwd, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
}

async function fetchJSON(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  return res.ok ? res.json() : null;
}

async function downloadImage(url) {
  if (PROXY) {
    const tmp = join(root, '.tmp_img');
    try {
      exec(`curl -sL --proxy "${PROXY}" -o "${tmp}" -H "User-Agent: Mozilla/5.0" -H "Referer: https://x.com/" "${url}"`);
      const buf = readFileSync(tmp);
      rmSync(tmp, { force: true });
      return buf.length > 1024 ? buf : null;
    } catch { return null; }
  }
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 AppleWebKit/537.36', 'Referer': 'https://x.com/' }
    });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return buf.length > 1024 ? buf : null;
  } catch { return null; }
}

function getNextId(content) {
  const m = [...content.matchAll(/<a name="case-(\d+)"><\/a>/g)];
  return m.length === 0 ? 1 : Math.max(...m.map(x => Number(x[1]))) + 1;
}

// ===== 主流程 =====

async function main() {
  const t0 = Date.now();

  // 1. 获取推文
  const tweetId = tweetUrl.match(/status\/(\d+)/)?.[1];
  const screenName = tweetUrl.match(/(?:x\.com|twitter\.com)\/([^/]+)/)?.[1];
  if (!tweetId) { console.error('❌ 无法解析推文链接'); process.exit(1); }

  console.log('📡 获取推文...');
  const data = await fetchJSON(`https://api.fxtwitter.com/${screenName || 'i'}/status/${tweetId}`);
  if (!data?.tweet) { console.error('❌ 获取推文失败'); process.exit(1); }

  const tweet = data.tweet;
  const author = tweet.author || {};
  const handle = author.screen_name || screenName || '';
  const tweetText = tweet.text || '';
  const actualUrl = tweet.url || tweetUrl;
  console.log(`👤 ${author.name || handle} (@${handle})`);

  // 标题
  const firstLine = tweetText.split('\n')[0].replace(/https?:\/\/\S+/g, '').replace(/[^\p{L}\p{N}\p{P}\p{S}\s]/gu, '').trim() || '案例';
  const title = firstLine.length > 40 ? firstLine.slice(0, 40) + '...' : firstLine;

  // 2. 下载图片
  let imageBuf = null, imageName = null;
  const photos = tweet.media?.photos || [];
  if (photos.length > 0) {
    console.log('🖼️  下载图片...');
    const ext = extname(new URL(photos[0].url).pathname) || '.jpg';
    imageBuf = await downloadImage(photos[0].url);
    if (imageBuf) {
      imageName = `case${getNextId(readFileSync(galleryFile, 'utf8'))}${ext}`;
      console.log(`  ✅ ${(imageBuf.length / 1024).toFixed(0)} KB`);
    }
  }

  // 3. 写入 gallery.md
  console.log('📝 构建案例...');
  let gallery = readFileSync(galleryFile, 'utf8');
  const nextId = getNextId(gallery);
  if (!imageName && imageBuf) {
    imageName = `case${nextId}${extname(new URL(photos[0].url).pathname) || '.jpg'}`;
  }

  const sourceLabel = handle ? `@${handle}` : '社区分享';
  const imageRef = imageName ? `../data/images/${imageName}` : `../data/images/case${nextId}.jpg`;

  const entry = `\n<a name="case-${nextId}"></a>\n\n### 例 ${nextId}：${title}\n\n![${title}](${imageRef})\n\n**来源：** [${sourceLabel}](${actualUrl})\n\n**提示词：**\n\n\`\`\`text\n${userPrompt}\n\`\`\`\n\n***\n`;

  const marker = /<!-- 在上方添加新案例[^>]*-->/;
  gallery = marker.test(gallery)
    ? gallery.replace(marker, entry + '\n' + marker.exec(gallery)[0])
    : gallery.trimEnd() + '\n' + entry;

  writeFileSync(galleryFile, gallery, 'utf8');
  if (imageBuf && imageName) writeFileSync(join(dataDir, 'images', imageName), imageBuf);

  // 4. 生成数据 + 构建
  exec('node scripts/generate-site-data.mjs');
  console.log('🔨 构建...');
  exec('npm run build');

  // 5. 推源码到 main
  console.log('⬆️  推送源码...');
  try {
    exec(`git add docs/gallery.md data/cases.json${imageName ? ` data/images/${imageName}` : ''}`);
    try { exec(`git commit -m "scrape: ${tweetUrl}"`); } catch {}
    try { exec('git push origin main'); } catch {
      exec('git pull --rebase origin main');
      exec('git push origin main');
    }
  } catch { console.log('  ⚠️  源码推送跳过'); }

  // 6. 推 dist 到 gh-pages（clone 方式，最稳定）
  console.log('🚀 部署 gh-pages...');
  rmSync(DEPLOY_DIR, { recursive: true, force: true });
  exec(`git clone --depth 1 -b gh-pages "${REMOTE_URL}" "${DEPLOY_DIR}"`);

  // 用 shell 命令确保在正确目录执行
  execSync(`cd "${DEPLOY_DIR}" && git rm -rf --ignore-unmatch .`, { stdio: 'pipe' });
  execSync(`rsync -a --delete --exclude='.git' "${join(root, 'dist')}/" "${DEPLOY_DIR}/"`, { stdio: 'pipe' });
  writeFileSync(join(DEPLOY_DIR, '.nojekyll'), '');

  console.log('  📦 添加文件...');
  execSync(`cd "${DEPLOY_DIR}" && git add -A`, { stdio: 'pipe' });

  try {
    execSync(`cd "${DEPLOY_DIR}" && git commit -m "deploy: case #${nextId}"`, { stdio: 'pipe' });
    execSync(`cd "${DEPLOY_DIR}" && git push origin gh-pages --force`, { stdio: 'pipe' });
  } catch {
    console.log('  ⚠️  无变更');
  }

  rmSync(DEPLOY_DIR, { recursive: true, force: true });

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log('');
  console.log('========================================');
  console.log(`✅ 案例 #${nextId} 发布成功！(${elapsed}s)`);
  console.log('========================================');
  console.log(`🔗 https://${OWNER}.github.io/${REPO}/`);
}

main().catch(err => { console.error('❌ 失败:', err.message); process.exit(1); });