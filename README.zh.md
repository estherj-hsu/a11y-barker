# A11y Barker

一個用於視覺化網頁無障礙狀態的 Chrome DevTools 擴充功能。

由金毛獵犬 Tifa 擔任你的 a11y 審查員——頁面乾淨她就開心，有問題她就難過，等待中她就帶著評判的眼神看你。

---

## 功能

### 視覺化 Overlay

| 功能 | 說明 |
|---|---|
| Tab 順序 | 標注可聚焦元素的鍵盤導覽順序 |
| SR 內容 | 顯示互動元素的 accessible name 與 role |
| Heading 結構 | 標注所有 h1–h6 層級；樹狀面板顯示完整結構 |
| aria-hidden | 用虛線框標注被隱藏的元素 |
| Issues | 在頁面上直接高亮有問題的元素 |

### 靜態規則檢查

| 規則 | WCAG | 等級 |
|---|---|---|
| 圖片缺少 alt | 1.1.1 | A |
| 空的 button 或 link | 4.1.2 | A |
| 表單欄位缺少 label | 1.3.1 / 4.1.2 | A |
| 正數 tabindex | 2.4.3 | A |
| 重複 landmark（未加標籤）| 1.3.1 | A |
| Heading 層級跳躍 | 1.3.1 | A |
| 模糊的連結文字 | 2.4.4 | A |
| 頁面缺少語言宣告 | 3.1.1 | A |
| Focus outline 被移除 | 2.4.7 | AA |
| 圖片過大（>1MB）| — | Best practice |

### SPA 支援

MutationObserver 監聽 DOM 及屬性變更（`hidden`、`aria-hidden`、`style`、`class`），自動重跑分析。Dropdown 展開、Modal 出現或路由切換後，overlay 仍然保持正確。

---

## 計畫中

- **AI alt 品質檢查** — 使用者自帶 API key，分析 alt 品質並給出改善建議（TODO）
- **AI heading 結構審查** — 將 heading 樹狀結構送給 AI 進行語意分析，補足靜態規則無法判斷的情境（TODO）
- **匯出報告** — 將問題清單匯出為 JSON 或 HTML

---

## 技術架構

```
a11y-barker/
├── manifest.json               # Manifest V3
├── background.js               # Service worker — AI API 轉發
├── content.js                  # 主邏輯：DOM 分析 + overlay 協調
├── rules-registry.js           # 所有規則的 WCAG metadata
├── panel.html / panel.js       # DevTools panel UI
├── devtools.html / devtools.js # DevTools panel 註冊
├── utils/
│   └── dom.js                  # 共用 DOM 工具函式（分組、排序）
├── overlay/
│   ├── index.js                # Shadow DOM host + 共用 helper
│   ├── coordinator.js          # 統一管理 badge 定位，防止重疊
│   ├── TabOverlay.js           # Tab 順序 + SR 內容 badge 資料
│   ├── HeadingOverlay.js       # Heading badge 資料
│   ├── AriaHiddenOverlay.js    # aria-hidden badge 資料 + outline 樣式
│   ├── IssuesOverlay.js        # 無其他 overlay 時的 issue badge fallback
│   └── HeadingTreePanel.js     # 固定在右下角的 heading 樹狀面板
├── analyzer/
│   ├── tabOrder.js             # 可聚焦元素順序計算
│   ├── srContent.js            # Accessible name 計算（簡化版 accname）
│   ├── staticRules.js          # 所有靜態規則檢查
│   └── imageHealth.js          # 圖片大小檢查（Performance API）
├── ai/
│   └── altChecker.js           # Claude API 串接（TODO）
├── popup/
│   ├── popup.html
│   └── popup.js
└── assets/
    └── dog/                    # Tifa SVG 素材
```

---

## 關鍵設計決策

**Shadow DOM 樣式隔離**
所有 overlay badge 都在 Shadow DOM 內，頁面樣式不會污染 overlay，overlay 樣式也不會影響受測頁面。

**Badge coordinator 統一定位**
由單一 coordinator 收集所有 overlay 的 badge 資料，依元素分組後垂直堆疊，避免重疊。堆疊計算使用實際渲染高度，確保定位精準。

**Issues 的顯示策略**
有問題的元素，其既有 badge（tab、heading、aria-hidden）會變成紅色。若該元素沒有其他 overlay badge，則單獨渲染一個紅色 issue badge。因此 Issues toggle 可以獨立運作，不依賴其他 overlay 開啟。

**AI 呼叫走 background.js**
AI 請求透過 service worker 轉發，避免 CORS。API key 存在 `chrome.storage.local`，不經過任何自建後端。

**圖片大小用 Performance API**
圖片大小從 `performance.getEntriesByType('resource')` 讀取，不需要額外的網路請求。

**AI 檢查需手動觸發**
Alt 品質分析需使用者主動觸發，避免 API 被意外呼叫產生費用。
