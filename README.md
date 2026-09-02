# 好物商城 — 全端電商 Demo

一份作品集專案：把原本 Shopify Dawn 主題（Liquid）的前台體驗——商品列表/詳情、規格選擇、購物車抽屜、結帳——重新實作成一套**完全獨立、不依賴 Shopify 執行環境**的全端應用。前台、後端 API、資料庫全部跑在 Cloudflare 的**免費方案**額度內，並補上會員系統、模擬付款流程、完整訂單生命週期與商品評價，貼近真實電商的使用情境。

**品牌**：「好物商城」是為了這個 Demo 虛構的多品類電商平台，視覺與版面語彙參考 PChome、momo 等台灣主流購物網站（密集網格、紅色主色調、限時搶購倒數、熱銷排行榜等）。商品橫跨 3C家電、美妝保養、時尚服飾、生活居家、食品雜貨五大類（約 26 件商品），全站文案為繁體中文，價格皆為新台幣（NT$）。商品照片使用 picsum.photos 的佔位圖，專案裡不含任何真實品牌、商品或客戶資料。前台（顧客瀏覽/會員/結帳）完全中文化；後台管理介面維持英文，作為「前台/後台」的介面區隔展示。

---

## 📹 前後台完整流程 Demo

![好物商城前後台使用者流程 Demo](docs/demo.gif)

錄製內容（前台 → 後台，一鏡到底）：**首頁瀏覽（限時搶購／熱銷排行榜）→ 點入商品 → 選規格 → 加入購物車 → 結帳付款 → 訂單成立確認頁 → 切換到賣家後台登入 → 在 Orders 看到剛剛那筆真實訂單 → 更新訂單狀態並自動產生物流追蹤碼 → 檢視 Inventory 庫存管理**。整段流程沒有任何假資料轉場——後台看到的訂單，就是前台實際送出的那一筆。

---

## 1. 技術架構

| 層 | 技術 | 說明 |
|---|---|---|
| 前台（Frontend） | 純 HTML + CSS + Vanilla JS | 無框架、無建置步驟，直接部署即可執行 |
| 後端 API（Backend） | Cloudflare Pages Functions | `/functions/api/**`，檔案路徑即路由（file-based routing） |
| 資料庫（Database） | Cloudflare D1 | 受管理的 SQLite，免費額度：5GB 儲存、每日 500 萬次讀取 |
| 部署（Hosting） | Cloudflare Pages 免費方案 | Pages + Functions + D1 三者皆落在免費額度內 |

### 架構決策說明

- **購物車放在前端（`localStorage`），但商品目錄／結帳／庫存都是後端（D1）權威資料。**
  購物車本質上是一次性、每個瀏覽器各自獨立的暫存狀態，沒必要每次點擊都同步到伺服器。但購物車裡顯示的價格/庫存只是「快取」：使用者按下「送出訂單」時（`functions/api/orders.js`），伺服器會重新從 D1 撈出每個商品/規格的真實價格與庫存、重新計算運費與稅金，庫存不足就直接擋單——**前端送來的價格永遠不被信任**。

- **付款是模擬的，但用真實的測試卡慣例**：結帳頁不會把完整卡號送到我方伺服器（`assets/js/checkout.js` 的 `simulatePayment()` 只在瀏覽器端「呼叫一個假的收單閘道」），送到後端的只有品牌與末四碼——這是真實金流串接（Stripe 等）的標準做法。測試卡號沿用業界慣例：`4242 4242 4242 4242` 一定成功、`4000 0000 0000 0002` 一定被拒絕，讓「付款失敗」這條路徑真的可以被展示，而不是永遠只有 happy path。運費與稅金規則比照台灣零售習慣：滿 NT$990 免運、未滿收 NT$80 運費，且**不額外加稅**（台灣零售價格依法已內含營業稅，不像美式 sales tax 會在結帳時另外加總）。

- **會員系統只做「足夠真實」的驗證，不做完整身分系統**：密碼用 PBKDF2-SHA256（`functions/lib/password.js`，Web Crypto 原生支援，非 bcrypt 但同樣是加鹽反覆雜湊）雜湊後存 D1，登入態一樣是 HMAC 簽章 cookie（`functions/lib/auth.js` 統一處理 admin／customer 兩種角色）。訪客結帳仍然可以不註冊，但登入後結帳會自動帶入姓名/Email，且訂單會與帳號關聯，可在「我的訂單」查詢。

