// 賣家後台。左側固定導覽 + 右側工作區，四個主要區塊（訂單、商品與庫存、
// 會員、操作紀錄）各自是一個 view；訂單詳情與商品表單是從列表推進去的子頁面。
// 所有畫面都是同一支 script 渲染，資料一律來自 /api/*，沒有假資料。

const STATUSES = ["pending", "paid", "fulfilled", "cancelled"];
const COLLECTIONS = ["3C家電", "美妝保養", "時尚服飾", "生活居家", "食品雜貨"];
const LOW_STOCK_THRESHOLD = 5;
const PAGE_SIZE = 10;

const titleEl = document.getElementById("page-title");
const subtitleEl = document.getElementById("page-subtitle");
const actionsEl = document.getElementById("page-actions");
const viewEl = document.getElementById("admin-view");

let ordersCache = [];
let productsCache = [];
let ordersPage = 1;
let catalogPage = 1;

// ---------- 小工具 ----------

// 客戶姓名、商品名稱等等都是使用者輸入，一律轉義後才進 innerHTML
function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]
  );
}

function icon(name, size = 18) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><use href="#i-${name}"></use></svg>`;
}

function flash(message, isError = true) {
  document.querySelector(".admin-flash")?.remove();
  const el = document.createElement("div");
  el.className = `admin-flash admin-flash--${isError ? "error" : "success"}`;
  el.setAttribute("role", "status");
  el.textContent = message;
  document.body.appendChild(el);
  clearTimeout(flash._timer);
  flash._timer = setTimeout(() => el.remove(), 4000);
}

function setHeader(title, subtitle, actions = "") {
  titleEl.textContent = title;
  subtitleEl.textContent = subtitle;
  actionsEl.innerHTML = actions;
}

function loading(message = "載入中…") {
  viewEl.innerHTML = `<p class="text-muted">${esc(message)}</p>`;
}

function dollars(cents) {
  return (cents / 100).toFixed(0);
}

// 「防水藍牙喇叭 等 2 件」——只有一件時不加後綴
function itemSummary(order) {
  if (!order.first_item_title) return "—";
  const title = esc(order.first_item_title);
  return order.item_count > 1 ? `${title} 等 ${order.item_count} 件` : title;
}

function shortDate(sqliteUtc) {
  if (!sqliteUtc) return "—";
  return new Date(sqliteUtc.replace(" ", "T") + "Z").toLocaleDateString("zh-TW");
}

// ---------- 導覽 ----------

function switchView(view, options = {}) {
  document.querySelectorAll(".admin-sidebar__link").forEach((b) => {
    b.classList.toggle("is-active", b.dataset.view === view);
  });
  window.scrollTo({ top: 0 });
  if (view === "orders") return options.orderId ? renderOrderDetail(options.orderId) : renderOrders();
  if (view === "catalog") return options.form ? renderProductForm(options.productId) : renderCatalog();
  if (view === "customers") return renderCustomers();
  if (view === "activity") return renderActivity();
}

// ---------- 訂單：統計卡 ----------

function renderStats(orders) {
  const now = new Date();
  const pending = orders.filter((o) => o.status === "pending").length;
  const monthRevenue = orders
    .filter((o) => {
      if (o.status === "cancelled") return false;
      const d = new Date(o.created_at.replace(" ", "T") + "Z");
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    })
    .reduce((sum, o) => sum + o.total_cents, 0);
  const cancelled = orders.filter((o) => o.status === "cancelled").length;
  const cancelledRecently = orders.filter(
    (o) => o.status === "cancelled" && Date.now() - new Date(o.created_at.replace(" ", "T") + "Z") < 30 * 864e5
  ).length;

  const cards = [
    { label: "待處理訂單", value: pending, hint: "已下單、待付款／出貨", primary: true },
    { label: "本月營收", value: formatPrice(monthRevenue), hint: "不含已取消訂單" },
    { label: "訂單總數", value: orders.length, hint: "目前資料庫全部訂單" },
    { label: "已取消訂單", value: cancelled, hint: `近 30 天 ${cancelledRecently} 筆` },
  ];

  const badge = document.getElementById("nav-pending");
  badge.textContent = pending;
  badge.hidden = pending === 0;

  return `<div class="admin-stats">
    ${cards
      .map(
        (c) => `<div class="admin-stat-card${c.primary ? " admin-stat-card--primary" : ""}">
        <div class="admin-stat-card__label">${c.label}</div>
        <div class="admin-stat-card__value">${c.value}</div>
        <div class="admin-stat-card__hint">${c.hint}</div>
      </div>`
      )
      .join("")}
  </div>`;
}

// ---------- 訂單：近 30 天營收折線圖 ----------

// 座標系固定 1092×240，靠 viewBox 隨容器縮放；單一數列所以不需要圖例，
// 只在最高點與最新一天做直接標示，其餘交給 X／Y 軸。
function renderRevenueChart(orders) {
  const DAYS = 30;
  const W = 1092;
  const H = 240;
  const PL = 62;
  const PR = 24;
  const PT = 18;
  const PB = 30;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const buckets = [];
  for (let i = DAYS - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    buckets.push({ date: d, cents: 0 });
  }
  const firstDay = buckets[0].date.getTime();

  for (const o of orders) {
    if (o.status === "cancelled") continue;
    const d = new Date(o.created_at.replace(" ", "T") + "Z");
    d.setHours(0, 0, 0, 0);
    const index = Math.round((d.getTime() - firstDay) / 864e5);
    if (index >= 0 && index < DAYS) buckets[index].cents += o.total_cents;
  }

  const total = buckets.reduce((sum, b) => sum + b.cents, 0);
  const peak = buckets.reduce((best, b) => (b.cents > best.cents ? b : best), buckets[0]);

  // Y 軸上界取 1／2／5 × 10^n 裡第一個裝得下資料的值，讓格線落在整數上
  const rawMax = Math.max(peak.cents, 1000);
  const magnitude = 10 ** Math.floor(Math.log10(rawMax));
  const niceMax = [1, 2, 5, 10].map((m) => m * magnitude).find((v) => v >= rawMax) ?? rawMax;

  const x = (i) => PL + (i * (W - PL - PR)) / (DAYS - 1);
  const y = (cents) => PT + (1 - cents / niceMax) * (H - PT - PB);

  const points = buckets.map((b, i) => [x(i), y(b.cents)]);
  const line = points.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ");
  const area = `${line} L${x(DAYS - 1).toFixed(1)} ${y(0).toFixed(1)} L${PL.toFixed(1)} ${y(0).toFixed(1)} Z`;

  const gridValues = [0, 0.25, 0.5, 0.75, 1].map((r) => Math.round(niceMax * r));
  const grid = gridValues
    .map(
      (v) =>
        `<line class="admin-chart__grid${v === 0 ? " admin-chart__grid--base" : ""}" x1="${PL}" y1="${y(v).toFixed(1)}" x2="${W - PR}" y2="${y(v).toFixed(1)}"></line>`
    )
    .join("");
  const yLabels = gridValues
    .map(
      (v, i) =>
        `<text class="admin-chart__axis" x="${PL - 10}" y="${(y(v) + 4).toFixed(1)}" text-anchor="end">${i === gridValues.length - 1 ? "NT$" : ""}${priceFormatter.format(v / 100)}</text>`
    )
    .join("");
  const xLabels = [0, 6, 12, 18, 24, DAYS - 1]
    .map((i) => {
      const d = buckets[i].date;
      const anchor = i === 0 ? "start" : i === DAYS - 1 ? "end" : "middle";
      return `<text class="admin-chart__axis" x="${x(i).toFixed(1)}" y="${H - 10}" text-anchor="${anchor}">${d.getMonth() + 1}/${String(d.getDate()).padStart(2, "0")}</text>`;
    })
    .join("");

  const peakIndex = buckets.indexOf(peak);
  const lastIndex = DAYS - 1;
  const marks = [];
  if (peak.cents > 0) {
    marks.push(
      `<circle class="admin-chart__dot" cx="${x(peakIndex).toFixed(1)}" cy="${y(peak.cents).toFixed(1)}" r="4.5"></circle>`,
      `<text class="admin-chart__label" x="${x(peakIndex).toFixed(1)}" y="${(y(peak.cents) - 11).toFixed(1)}" text-anchor="middle">${formatPrice(peak.cents)}</text>`
    );
  }
  if (peakIndex !== lastIndex && buckets[lastIndex].cents > 0) {
    marks.push(
      `<circle class="admin-chart__dot" cx="${x(lastIndex).toFixed(1)}" cy="${y(buckets[lastIndex].cents).toFixed(1)}" r="4.5"></circle>`,
      `<text class="admin-chart__label" x="${(x(lastIndex) - 12).toFixed(1)}" y="${(y(buckets[lastIndex].cents) - 4).toFixed(1)}" text-anchor="end">${formatPrice(buckets[lastIndex].cents)}</text>`
    );
  }

  const peakLabel = `${peak.date.getMonth() + 1}/${peak.date.getDate()}`;

  return `<div class="admin-card admin-chart">
    <div class="admin-card__head">
      <h2>近 30 天營收趨勢</h2>
      <span class="admin-card__meta">期間合計 <strong>${formatPrice(total)}</strong>${peak.cents > 0 ? `　·　單日最高 ${peakLabel}` : ""}</span>
    </div>
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="近 30 天每日營收折線圖，期間合計 ${formatPrice(total)}">
      <defs>
        <linearGradient id="admin-rev-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#c33a50" stop-opacity="0.16"></stop>
          <stop offset="100%" stop-color="#c33a50" stop-opacity="0"></stop>
        </linearGradient>
      </defs>
      ${grid}
      ${yLabels}
      <path class="admin-chart__area" d="${area}"></path>
      <path class="admin-chart__line" d="${line}"></path>
      ${marks.join("")}
      ${xLabels}
    </svg>
  </div>`;
}

// ---------- 訂單列表 ----------

function filterOrders(keyword, status) {
  const q = keyword.trim().toLowerCase();
  return ordersCache.filter((o) => {
    const matchesStatus = status === "all" || o.status === status;
    const matchesQuery =
      !q ||
      o.order_number.toLowerCase().includes(q) ||
      o.customer_name.toLowerCase().includes(q) ||
      o.customer_email.toLowerCase().includes(q);
    return matchesStatus && matchesQuery;
  });
}

function pager(total, page, onPage) {
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const from = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const to = Math.min(total, page * PAGE_SIZE);
  const numbers = [];
  for (let p = 1; p <= pages; p++) {
    if (pages > 7 && p !== 1 && p !== pages && Math.abs(p - page) > 1) {
      if (numbers[numbers.length - 1] !== "…") numbers.push("…");
      continue;
    }
    numbers.push(p);
  }

  const wrap = document.createElement("div");
  wrap.className = "admin-pager";
  wrap.innerHTML = `<span>顯示第 ${from}–${to} 筆，共 ${total} 筆</span>
    <span class="admin-pager__pages">
      <button type="button" data-page="${page - 1}" ${page === 1 ? "disabled" : ""} aria-label="上一頁">${icon("arrow-left", 16)}</button>
      ${numbers
        .map((n) =>
          n === "…"
            ? `<span>…</span>`
            : `<button type="button" data-page="${n}" ${n === page ? 'aria-current="page"' : ""}>${n}</button>`
        )
        .join("")}
      <button type="button" data-page="${page + 1}" ${page === pages ? "disabled" : ""} aria-label="下一頁">${icon("chevron-right", 16)}</button>
    </span>`;
  wrap.querySelectorAll("button[data-page]").forEach((b) => {
    b.addEventListener("click", () => {
      const next = Number(b.dataset.page);
      if (next >= 1 && next <= pages) onPage(next);
    });
  });
  return wrap;
}

function renderOrdersTable(orders) {
  const wrap = document.getElementById("orders-table-wrap");
  if (orders.length === 0) {
    wrap.innerHTML = `<div class="admin-table-card"><p class="empty-state">找不到符合條件的訂單。</p></div>`;
    return;
  }

  const start = (ordersPage - 1) * PAGE_SIZE;
  const pageRows = orders.slice(start, start + PAGE_SIZE);

  wrap.innerHTML = `<div class="admin-table-card">
    <table class="admin-table">
      <thead>
        <tr><th>訂單編號</th><th>客戶</th><th>下單時間</th><th>商品</th><th class="num">總計</th><th>狀態</th><th></th></tr>
      </thead>
      <tbody>
        ${pageRows
          .map(
            (o) => `<tr class="order-row" data-id="${o.id}" tabindex="0" role="button" aria-label="查看訂單 ${esc(o.order_number)}">
            <td data-label="訂單編號" class="nowrap"><span class="admin-table__code">${esc(o.order_number)}</span></td>
            <td data-label="客戶"><b>${esc(o.customer_name)}</b><span class="admin-table__sub">${esc(o.customer_email)}</span></td>
            <td data-label="下單時間" class="nowrap text-muted">${formatDateTime(o.created_at)}</td>
            <td data-label="商品">${itemSummary(o)}</td>
            <td data-label="總計" class="num"><strong>${formatPrice(o.total_cents)}</strong></td>
            <td data-label="狀態">
              <select class="status-select status-select--${o.status}" data-id="${o.id}" aria-label="訂單 ${esc(o.order_number)} 狀態">
                ${STATUSES.map((s) => `<option value="${s}" ${s === o.status ? "selected" : ""}>${STATUS_LABEL[s]}</option>`).join("")}
              </select>
            </td>
            <td><span class="admin-table__chevron">${icon("chevron-right", 16)}</span></td>
          </tr>`
          )
          .join("")}
      </tbody>
    </table>
  </div>`;

  wrap.querySelector(".admin-table-card").appendChild(
    pager(orders.length, ordersPage, (p) => {
      ordersPage = p;
      renderOrdersTable(orders);
    })
  );

  wrap.querySelectorAll(".status-select").forEach((select) => {
    select.addEventListener("click", (e) => e.stopPropagation());
    select.addEventListener("keydown", (e) => e.stopPropagation());
    select.addEventListener("change", async (e) => {
      const id = Number(e.target.dataset.id);
      const order = ordersCache.find((o) => o.id === id);
      const previous = order?.status;
      e.target.disabled = true;
      try {
        await Api.patch(`/api/orders/${id}`, { status: e.target.value });
        if (order) order.status = e.target.value;
        e.target.className = `status-select status-select--${e.target.value}`;
        flash("訂單狀態已更新", false);
      } catch (err) {
        if (previous) e.target.value = previous;
        flash(err.message);
      } finally {
        e.target.disabled = false;
      }
    });
  });

  wrap.querySelectorAll(".order-row").forEach((row) => {
    const open = () => switchView("orders", { orderId: row.dataset.id });
    row.addEventListener("click", (e) => {
      if (e.target.closest("select")) return;
      open();
    });
    row.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        open();
      }
    });
  });
}

async function renderOrders() {
  setHeader("訂單管理", "前台送出的訂單即時進來，狀態變更會同步回客戶的訂單追蹤頁");
  loading("訂單載入中…");

  const { orders } = await Api.get("/api/orders");
  ordersCache = orders;
  ordersPage = 1;

  if (orders.length === 0) {
    viewEl.innerHTML = `<p class="empty-state">目前尚無訂單——請先從前台結帳建立一筆訂單。</p>`;
    return;
  }

  viewEl.innerHTML = `
    ${renderStats(orders)}
    ${renderRevenueChart(orders)}
    <div class="admin-toolbar">
      <label class="admin-search">
        ${icon("search", 17)}
        <input type="search" id="order-search" placeholder="搜尋訂單編號、客戶姓名或 Email" aria-label="搜尋訂單">
      </label>
      <select class="admin-select" id="order-status-filter" aria-label="依訂單狀態篩選">
        <option value="all">所有狀態</option>
        ${STATUSES.map((s) => `<option value="${s}">${STATUS_LABEL[s]}</option>`).join("")}
      </select>
      <span class="admin-toolbar__spacer"></span>
      <span class="admin-toolbar__count">共 ${orders.length} 筆訂單</span>
    </div>
    <div id="orders-table-wrap"></div>
  `;

  renderOrdersTable(ordersCache);

  const refresh = () => {
    ordersPage = 1;
    renderOrdersTable(
      filterOrders(
        document.getElementById("order-search").value,
        document.getElementById("order-status-filter").value
      )
    );
  };
  document.getElementById("order-search").addEventListener("input", refresh);
  document.getElementById("order-status-filter").addEventListener("change", refresh);
}

// ---------- 訂單詳情 ----------

function infoLine(iconName, label, value) {
  return `<div class="admin-info-line">${icon(iconName, 17)}<span><b>${label}</b><span>${esc(value)}</span></span></div>`;
}

async function renderOrderDetail(id) {
  setHeader("訂單詳情", "載入中…");
  loading();

  const { order } = await Api.get(`/api/orders/${id}`);

  setHeader(
    `訂單 ${order.order_number}`,
    `下單於 ${formatDateTime(order.created_at)}　·　${order.customer_name}`,
    `<span class="status-pill status-pill--${order.status}">${STATUS_LABEL[order.status]}</span>`
  );

  const itemCount = order.items.reduce((n, i) => n + i.quantity, 0);

  viewEl.innerHTML = `
    <button class="admin-back" type="button" id="back-to-orders">${icon("arrow-left", 16)} 回訂單列表</button>
    <div class="admin-split">
      <div>
        <div class="admin-card">
          <div class="admin-card__head"><h2>訂單商品</h2><span class="admin-card__meta">共 ${itemCount} 件</span></div>
          ${order.items
            .map(
              (i) => `<div class="admin-line-item">
              <span class="admin-thumb">${icon("image", 18)}</span>
              <span class="admin-line-item__body">
                <b>${esc(i.title)}</b>
                <span>${i.variant_label ? `${esc(i.variant_label)}　·　` : ""}數量 ${i.quantity}</span>
              </span>
              <span class="admin-line-item__price">${formatPrice(i.price_cents * i.quantity)}</span>
            </div>`
            )
            .join("")}
          <div class="admin-total"><span>小計</span><strong>${formatPrice(order.subtotal_cents)}</strong></div>
          <div class="admin-total"><span>運費</span><strong>${order.shipping_cents === 0 ? "免運" : formatPrice(order.shipping_cents)}</strong></div>
          ${order.tax_cents > 0 ? `<div class="admin-total"><span>稅金</span><strong>${formatPrice(order.tax_cents)}</strong></div>` : ""}
          <div class="admin-total admin-total--grand"><strong>總計</strong><strong>${formatPrice(order.total_cents)}</strong></div>
        </div>
        <div class="admin-card">
          <div class="admin-card__head"><h2>出貨進度</h2></div>
          ${orderTimelineHTML(order)}
        </div>
      </div>
      <div>
        <div class="admin-card">
          <div class="admin-card__head"><h2>訂單狀態</h2></div>
          <select class="admin-select" id="detail-status" style="width:100%;margin-bottom:12px;" aria-label="變更訂單狀態">
            ${STATUSES.map((s) => `<option value="${s}" ${s === order.status ? "selected" : ""}>${STATUS_LABEL[s]}</option>`).join("")}
          </select>
          <button class="btn btn--accent btn--block" type="button" id="detail-save">儲存狀態</button>
          <p class="admin-hint">狀態變更會寫入操作紀錄，並即時反映到客戶的訂單追蹤頁。</p>
        </div>
        <div class="admin-card">
          <div class="admin-card__head"><h2>客戶與收件資訊</h2></div>
          ${infoLine("users", "客戶", order.customer_name)}
          ${infoLine("mail", "Email", order.customer_email)}
          ${infoLine("pin", "收件地址", order.shipping_address)}
          ${order.payment_card_brand ? infoLine("card", "付款方式", `${order.payment_card_brand} 末四碼 ${order.payment_card_last4}`) : ""}
        </div>
      </div>
    </div>
  `;

  document.getElementById("back-to-orders").addEventListener("click", () => switchView("orders"));

  const statusSelect = document.getElementById("detail-status");
  const saveBtn = document.getElementById("detail-save");
  saveBtn.addEventListener("click", async () => {
    if (statusSelect.value === order.status) {
      flash("狀態沒有變更", false);
      return;
    }
    saveBtn.disabled = true;
    try {
      await Api.patch(`/api/orders/${order.id}`, { status: statusSelect.value });
      flash("訂單狀態已更新", false);
      renderOrderDetail(order.id);
    } catch (err) {
      flash(err.message);
      statusSelect.value = order.status;
    } finally {
      saveBtn.disabled = false;
    }
  });
}

// ---------- 商品與庫存 ----------

function stockPill(n) {
  if (n === 0) return `<span class="stock-pill stock-pill--out">售罄</span>`;
  if (n <= LOW_STOCK_THRESHOLD) return `<span class="stock-pill stock-pill--low">偏低</span>`;
  return `<span class="stock-pill stock-pill--ok">充足</span>`;
}

function filterProducts(keyword, collection, stock) {
  const q = keyword.trim().toLowerCase();
  return productsCache.filter((p) => {
    if (collection !== "all" && p.collection !== collection) return false;
    if (q && !p.title.toLowerCase().includes(q) && !p.slug.toLowerCase().includes(q)) return false;
    if (stock === "low") return p.variants.some((v) => v.inventory <= LOW_STOCK_THRESHOLD);
    if (stock === "out") return p.variants.some((v) => v.inventory === 0);
    return true;
  });
}

function renderCatalogTable(products) {
  const wrap = document.getElementById("catalog-table-wrap");
  if (products.length === 0) {
    wrap.innerHTML = `<div class="admin-table-card"><p class="empty-state">找不到符合條件的商品。</p></div>`;
    return;
  }

  const start = (catalogPage - 1) * PAGE_SIZE;
  const pageRows = products.slice(start, start + PAGE_SIZE);

  wrap.innerHTML = `<div class="admin-table-card">
    <table class="admin-table">
      <thead>
        <tr><th>商品</th><th>分類</th><th>售價</th><th>規格</th><th>庫存</th><th>狀態</th><th></th></tr>
      </thead>
      <tbody>
        ${pageRows
          .map((p) => {
            const list = p.variants.length ? p.variants : [null];
            return list
              .map(
                (v, i) => `<tr>
              <td data-label="商品">${
                i === 0
                  ? `<span class="admin-cell-product"><span class="admin-thumb">${icon("image", 18)}</span><span><b>${esc(p.title)}</b><span class="slug">${esc(p.slug)}</span></span></span>`
                  : ""
              }</td>
              <td data-label="分類">${i === 0 ? `<span class="admin-chip">${esc(p.collection)}</span>${p.status === "draft" ? ` <span class="admin-chip">草稿</span>` : ""}` : ""}</td>
              <td data-label="售價" class="nowrap">${
                i === 0
                  ? `<span class="inline-price"><span>NT$</span><input class="inline-input price-input" data-product="${p.id}" inputmode="numeric" value="${dollars(p.price_cents)}" aria-label="${esc(p.title)} 售價"></span>`
                  : ""
              }</td>
              <td data-label="規格">${v ? `${esc(v.option_name)}：${esc(v.value)}` : `<span class="admin-muted-cell">無規格</span>`}</td>
              <td data-label="庫存">${
                v
                  ? `<span class="stepper${v.inventory === 0 ? " is-out" : ""}">
                      <button type="button" data-step="-1" aria-label="減少庫存">${icon("minus", 14)}</button>
                      <input class="stock-input" type="number" min="0" data-variant="${v.id}" value="${v.inventory}" aria-label="${esc(p.title)} ${esc(v.value)} 庫存">
                      <button type="button" data-step="1" aria-label="增加庫存">${icon("plus", 14)}</button>
                    </span>`
                  : `<span class="admin-muted-cell">—</span>`
              }</td>
              <td data-label="狀態">${v ? stockPill(v.inventory) : ""}</td>
              <td class="num">${i === 0 ? `<button class="admin-notice__action edit-product" type="button" data-product="${p.id}" style="color:var(--color-accent)">編輯</button>` : ""}</td>
            </tr>`
              )
              .join("");
          })
          .join("")}
      </tbody>
    </table>
  </div>`;

  wrap.querySelector(".admin-table-card").appendChild(
    pager(products.length, catalogPage, (p) => {
      catalogPage = p;
      renderCatalogTable(products);
    })
  );

  wrap.querySelectorAll(".edit-product").forEach((b) => {
    b.addEventListener("click", () => switchView("catalog", { form: true, productId: Number(b.dataset.product) }));
  });

  wrap.querySelectorAll(".stepper button").forEach((b) => {
    b.addEventListener("click", () => {
      const input = b.parentElement.querySelector("input");
      const next = Math.max(0, Number(input.value) + Number(b.dataset.step));
      if (next === Number(input.value)) return;
      input.value = next;
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
  });

  wrap.querySelectorAll(".stock-input").forEach((input) => {
    input.addEventListener("change", async (e) => {
      const value = Math.max(0, Math.round(Number(e.target.value) || 0));
      e.target.value = value;
      try {
        await Api.patch(`/api/admin/variants/${e.target.dataset.variant}`, { inventory: value });
        const variantId = Number(e.target.dataset.variant);
        for (const p of productsCache) {
          const v = p.variants.find((x) => x.id === variantId);
          if (v) v.inventory = value;
        }
        e.target.closest(".stepper").classList.toggle("is-out", value === 0);
        e.target.closest("tr").querySelector('[data-label="狀態"]').innerHTML = stockPill(value);
        updateLowStockDot();
        flash("庫存已更新", false);
      } catch (err) {
        flash(err.message);
      }
    });
  });

  wrap.querySelectorAll(".price-input").forEach((input) => {
    input.addEventListener("change", async (e) => {
      const value = Math.round(Number(e.target.value) || 0);
      if (value <= 0) {
        flash("售價必須大於 0");
        const p = productsCache.find((x) => x.id === Number(e.target.dataset.product));
        e.target.value = dollars(p.price_cents);
        return;
      }
      try {
        await Api.patch(`/api/products/${e.target.dataset.product}`, { price_cents: value * 100 });
        const p = productsCache.find((x) => x.id === Number(e.target.dataset.product));
        if (p) p.price_cents = value * 100;
        e.target.value = value;
        flash("售價已更新", false);
      } catch (err) {
        flash(err.message);
      }
    });
  });
}

// 缺貨的排最前面，提示條只列前三項時才會先講最急的那幾個
function lowStockVariants() {
  return productsCache
    .flatMap((p) =>
      p.variants.filter((v) => v.inventory <= LOW_STOCK_THRESHOLD).map((v) => ({ product: p, variant: v }))
    )
    .sort((a, b) => a.variant.inventory - b.variant.inventory);
}

function updateLowStockDot() {
  const dot = document.getElementById("nav-lowstock");
  dot.hidden = lowStockVariants().length === 0;
}

async function renderCatalog() {
  setHeader(
    "商品與庫存",
    "直接在表格內調整售價與各規格庫存，變更即時反映到前台",
    `<button class="btn btn--accent" type="button" id="new-product">${icon("plus", 16)} 新增商品</button>`
  );
  loading("商品載入中…");
  actionsEl.querySelector("#new-product").addEventListener("click", () =>
    switchView("catalog", { form: true })
  );

  const { products } = await Api.get("/api/products?sort=title&include_drafts=1");
  productsCache = products;
  catalogPage = 1;
  updateLowStockDot();

  const low = lowStockVariants();
  const out = low.filter((x) => x.variant.inventory === 0);
  const variantCount = products.reduce((n, p) => n + p.variants.length, 0);

  const notice = low.length
    ? `<div class="admin-notice">
        ${icon("alert", 19)}
        <span>
          <b>${low.length} 項規格庫存偏低（≤ ${LOW_STOCK_THRESHOLD} 件）${out.length ? `，其中 ${out.length} 項已售罄` : ""}。</b>
          <span>${low
            .slice(0, 3)
            .map((x) => `${esc(x.product.title)}（${esc(x.variant.value)}）${x.variant.inventory === 0 ? "已售罄" : `剩 ${x.variant.inventory} 件`}`)
            .join("、")}${low.length > 3 ? ` 等 ${low.length} 項` : ""}，建議儘快補貨。</span>
        </span>
        <button class="admin-notice__action" type="button" id="show-low">只看低庫存</button>
      </div>`
    : "";

  viewEl.innerHTML = `
    ${notice}
    <div class="admin-toolbar">
      <label class="admin-search">
        ${icon("search", 17)}
        <input type="search" id="product-search" placeholder="搜尋商品名稱或代稱" aria-label="搜尋商品">
      </label>
      <select class="admin-select" id="product-collection" aria-label="依分類篩選">
        <option value="all">所有分類</option>
        ${COLLECTIONS.map((c) => `<option value="${c}">${c}</option>`).join("")}
      </select>
      <select class="admin-select" id="product-stock" aria-label="依庫存狀態篩選">
        <option value="all">所有庫存狀態</option>
        <option value="low">庫存偏低</option>
        <option value="out">已售罄</option>
      </select>
      <span class="admin-toolbar__spacer"></span>
      <span class="admin-toolbar__count">共 ${products.length} 件商品 · ${variantCount} 組規格</span>
    </div>
    <div id="catalog-table-wrap"></div>
    <p class="admin-note">售價與庫存為行內編輯，離開欄位即自動儲存並寫入操作紀錄。</p>
  `;

  renderCatalogTable(productsCache);

  const refresh = () => {
    catalogPage = 1;
    renderCatalogTable(
      filterProducts(
        document.getElementById("product-search").value,
        document.getElementById("product-collection").value,
        document.getElementById("product-stock").value
      )
    );
  };
  document.getElementById("product-search").addEventListener("input", refresh);
  document.getElementById("product-collection").addEventListener("change", refresh);
  document.getElementById("product-stock").addEventListener("change", refresh);
  document.getElementById("show-low")?.addEventListener("click", () => {
    document.getElementById("product-stock").value = "low";
    refresh();
  });
}

// ---------- 商品新增／編輯表單 ----------

function variantRow(variant = {}) {
  const row = document.createElement("div");
  row.className = "admin-variant-row";
  row.innerHTML = `
    <input type="text" placeholder="顏色" value="${esc(variant.option_name || "")}" data-field="option_name" aria-label="規格名稱">
    <input type="text" placeholder="石墨黑" value="${esc(variant.value || "")}" data-field="value" aria-label="選項值">
    <input type="number" min="0" placeholder="0" value="${variant.inventory ?? ""}" data-field="inventory" aria-label="庫存數量">
    <button type="button" aria-label="移除這組規格">${icon("minus", 16)}</button>`;
  row.dataset.id = variant.id ?? "";
  row.querySelectorAll("input").forEach((i) => i.classList.add("admin-variant-input"));
  row.querySelector("button").addEventListener("click", () => row.remove());
  return row;
}

async function renderProductForm(productId) {
  const isEdit = Number.isFinite(productId);
  setHeader(isEdit ? "編輯商品" : "新增商品", "載入中…");
  loading();

  let product = { variants: [], status: "active", collection: COLLECTIONS[0] };
  if (isEdit) {
    const data = await Api.get(`/api/products/${productId}`);
    product = data.product;
  }

  setHeader(
    isEdit ? "編輯商品" : "新增商品",
    isEdit ? `${product.title}　·　建立於 ${shortDate(product.created_at)}` : "填寫商品資料後即可上架，或先存成草稿",
    `<button class="btn btn--small" type="button" id="cancel-product" style="background:#fff;border-color:var(--color-border);color:var(--color-text)">取消</button>
     <button class="btn btn--accent btn--small" type="button" id="save-product">${isEdit ? "儲存商品" : "建立商品"}</button>`
  );

  viewEl.innerHTML = `
    <button class="admin-back" type="button" id="back-to-catalog">${icon("arrow-left", 16)} 商品與庫存</button>
    <div class="admin-split">
      <div>
        <div class="admin-card">
          <div class="admin-card__head"><h2>基本資料</h2></div>
          <div class="admin-form-grid">
            <div class="admin-field">
              <label for="f-title">商品名稱</label>
              <input type="text" id="f-title" value="${esc(product.title || "")}" placeholder="玻尿酸保濕面霜">
            </div>
            <div class="admin-field">
              <label for="f-slug">網址代稱</label>
              <div class="admin-slug">
                <span>/product.html?slug=</span>
                <input type="text" id="f-slug" value="${esc(product.slug || "")}" placeholder="face-cream">
              </div>
              <span class="admin-field__hint">前台商品頁的網址，只能使用英文小寫、數字與連字號。</span>
            </div>
            <div class="admin-field">
              <label for="f-description">商品描述</label>
              <textarea id="f-description" placeholder="用兩三句話說明材質、使用情境與賣點。">${esc(product.description || "")}</textarea>
            </div>
          </div>
        </div>
        <div class="admin-card">
          <div class="admin-card__head"><h2>價格</h2></div>
          <div class="admin-form-grid--2">
            <div class="admin-field">
              <label for="f-price">售價</label>
              <input type="number" id="f-price" min="1" value="${product.price_cents ? dollars(product.price_cents) : ""}" placeholder="680">
              <span class="admin-field__hint">以新台幣元為單位，資料庫存成 price_cents。</span>
            </div>
            <div class="admin-field">
              <label for="f-compare">原價（劃線價）</label>
              <input type="number" id="f-compare" min="1" value="${product.compare_at_price_cents ? dollars(product.compare_at_price_cents) : ""}" placeholder="未設定">
              <span class="admin-field__hint">填寫後前台會顯示折扣標籤，須高於售價。</span>
            </div>
          </div>
        </div>
        <div class="admin-card">
          <div class="admin-card__head"><h2>規格與庫存</h2><span class="admin-card__meta">同一個規格名稱可有多個選項</span></div>
          <div class="admin-variant-head"><span>規格名稱</span><span>選項值</span><span>庫存數量</span><span></span></div>
          <div id="variant-rows"></div>
          <div style="margin-top:14px;">
            <button class="btn btn--outline btn--small" type="button" id="add-variant">${icon("plus", 16)} 新增規格</button>
          </div>
        </div>
      </div>
      <div>
        <div class="admin-card">
          <div class="admin-card__head"><h2>上架狀態</h2></div>
          <div class="admin-form-grid">
            <label class="admin-radio">
              <input type="radio" name="f-status" value="active" ${product.status !== "draft" ? "checked" : ""}>
              <span class="admin-radio__mark"></span>
              <span><b>上架中</b><span>前台商品列表與搜尋可見</span></span>
            </label>
            <label class="admin-radio">
              <input type="radio" name="f-status" value="draft" ${product.status === "draft" ? "checked" : ""}>
              <span class="admin-radio__mark"></span>
              <span><b>草稿</b><span>僅後台可見，前台不顯示</span></span>
            </label>
          </div>
        </div>
        <div class="admin-card">
          <div class="admin-card__head"><h2>分類</h2></div>
          <select class="admin-select" id="f-collection" style="width:100%" aria-label="商品分類">
            ${COLLECTIONS.map((c) => `<option value="${c}" ${c === product.collection ? "selected" : ""}>${c}</option>`).join("")}
          </select>
          <p class="admin-hint">五大分類：${COLLECTIONS.join("、")}。</p>
        </div>
        <div class="admin-card">
          <div class="admin-card__head"><h2>商品圖片</h2></div>
          <div class="admin-dropzone">
            ${icon("upload", 26)}
            <b>本 Demo 未接圖片上傳</b>
            <span>前台以下方的圖片來源代稱決定要顯示哪張圖</span>
          </div>
          <div class="admin-field" style="margin-top:14px;">
            <label for="f-image-seed">圖片來源代稱</label>
            <input type="text" id="f-image-seed" value="${esc(product.image_seed || "")}" placeholder="與網址代稱相同">
            <span class="admin-field__hint">對應資料表的 image_seed 欄位，留空則沿用網址代稱。</span>
          </div>
        </div>
      </div>
    </div>
  `;

  const rows = document.getElementById("variant-rows");
  (product.variants.length ? product.variants : []).forEach((v) => rows.appendChild(variantRow(v)));
  document.getElementById("add-variant").addEventListener("click", () => rows.appendChild(variantRow()));

  const leave = () => switchView("catalog");
  document.getElementById("back-to-catalog").addEventListener("click", leave);
  actionsEl.querySelector("#cancel-product").addEventListener("click", leave);

  actionsEl.querySelector("#save-product").addEventListener("click", async (e) => {
    const price = Number(document.getElementById("f-price").value);
    const compare = document.getElementById("f-compare").value.trim();
    const payload = {
      title: document.getElementById("f-title").value.trim(),
      slug: document.getElementById("f-slug").value.trim().toLowerCase(),
      description: document.getElementById("f-description").value.trim(),
      collection: document.getElementById("f-collection").value,
      price_cents: Number.isFinite(price) ? Math.round(price * 100) : NaN,
      compare_at_price_cents: compare === "" ? null : Math.round(Number(compare) * 100),
      image_seed: document.getElementById("f-image-seed").value.trim(),
      status: viewEl.querySelector('input[name="f-status"]:checked')?.value ?? "active",
      variants: [...rows.querySelectorAll(".admin-variant-row")].map((row) => ({
        id: row.dataset.id ? Number(row.dataset.id) : undefined,
        option_name: row.querySelector('[data-field="option_name"]').value.trim(),
        value: row.querySelector('[data-field="value"]').value.trim(),
        inventory: Number(row.querySelector('[data-field="inventory"]').value || 0),
      })),
    };

    e.currentTarget.disabled = true;
    try {
      if (isEdit) await Api.patch(`/api/products/${productId}`, payload);
      else await Api.post("/api/products", payload);
      flash(isEdit ? "商品已儲存" : "商品已建立", false);
      switchView("catalog");
    } catch (err) {
      flash(err.message);
      e.currentTarget.disabled = false;
    }
  });
}

// ---------- 會員管理 ----------

async function renderCustomers() {
  setHeader("會員管理", "前台註冊的會員名單，以及每位會員的下單與消費概況");
  loading();

  const { customers } = await Api.get("/api/admin/customers");

  if (customers.length === 0) {
    viewEl.innerHTML = `<p class="empty-state">目前尚無註冊會員——請先從前台註冊一個帳號。</p>`;
    return;
  }

  const now = new Date();
  const newThisMonth = customers.filter((c) => {
    const d = new Date(c.created_at.replace(" ", "T") + "Z");
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  }).length;

  const render = (list) => {
    const wrap = document.getElementById("customers-table-wrap");
    if (list.length === 0) {
      wrap.innerHTML = `<div class="admin-table-card"><p class="empty-state">找不到符合條件的會員。</p></div>`;
      return;
    }
    wrap.innerHTML = `<div class="admin-table-card">
      <table class="admin-table">
        <thead>
          <tr><th>會員</th><th>註冊時間</th><th class="num">訂單數</th><th class="num">累計消費</th><th>最近下單</th></tr>
        </thead>
        <tbody>
          ${list
            .map(
              (c) => `<tr>
            <td data-label="會員"><span class="admin-cell-product">
              <span class="admin-avatar${c.order_count === 0 ? " admin-avatar--quiet" : ""}">${esc((c.name || "?").slice(0, 1))}</span>
              <span><b>${esc(c.name)}</b><span class="admin-table__sub">${esc(c.email)}</span></span>
            </span></td>
            <td data-label="註冊時間" class="nowrap text-muted">${shortDate(c.created_at)}</td>
            <td data-label="訂單數" class="num">${c.order_count === 0 ? `<span class="admin-muted-cell">尚未下單</span>` : `<strong>${c.order_count}</strong> <span class="text-muted">筆</span>`}</td>
            <td data-label="累計消費" class="num"><strong${c.order_count === 0 ? ' class="admin-muted-cell"' : ""}>${formatPrice(c.total_spent_cents)}</strong></td>
            <td data-label="最近下單" class="nowrap text-muted">${shortDate(c.last_order_at)}</td>
          </tr>`
            )
            .join("")}
        </tbody>
      </table>
    </div>`;
  };

  viewEl.innerHTML = `
    <div class="admin-toolbar">
      <label class="admin-search">
        ${icon("search", 17)}
        <input type="search" id="customer-search" placeholder="搜尋會員姓名或 Email" aria-label="搜尋會員">
      </label>
      <select class="admin-select" id="customer-sort" style="min-width:190px" aria-label="排序方式">
        <option value="spent">累計消費由高到低</option>
        <option value="orders">訂單數由多到少</option>
        <option value="newest">最新註冊</option>
      </select>
      <span class="admin-toolbar__spacer"></span>
      <span class="admin-toolbar__count">共 ${customers.length} 位會員　·　本月新加入 ${newThisMonth} 位</span>
    </div>
    <div id="customers-table-wrap"></div>
    <p class="admin-note">後台僅讀取會員名單與消費統計，不顯示、也不儲存任何可還原的密碼資訊。</p>
  `;

  const refresh = () => {
    const q = document.getElementById("customer-search").value.trim().toLowerCase();
    const sort = document.getElementById("customer-sort").value;
    const list = customers.filter(
      (c) => !q || c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q)
    );
    list.sort((a, b) => {
      if (sort === "orders") return b.order_count - a.order_count;
      if (sort === "newest") return b.created_at.localeCompare(a.created_at);
      return b.total_spent_cents - a.total_spent_cents;
    });
    render(list);
  };

  document.getElementById("customer-search").addEventListener("input", refresh);
  document.getElementById("customer-sort").addEventListener("change", refresh);
  refresh();
}

// ---------- 操作紀錄 ----------

async function renderActivity() {
  setHeader("操作紀錄", "後台每一次狀態變更、價格與庫存調整都會留下紀錄");
  loading();

  const { actions } = await Api.get("/api/admin/actions");

  if (actions.length === 0) {
    viewEl.innerHTML = `<p class="empty-state">目前尚無操作紀錄。</p>`;
    return;
  }

  viewEl.innerHTML = `<div class="admin-table-card">
    <table class="admin-table">
      <thead><tr><th style="width:200px">時間</th><th>內容</th></tr></thead>
      <tbody>
        ${actions
          .map(
            (a) => `<tr>
          <td data-label="時間" class="nowrap text-muted">${formatDateTime(a.created_at)}</td>
          <td data-label="內容">${esc(a.detail)}</td>
        </tr>`
          )
          .join("")}
      </tbody>
    </table>
  </div>
  <p class="admin-note">僅顯示最近 100 筆。</p>`;
}

// ---------- 啟動 ----------

document.addEventListener("DOMContentLoaded", async () => {
  const { authenticated } = await Api.get("/api/admin/session");
  if (!authenticated) {
    location.href = "/admin/login.html";
    return;
  }

  document.querySelectorAll(".admin-sidebar__link").forEach((btn) => {
    btn.addEventListener("click", () => switchView(btn.dataset.view));
  });

  document.getElementById("logout-btn").addEventListener("click", async () => {
    await Api.post("/api/admin/logout", {});
    location.href = "/admin/login.html";
  });

  // 側邊欄的低庫存提示不必等使用者切到商品頁才亮
  Api.get("/api/products?include_drafts=1")
    .then(({ products }) => {
      productsCache = products;
      updateLowStockDot();
    })
    .catch(() => { /* 提示點而已，失敗就不顯示 */ });

  switchView("orders");
});
