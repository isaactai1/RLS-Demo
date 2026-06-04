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
- [ADHD Treatment Study — Patients (Demo)](https://www.notion.so/77e155aa30b94b5a9f28e9dc56448e63) — 10 個假病人，pro-grade 治療（MPH XR、Vyvanse、Atomoxetine、Guanfacine、Clonidine、合併治療等）

**ADHD Research Assistant** 工具會讀取上面 database，用 AI 回答研究跟進問題。
- 在 [notion.so/my-integrations](https://www.notion.so/my-integrations) 建立 integration，複製 **Internal Integration Secret** → Render 環境變數 `NOTION_TOKEN`
- 打開上述 database → **⋯** → **Connections** → 加入你的 integration

**上傳失敗（0 uploaded, 1 failed）常見原因：**

1. Render 未設定 `NOTION_TOKEN`（只設了 `POE_API_KEY` 不夠）
2. Integration 未連接到 demo database
3. 用錯 token（要用 Notion integration secret，唔係 Poe key）

## 本機執行

```bash
export POE_API_KEY=sk-poe-...
export NOTION_TOKEN=secret_...
npm install --no-bin-links
npm start
```

瀏覽：http://localhost:3000/

## 推送到 GitHub

Repo：https://github.com/isaactai1/RLS-Demo

更新程式後：

```bash
cd "/home/isaac-tai/pCloudDrive/Public Folder/RLS-Demo"
git add .
git commit -m "你的更新說明"
git push
```

**會 commit 嘅主要檔案：** `Index.html`、`tools.js`、`Research/`、`server.js`、`render.yaml`、`package.json`、`scripts/`、`README.md`、`.gitignore`

**唔會上傳：** `node_modules/`、`.env`（已在 `.gitignore`）

## 新增工具

在 `Research/`（或其他子資料夾）加 `.html` → `npm run generate-tools` → push → Render 自動 rebuild。