- **訂單狀態是真正的時間序列，不是單一欄位**：`order_events` 表記錄每一次狀態轉換（含時間戳），下單時自動寫入 `pending`，後台切換到 `fulfilled` 時會自動產生一組模擬物流追蹤碼並寫入事件——前台訂單確認頁、會員訂單頁、後台都共用同一份 `orderTimelineHTML()` 邏輯渲染這條時間軸。

- **前台沒有用任何模板引擎。**
  `assets/js/chrome.js` 會在每個頁面的預留空白區塊（header/footer/購物車抽屜）動態注入共用內容，是「零建置工具」情境下取代 partials 的簡化做法。以目前的頁面規模，這樣比額外引入打包工具更好維護；但如果頁面數量再往上增加，就該考慮換成正式的靜態站生成器。

- **後台登入刻意做得很精簡**：只有一組密碼（`ADMIN_PASSWORD`），驗證後核發一個帶 HMAC 簽章、會過期的 cookie。沒有使用者資料表，因為這裡就只有「一位」demo 管理員。這樣的設計足以展示一個真實的「前後台驗證互動」，但**不是正式產品等級的身份驗證**（詳見下方「已知限制」）。

---

## 2. 專案目錄結構

```
├── public/                        # 前台靜態檔案（Cloudflare Pages 直接部署此資料夾）
│   ├── index.html                 # 首頁
│   ├── collection.html            # 商品列表頁（分類篩選、排序）
│   ├── product.html               # 商品詳情頁（規格選擇、評價、購物車）
│   ├── cart.html                  # 購物車頁面
│   ├── checkout.html              # 結帳頁（含模擬付款）
│   ├── order-confirmation.html    # 訂單確認頁（含狀態時間軸）
│   ├── account/
│   │   ├── login.html             # 會員登入
│   │   ├── register.html          # 會員註冊
│   │   └── orders.html            # 我的訂單（含訂單明細/時間軸）
│   ├── admin/
│   │   ├── login.html             # 後台登入
│   │   └── index.html             # 後台儀表板（訂單／庫存管理）
│   └── assets/
│       ├── css/style.css          # 全站樣式（CSS variables 作為設計 token）
│       └── js/
│           ├── api.js             # fetch 共用封裝
│           ├── cart.js            # localStorage 購物車狀態管理
│           ├── chrome.js          # 共用 header/footer/購物車抽屜渲染（含登入狀態）
│           ├── product-card.js    # 商品卡片元件（首頁、列表頁共用）
│           ├── star-rating.js     # 星等評分共用元件
│           ├── order-timeline.js  # 訂單狀態時間軸 + 金額明細共用元件
│           ├── home.js / collection.js / product.js / cart-page.js
│           ├── checkout.js / order-confirmation.js
│           ├── account-login.js / account-register.js / account-orders.js
│           └── admin.js           # 後台邏輯
│
├── functions/                     # 後端 API（Cloudflare Pages Functions）
│   ├── api/
│   │   ├── products.js            # GET  /api/products                商品列表（含平均星等）
│   │   ├── products/[id].js       # GET/PATCH /api/products/:id       商品詳情／改價
│   │   ├── reviews.js             # GET/POST /api/reviews             商品評價查詢／新增
│   │   ├── orders.js              # GET  /api/orders (後台)、POST 建立訂單（結帳，含運費/稅金試算）
│   │   ├── orders/[id].js         # GET/PATCH /api/orders/:id         訂單詳情／改狀態（自動產生追蹤碼）
│   │   ├── customers/
│   │   │   ├── register.js        # POST /api/customers/register      會員註冊
│   │   │   ├── login.js           # POST /api/customers/login         會員登入
│   │   │   ├── logout.js          # POST /api/customers/logout
│   │   │   ├── me.js              # GET  /api/customers/me            登入狀態檢查
│   │   │   └── orders.js          # GET  /api/customers/orders        我的訂單列表
│   │   └── admin/
│   │       ├── login.js           # POST /api/admin/login
│   │       ├── logout.js          # POST /api/admin/logout
│   │       ├── session.js         # GET  /api/admin/session           登入狀態檢查
│   │       └── variants/[id].js   # PATCH 修改單一規格庫存
│   └── lib/
│       ├── auth.js                # HMAC 簽章 session token（admin / customer 共用）
│       ├── password.js            # PBKDF2-SHA256 密碼雜湊
│       └── json.js                # JSON 回應共用工具
│
├── schema.sql                     # D1 資料表結構 + 種子資料（26 商品橫跨 5 大類、規格、34 則評價、1 個 demo 會員）
├── wrangler.toml                  # Cloudflare Pages + D1 binding 設定
├── package.json                   # npm scripts：dev / db:init / deploy
└── README.md
```

