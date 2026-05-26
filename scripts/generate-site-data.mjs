import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const docsDir = join(root, 'docs');
const dataDir = join(root, 'data');
const outFile = join(dataDir, 'cases.json');
const categoriesFile = join(dataDir, 'categories.json');

// 读取分类定义
const categoriesConfig = JSON.parse(readFileSync(categoriesFile, 'utf8'));
const categoryDefs = categoriesConfig.categories;

function cleanText(value = '') {
  return value
    .replace(/\\_/g, '_')
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .trim();
}

function stripMarkdown(value = '') {
  return cleanText(value)
    .replace(/\*\*/g, '')
    .replace(/`/g, '')
    .replace(/\[(.*?)\]\((.*?)\)/g, '$1')
    .trim();
}

// 从提示词文本推断分类
function inferCategory(title, prompt) {
  const text = `${title} ${prompt}`.toLowerCase();
  for (const cat of categoryDefs) {
    if (cat.keywords.length === 0) continue; // 跳过"其他"
    if (cat.keywords.some(kw => text.includes(kw))) {
      return cat.id;
    }
  }
  return 'other';
}

// 从提示词文本推断标签
function inferTags(title, prompt) {
  const text = `${title} ${prompt}`.toLowerCase();
  const tags = [];

  const tagRules = [
    ['极简', ['极简', 'minimal', 'minimalist', '简洁']],
    ['科技', ['科技', 'tech', '科技感', '赛博', '未来']],
    ['3D', ['3d', '三维', '立体', 'c4d', 'blender']],
    ['扁平', ['扁平', 'flat', '平面']],
    ['复古', ['复古', 'retro', 'vintage', '怀旧', '老']],
    ['写实', ['写实', 'realistic', '真实', 'photo']],
    ['卡通', ['卡通', 'cartoon', '可爱', 'q版', '萌']],
    ['中国风', ['中国风', '国风', '古风', '水墨', '山水', '传统']],
    ['日系', ['日系', '日本', '动漫', 'anime', 'manga']],
    ['商务', ['商务', 'business', '企业', '公司', '品牌']],
    ['创意', ['创意', 'creative', '独特', '新颖', '概念']],
    ['暗色', ['暗色', 'dark', '深色', '黑色主题']],
  ];

  for (const [tag, keys] of tagRules) {
    if (keys.some(kw => text.includes(kw))) {
      tags.push(tag);
    }
  }
  return tags;
}

// 解析画廊 Markdown 文件
function parseGallery(filePath) {
  const text = readFileSync(filePath, 'utf8');
  const cases = [];

  // 按 <a name="case-N"> 分割
  const blocks = text.split(/<a name="case-(\d+)"><\/a>/g);

  // blocks[0] 是文件头部，之后每两个一组：caseId + 内容
  for (let i = 1; i < blocks.length; i += 2) {
    const id = Number(blocks[i]);
    const block = blocks[i + 1] || '';

    // 提取标题：### 例 N：标题
    const titleMatch = block.match(/###\s*例\s*\d+[：:]\s*(.+)/);
    const title = titleMatch ? titleMatch[1].trim() : `案例 ${id}`;

    // 提取图片：![alt](path)
    const imgMatch = block.match(/!\[([^\]]*)\]\(([^)]+)\)/);
    let image = '';
    let imageAlt = '';
    if (imgMatch) {
      imageAlt = imgMatch[1];
      image = imgMatch[2].replace(/^\.\.\/data\//, '/');
    }

    // 提取提示词：**提示词：** ... ```text ... ```
    const promptMatch = block.match(/\*\*提示词[：:]\*\*[\s\S]*?```(?:text)?\n([\s\S]*?)```/);
    const prompt = promptMatch ? cleanText(promptMatch[1]) : '';

    // 提取来源：**来源：** xxx
    const sourceMatch = block.match(/\*\*来源[：:]\*\*\s*([^\n]+)/);
    let sourceLabel = '未知来源';
    let sourceUrl = '';
    if (sourceMatch) {
      const sourceLine = sourceMatch[1].trim();
      const linkMatch = sourceLine.match(/\[([^\]]+)\]\(([^)]+)\)/);
      if (linkMatch) {
        sourceLabel = stripMarkdown(linkMatch[1]);
        sourceUrl = linkMatch[2];
      } else {
        sourceLabel = stripMarkdown(sourceLine);
        // 检测是否是 URL
        const urlMatch = sourceLine.match(/https?:\/\/[^\s)]+/);
        if (urlMatch) sourceUrl = urlMatch[0];
      }
    }

    // 推断分类和标签
    const category = inferCategory(title, prompt);
    const tags = inferTags(title, prompt);

    // 预览文本（截取前 120 字）
    const promptPreview = prompt.length > 120 ? prompt.slice(0, 120) + '...' : prompt;

    cases.push({
      id,
      title,
      image,
      imageAlt,
      sourceLabel,
      sourceUrl,
      prompt,
      promptPreview,
      category,
      tags,
      githubUrl: ''
    });
  }

  return cases;
}

// 主流程
console.log('开始解析画廊数据...');

const galleryFiles = ['gallery.md'];
let allCases = [];

for (const file of galleryFiles) {
  const filePath = join(docsDir, file);
  try {
    const cases = parseGallery(filePath);
    console.log(`  ${file}: 解析到 ${cases.length} 个案例`);
    allCases.push(...cases);
  } catch (err) {
    console.error(`  ${file}: 解析失败 - ${err.message}`);
  }
}

// 填充 GitHub URL
const repoUrl = 'https://github.com/gaofeng0828/awesome-gpt-image-prompts';
allCases = allCases.map(c => ({
  ...c,
  githubUrl: `${repoUrl}/blob/main/docs/gallery.md#case-${c.id}`
}));

// 统计分类数量
const categoryCounts = {};
for (const c of allCases) {
  categoryCounts[c.category] = (categoryCounts[c.category] || 0) + 1;
}

// 收集所有标签
const allTags = [...new Set(allCases.flatMap(c => c.tags))].sort();

const output = {
  repository: repoUrl,
  totalCases: allCases.length,
  categories: categoryDefs.map(c => ({
    ...c,
    count: categoryCounts[c.id] || 0
  })),
  tags: allTags,
  cases: allCases
};

writeFileSync(outFile, JSON.stringify(output, null, 2), 'utf8');
console.log(`生成完成！共 ${allCases.length} 个案例 → ${outFile}`);
