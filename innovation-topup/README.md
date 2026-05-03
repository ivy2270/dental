# 禾新餐費管理系統 (Innovation Meal Expense Manager)

這是一個基於 HTML + Google Apps Script (GAS) + Google Sheets 的輕量級餐費管理系統。

## 功能特點
- **儲值制管理**：自動計算人員餘額，負值即時提醒。
- **櫃台專用介面**：適合放置於公共電腦，由管理員操作。
- **快速批次輸入**：兩階段選擇人員，快速登錄每日午餐、飲料等支出。
- **歷史紀錄查詢**：即時調閱個人消費與儲值明細。
- **安全機制**：透過自定義 API Key 進行資料傳輸驗證。

## 快速開始

### 1. 準備 Google Sheets
建立一個新的 Google 試算表，並新增以下三個分頁：

#### `Users` 分頁
| Name | Balance | IsActive |
| :--- | :--- | :--- |
| 王小明 | 0 | TRUE |

*註：`Balance` 建議使用公式或由 GAS 自動更新。*

#### `Log` 分頁
| Timestamp | Name | Type | Category | Amount | Note |
| :--- | :--- | :--- | :--- | :--- | :--- |

#### `Config` 分頁
| SettingName | SettingValue |
| :--- | :--- |
| API_KEY | 你的自定義密鑰 |

### 2. 部署 Google Apps Script
1. 在試算表中點選 `延伸功能` -> `Apps Script`。
2. 貼入 `backend/code.gs` 的程式碼。
3. 點選 `部署` -> `新增部署`，選擇 `網頁應用程式`。
4. 設定「誰可以存取」為 `任何人` (Anyone)。
5. 複製產生的 Web App URL。

### 3. 設定前端網頁
1. 開啟 `frontend/script.js`。
2. 將 `const API_URL = '...';` 替換為你的 Web App URL。
3. 將網頁檔案上傳至 GitHub 並啟用 GitHub Pages。
4. **使用說明**：開啟網頁時，系統會要求輸入「管理金鑰」，請輸入您在 `Config` 分頁設定的 `API_KEY`。金鑰只會保存在目前的瀏覽視窗中，關閉後需重新輸入。

## 專案結構
- `/frontend`: 包含 HTML、CSS 與 JS 檔案。
- `/backend`: 包含 `code.gs` 程式碼。
- `/plans`: 系統設計與開發計畫。