**資料表關聯**：`products` 1—N `product_variants`／`reviews`；`orders` 1—N `order_items`／`order_events`；`customers` 1—N `orders`（訪客結帳則為 NULL）。`order_items` 會保留下單當下的商品名稱／價格快照，即使之後商品被改名或調價也不影響歷史訂單。

---

## 3. 完整使用者流程

### 🛍️ 前台（顧客視角）

1. **首頁** `/index.html`
   促銷 Banner、分類快捷 icon、「⚡限時搶購」倒數計時區塊、「🔥熱銷排行榜 TOP 5」（依評價數排序，附 TOP 1-5 徽章）、五大分類各自的商品陳列列（每列即時呼叫 `GET /api/products` 取得資料）、新會員優惠券橫幅、品牌故事、電子報表單。

2. **商品列表** `/collection.html`
   依五大分類篩選與排序（最新／價格高低／名稱），篩選條件會反映在網址參數上，並重新呼叫 `GET /api/products?collection=&sort=`；header 的搜尋框會導到本頁並依關鍵字（比對商品名稱/描述）做前端篩選。

3. **商品詳情** `/product.html?slug=...`
   圖片相簿、規格色塊（缺貨自動不可選）、星等評分與評價列表（可直接留言評分，送出後即時顯示）、「🔥 N 人在 24 小時內瀏覽過」與「已售出 N 件」的動態提示、即時庫存提示、「最近瀏覽」區塊（依 `localStorage` 記錄），按下「加入購物車」打開購物車抽屜。

4. **購物車**
   右側滑出抽屜或完整的 `/cart.html` 頁面，兩者共用同一份 `localStorage` 購物車資料，透過自訂事件 `cart:updated` 保持同步。

5. **結帳** `/checkout.html`
   若已登入會自動帶入姓名／Email；填寫（或確認）資料 → 輸入卡號送出：
   - 前端先「呼叫」模擬付款閘道（`simulatePayment()`，約 1.2 秒延遲模擬真實網路請求）——`4000 0000 0000 0002` 會被拒絕並顯示錯誤（不建立訂單、不動庫存），其餘卡號視為成功
   - 付款「成功」後才送出 `POST /api/orders`：伺服器重新計算運費（滿 NT$990 免運，否則 NT$80）並驗證庫存（不額外加稅，比照台灣零售慣例），在 D1 建立訂單、訂單明細、扣庫存、寫入第一筆狀態事件，全部在同一次請求內完成

6. **訂單確認** `/order-confirmation.html?order=...`
   頁面會**重新**用剛拿到的訂單編號去資料庫查詢並顯示——證明訂單真的寫進資料庫。同時顯示付款方式（品牌＋末四碼）、狀態時間軸（已下單／已付款／已出貨）、完整金額明細（小計／運費／稅金／總計）。

### 👤 會員（可選，但登入後體驗更完整）— `/account/login.html`

- Demo 帳號：`demo@example.com` / `demo1234`，或自行註冊新帳號（享 NT$100 購物金優惠文案）
- 註冊／登入後，`chrome.js` 會把 header 的「會員登入」換成「Hi, {名字}」
- **我的訂單** `/account/orders.html`：列出所有屬於此帳號的歷史訂單，點一筆可展開查看明細與狀態時間軸

### 🔐 後台（店主視角）— `/admin/login.html`

7. **登入**：`POST /api/admin/login`，成功後核發 HttpOnly 的 session cookie（預設密碼 `demo1234`，可透過環境變數 `ADMIN_PASSWORD` 覆蓋）。

8. **訂單管理**：前台送出的每一筆訂單都會即時出現在這裡（含總金額、付款方式）；點一列可展開查看訂單明細與狀態時間軸，用下拉選單即可把狀態在「待處理／已付款／已出貨／已取消」之間切換（`PATCH /api/orders/:id`）——切到「已出貨」時系統會自動產生一組模擬物流追蹤碼，顧客端會立刻看到。

