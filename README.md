# GPT-Image2 提示词画廊

收集、分类、分享优质 AI 绘图提示词。自动从 X (Twitter) 采集，生成画廊网站。

## 快速开始

```bash
# 1. 安装依赖（只需一次）
npm install

# 2. 本地预览
npm run dev
```

## 采集提示词

### 自动采集（推荐）

从 X (Twitter) 自动采集提示词和图片：

```bash
# 采集单个推文
npm run scrape -- "https://x.com/用户名/status/推文ID"

# 采集多个推文
npm run scrape -- "https://x.com/a/status/111" "https://x.com/b/status/222"

# 从文件批量采集（每行一个链接）
npm run scrape -- --file urls.txt
```

采集会自动完成：获取推文内容 → 下载图片 → 提取提示词 → 添加到画廊 → 重新生成网站数据。

### 代理设置（国内用户）

如果在国内使用，需要配置代理来下载图片。复制 `.env.example` 为 `.env`：

```bash
cp .env.example .env
```

编辑 `.env`，填入代理地址：

```
HTTP_PROXY=http://127.0.0.1:7890
```

### 手动添加

如果不想自动采集，也可以手动添加：

```bash
npm run add
```

按提示输入标题、来源、图片路径和提示词即可。

### 在线发布（无需本地环境）

部署后访问 `https://你的用户名.github.io/awesome-gpt-image-prompts/admin.html`

1. 粘贴 X/Twitter 链接
2. 首次使用需填入 GitHub Personal Access Token（[创建 Token →](https://github.com/settings/tokens/new?scopes=repo,workflow&description=GPT-Image2%20Scraper)）
3. 点击「发布到画廊」

系统会自动触发 GitHub Actions，在服务器上完成采集、提交、部署，约 2-3 分钟后刷新即可看到新案例。

**优点：** 无需安装 Node.js，无需配置代理，手机/平板也能用。

## 推送到 GitHub

```bash
git add .
git commit -m "添加新案例"
git push
```

推送后 GitHub Actions 自动部署网站。

## 项目结构

```
├── docs/gallery.md          ← 案例数据（自动/手动添加）
├── data/
│   ├── images/              ← 案例截图（自动下载）
│   ├── categories.json      ← 分类定义
│   ├── cases.json           ← [自动生成] 网站数据
│   └── admin.html           ← 在线发布管理页
├── scripts/
│   ├── scrape-x.mjs         ← X 自动采集脚本（本地）
│   ├── scrape-and-deploy.sh ← GitHub Actions 采集脚本（服务器）
│   ├── add-case.mjs         ← 手动添加工具
│   └── generate-site-data.mjs ← 数据生成脚本
├── src/                     ← 网站前端
└── .github/workflows/       ← 自动部署 + 在线采集
```

## 命令一览

| 命令 | 作用 |
|---|---|
| `npm run scrape -- <url>` | 从 X 自动采集提示词 |
| `npm run add` | 交互式手动添加 |
| `npm run generate` | 重新生成网站数据 |
| `npm run dev` | 本地预览网站 |
| `npm run build` | 构建生产版本 |

## 部署到 GitHub Pages

1. 在 GitHub 创建仓库
2. 进入 Settings → Pages → Source 选 **GitHub Actions**
3. 推送代码，自动部署

网站地址：`https://你的用户名.github.io/awesome-gpt-image-prompts/`

## License

MIT

