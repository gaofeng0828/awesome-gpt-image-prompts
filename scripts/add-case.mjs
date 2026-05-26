import { createInterface } from 'node:readline';
import { readFileSync, writeFileSync, existsSync, copyFileSync } from 'node:fs';
import { dirname, join, resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const docsDir = join(root, 'docs');
const imagesDir = join(root, 'data', 'images');
const galleryFile = join(docsDir, 'gallery.md');

const rl = createInterface({
  input: process.stdin,
  output: process.stdout
});

function ask(question) {
  return new Promise(r => rl.question(question, r));
}

// 获取下一个案例编号
function getNextId() {
  const content = readFileSync(galleryFile, 'utf8');
  const matches = [...content.matchAll(/<a name="case-(\d+)"><\/a>/g)];
  if (matches.length === 0) return 1;
  return Math.max(...matches.map(m => Number(m[1]))) + 1;
}

async function main() {
  console.log('\n========================================');
  console.log('   GPT-Image2 提示词 - 快速添加工具');
  console.log('========================================\n');

  const nextId = getNextId();

  // 1. 标题
  const title = (await ask(`案例标题（例：赛博朋克城市海报）：`)).trim();
  if (!title) {
    console.log('标题不能为空，已取消。');
    rl.close();
    return;
  }

  // 2. 来源
  console.log('\n来源格式参考：');
  console.log('  X链接:   https://x.com/用户名/status/xxxx');
  console.log('  用户名:  @用户名');
  console.log('  其他:    随便写，如"小红书号xxx"或"社区分享"\n');
  const source = (await ask(`来源：`)).trim() || '未知来源';

  // 3. 图片
  console.log('\n图片处理方式：');
  console.log('  1. 输入图片文件的完整路径（如 /Users/xxx/Desktop/截图.jpg）');
  console.log('  2. 输入 skip 跳过（之后再手动放入图片）\n');
  const imageInput = (await ask(`图片路径或 skip：`)).trim();
  let imageRef = '';
  if (imageInput && imageInput !== 'skip') {
    const imgPath = resolve(imageInput);
    if (existsSync(imgPath)) {
      const ext = extname(imgPath) || '.jpg';
      const destName = `case${nextId}${ext}`;
      const destPath = join(imagesDir, destName);
      copyFileSync(imgPath, destPath);
      imageRef = `../data/images/${destName}`;
      console.log(`  图片已复制到 data/images/${destName}`);
    } else {
      console.log(`  文件不存在: ${imgPath}，跳过图片`);
    }
  } else {
    console.log('  跳过图片，之后记得把截图放入 data/images/ 目录');
  }

  // 4. 提示词
  console.log('\n粘贴提示词内容（输入单独一行 END 结束）：');
  const promptLines = [];
  while (true) {
    const line = await ask('');
    if (line.trim() === 'END') break;
    promptLines.push(line);
  }
  const prompt = promptLines.join('\n').trim();

  if (!prompt) {
    console.log('提示词不能为空，已取消。');
    rl.close();
    return;
  }

  // 5. 生成 Markdown
  const imageAlt = title;
  const imageBlock = imageRef
    ? `![${imageAlt}](${imageRef})`
    : `![${imageAlt}](../data/images/case${nextId}.jpg)`;

  // 处理来源格式
  let sourceBlock;
  if (source.startsWith('http')) {
    // 提取用户名
    const match = source.match(/https?:\/\/(?:x\.com|twitter\.com)\/([^/]+)/);
    const label = match ? `@${match[1]}` : source;
    sourceBlock = `[${label}](${source})`;
  } else {
    sourceBlock = source;
  }

  const newCase = `
<a name="case-${nextId}"></a>

### 例 ${nextId}：${title}

${imageBlock}

**来源：** ${sourceBlock}

**提示词：**

\`\`\`text
${prompt}
\`\`\`

***
`;

  // 6. 写入文件
  let content = readFileSync(galleryFile, 'utf8');

  // 在 "<!-- 在上方添加新案例" 注释前插入
  const insertMarker = /<!-- 在上方添加新案例.* -->/;
  if (insertMarker.test(content)) {
    content = content.replace(insertMarker, newCase + '\n' + insertMarker.source);
  } else {
    // 追加到文件末尾
    content = content.trimEnd() + '\n\n' + newCase;
  }

  writeFileSync(galleryFile, content, 'utf8');

  console.log('\n========================================');
  console.log(`  案例 #${nextId}「${title}」添加成功！`);
  console.log('========================================');
  console.log('\n接下来你可以：');
  console.log('  npm run dev       → 本地预览网站');
  console.log('  npm run generate  → 重新生成网站数据');
  console.log('  git push          → 推送到 GitHub，自动部署');
  console.log('');

  rl.close();
}

main().catch(err => {
  console.error('出错了:', err.message);
  rl.close();
});