9. **庫存管理**：直接在表格裡修改任一商品的價格、任一規格的庫存數量，改完立刻反映到前台——例如把某個規格庫存改成 0，回到該商品詳情頁，該色塊會馬上變成不可選的「已售完」狀態。

> 這是一個真正閉環的系統：顧客在前台送出的訂單，背後是資料庫裡貨真價實的一筆紀錄，而且立刻能在後台被看到、被操作——不是前後台各自獨立的兩套假資料展示。

---

## 4. 本機開發

```bash
npm install                    # 安裝 wrangler（本機開發工具）
npm run db:init                # 依 schema.sql 建立本機 D1 資料庫並灌入種子資料
npm run dev                    # 啟動本機開發伺服器 → http://localhost:8788
```

可另外建立 `.dev.vars`（已加入 `.gitignore`）覆蓋本機的後台帳密：

```
ADMIN_PASSWORD=your-password
ADMIN_SECRET=some-long-random-string
```

不建立的話，本機預設密碼是 `demo1234`（後台與 `functions/lib/auth.js` 的 HMAC 簽章金鑰共用同一個 `ADMIN_SECRET`）。

---

## 5. 部署到 Cloudflare（免費方案）

```bash
npx wrangler login

# 1. 建立正式環境用的 D1 資料庫，並把回傳的 database_id 填進 wrangler.toml
npx wrangler d1 create haowu_mall

# 2. 把資料表結構與種子資料灌進正式資料庫
npm run db:init:remote

# 3. 建立 Pages 專案並部署
npx wrangler pages project create haowu-mall
npm run deploy
```

接著到 Cloudflare Dashboard →你的 Pages 專案 → **Settings → Environment variables**，新增正式環境用的 `ADMIN_PASSWORD` 與 `ADMIN_SECRET`（不要沿用預設密碼），存檔後重新部署一次即可生效。

Pages 託管、Pages Functions 執行次數、D1（每日 500 萬次讀取／5GB 儲存）——以作品集等級的流量來說，完全落在 Cloudflare 免費方案額度內。

---

## 6. 已知限制（Demo 性質，刻意簡化）

- **會員與後台驗證都是輕量版**：沒有 Email 驗證、忘記密碼、OAuth 第三方登入；後台仍是單一密碼、非多使用者系統。適合作品集展示，正式產品需要更完整的身分系統。
- **付款是模擬的**：測試卡邏輯只在瀏覽器端判斷，沒有串接真正的收單機構；完整卡號從未被讀取或送出，只有品牌＋末四碼會存進資料庫。
- **商品照片是佔位圖**（picsum.photos，依商品建立固定 seed 讓每次載入圖片一致），不是真實商品攝影。
- **物流追蹤碼是假的**：`fulfilled` 狀態會自動產生一組格式正確但無法真的查詢的追蹤碼（`HCT` 開頭，模擬「黑貓宅急便」），沒有對接真實物流商 API。
- **沒有寄送 Email**：確認頁面上寫「已寄送確認信」只是模擬文案，實際不會真的發信。
- **「N 人瀏覽過」「已售出 N 件」都是裝飾性數字**：依商品 ID＋當天日期做確定性雜湊算出，同一天重整頁面數字不變、隔天才會變，純粹是常見電商的社會認同（social proof）UI 手法，不是真實流量或銷量統計。
- **後台管理介面刻意維持英文**：以「前台繁體中文、後台英文」呈現介面分眾的概念，並非翻譯疏漏。

---

## 7. 與原專案的關係

這個資料夾原本放的是一套客製化的 Shopify **Dawn** 主題（MIT 授權），是為某真實客戶商店開發的。因為它依賴 Shopify 代管的 Liquid 執行環境、且內含該客戶的真實品牌內容，並不適合直接公開當作品集展示。本專案保留了原本前台的核心功能組合，並延伸出會員、模擬金流、訂單生命週期與評價系統，改用虛構品牌、從零重新實作成一套獨立的全端應用；後續再把前台改版為參考 PChome／momo 版面語彙的多品類商城、全站繁體中文化，因此可以自由部署、自由分享，也持續作為練習不同前端風格與在地化的基礎。
