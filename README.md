# RLS Demo

研究工具集：**首頁 Index** 列出所有工具，點擊後在 iframe 內開啟；後端用 **Poe API**（預設 `gemini-3.1-flash-lite`）與 Notion 上傳。

## App 結構

```
Index.html          ← 主頁（部署後 https://你的網域/）
tools.js            ← 工具清單（build 時自動產生）
Research/           ← 各 HTML 工具
server.js           ← Express：靜態檔 + /api/*
render.yaml         ← Render Blueprint
```

## 用 Render Blueprint 部署

1. 將專案 **push 到 GitHub**（見下方說明）。
2. [Render](https://render.com) → **New** → **Blueprint** → 連接 repo。
3. 設定 secret：`POE_API_KEY`、`NOTION_TOKEN`（可選，上傳 Notion 才需要）。
4. 完成後首頁：`https://rls-demo-xxxx.onrender.com/`

### Notion demo 資料庫

- [PubMed Research Extractor — Demo](https://www.notion.so/b34bd47e6a11414fbee75d51d79994e7)

## 本機執行

```bash
export POE_API_KEY=sk-poe-...
export NOTION_TOKEN=secret_...
npm install --no-bin-links
npm start
```

瀏覽：http://localhost:3000/

## 推送到 GitHub（第一次）

此資料夾**尚未**是 git repo。你需要：

| 步驟 | 做咩 |
|------|------|
| 1 | 去 [github.com/new](https://github.com/new) 開空 repo（例如 `RLS-Demo`），**唔好**勾 README |
| 2 | 在本機專案目錄執行下面指令 |
| 3 | Render Blueprint 連接該 GitHub repo |

```bash
cd "/home/isaac-tai/pCloudDrive/Public Folder/RLS-Demo"

git init
git add .
git commit -m "Initial RLS Demo app with Render Blueprint"

git branch -M main
git remote add origin https://github.com/你的帳號/RLS-Demo.git
git push -u origin main
```

**會 commit 嘅主要檔案：** `Index.html`、`tools.js`、`Research/`、`server.js`、`render.yaml`、`package.json`、`scripts/`、`README.md`、`.gitignore`

**唔會上傳：** `node_modules/`、`.env`（已在 `.gitignore`）

## 新增工具

在 `Research/`（或其他子資料夾）加 `.html` → `npm run generate-tools` → push → Render 自動 rebuild。
