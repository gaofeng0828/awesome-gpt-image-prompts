# GPT-Image2 提示词画廊

收集 X/Twitter 上的 AI 绘图提示词，生成可浏览的画廊网站，部署到 GitHub Pages。

## 添加提示词的三种方式

| 方式 | 命令 / 入口 | 适用场景 |
|---|---|---|
| X 自动采集 | `npm run scrape -- <tweet-url>` | 本地有 Node.js 环境 |
| 交互式手动添加 | `npm run add` | 不想写 Markdown |
| 在线发布 | 访问 `admin.html`，粘贴链接 | 无本地环境，手机/平板 |

在线发布通过 GitHub Actions `workflow_dispatch` 实现，需要 Personal Access Token（`repo` + `workflow` 权限），Token 保存在浏览器 localStorage。

## 代理配置（国内必须）

下载 `pbs.twimg.com` 图片需要代理。复制 `.env.example` 为 `.env`，填入代理地址：

```
HTTP_PROXY=http://127.0.0.1:7890
HTTPS_PROXY=http://127.0.0.1:7890
```

`scrape-x.mjs` 读取 `.env`，在 `curl` 命令中加 `--proxy` 参数。GitHub Actions 服务器在海外，不需要代理。

## 数据流

```
docs/gallery.md  →  scripts/generate-site-data.mjs  →  data/cases.json
                                                              ↓
                                                src/main.jsx (fetch)
```

- `gallery.md` 是唯一数据源，所有添加方式最终都写入这个文件
- `cases.json` 是生成产物，不要手动编辑
- 添加案例后必须运行 `npm run generate` 重新生成 JSON

## 图片路径规则

- 图片存放在 `data/images/caseN.jpg`
- Markdown 中写 `../data/images/caseN.jpg`
- `src/main.jsx` 中引用加 `.` 前缀：`` `.${caseItem.image}` ``
- `vite.config.js` 的 `publicDir: 'data'` 使图片可通过 `/images/caseN.jpg` 访问

## Vite 配置

- `base: '/awesome-gpt-image-prompts/'` — GitHub Pages 路径
- `publicDir: 'data'` — data 目录作为静态资源根
- `server.host: '127.0.0.1'` — 防止绑定到不可用地址

## 部署

- `deploy.yml`：push 到 main 触发，构建 + 部署到 GitHub Pages
- `scrape.yml`：`workflow_dispatch` 触发，运行 `scrape-and-deploy.sh`，提交 + 推送

## 技术栈

React 19 + Vite 6 + lucide-react，纯 CSS，单文件 React 组件（`src/main.jsx`）。中文界面。字体：JetBrains Mono + Noto Sans SC。
