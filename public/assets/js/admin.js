const STATUSES = ["pending", "paid", "fulfilled", "cancelled"];
let currentOrders = [];

function centsToDollarsInput(cents) {
  return (cents / 100).toFixed(2);
}

function showBanner(message, isError = true) {
  const el = document.getElementById("admin-banner");
  el.className = `banner ${isError ? "banner--error" : "banner--success"}`;
  el.textContent = message;
  el.hidden = false;
  clearTimeout(showBanner._timer);
  showBanner._timer = setTimeout(() => {
    el.hidden = true;
  }, 4000);
}

function renderOrdersTable(orders) {
  const tableWrap = document.getElementById("orders-table-wrap");
  if (orders.length === 0) {
    tableWrap.innerHTML = `<p class="empty-state">找不到符合條件的訂單。</p>`;
    return;
  }

  tableWrap.innerHTML = `
    <table class="admin-table">
      <thead>
        <tr><th>訂單編號</th><th>客戶</th><th>下單時間</th><th>總計</th><th>狀態</th></tr>
      </thead>
      <tbody>
        ${orders
          .map(
            (o) => `
          <tr data-id="${o.id}" tabindex="0" role="button" aria-label="查看訂單 ${o.order_number}" class="order-row">
            <td data-label="訂單編號">${o.order_number}</td>
            <td data-label="客戶">${o.customer_name}<br><span class="text-muted">${o.customer_email}</span></td>
            <td data-label="下單時間">${formatDateTime(o.created_at)}</td>
            <td data-label="總計">${formatPrice(o.total_cents)}</td>
            <td data-label="狀態">
              <select data-id="${o.id}" class="status-select status-select--${o.status}" aria-label="訂單 ${o.order_number} 狀態">
                ${STATUSES.map((s) => `<option value="${s}" ${s === o.status ? "selected" : ""}>${STATUS_LABEL[s]}</option>`).join("")}
              </select>
            </td>
          </tr>`
          )
          .join("")}
      </tbody>
    </table>
  `;

  tableWrap.querySelectorAll(".status-select").forEach((select) => {
    select.addEventListener("click", (e) => e.stopPropagation());
    select.addEventListener("change", async (e) => {
      const id = e.target.dataset.id;
      const order = currentOrders.find((o) => o.id === Number(id));
      const previousStatus = order?.status;
      e.target.disabled = true;
      try {
        await Api.patch(`/api/orders/${id}`, { status: e.target.value });
        if (order) order.status = e.target.value;
        e.target.className = `status-select status-select--${e.target.value}`;
        showBanner("訂單狀態已更新", false);
      } catch (err) {
        if (previousStatus) e.target.value = previousStatus;
        showBanner(err.message);
      } finally {
        e.target.disabled = false;
      }
    });
  });

  tableWrap.querySelectorAll(".order-row").forEach((row) => {
    row.addEventListener("click", () => showOrderDetail(row.dataset.id));
    row.addEventListener("keydown", (e) => {
      if (e.target.closest("select, input, button, a")) return;
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        showOrderDetail(row.dataset.id);
      }
    });
  });
}

function renderStatsCards(orders) {
  const pending = orders.filter((o) => o.status === "pending").length;
  const now = new Date();
  const monthRevenue = orders
    .filter((o) => {
      if (o.status === "cancelled") return false;
      const d = new Date(o.created_at.replace(" ", "T"));
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    })
    .reduce((sum, o) => sum + o.total_cents, 0);
  const cancelled = orders.filter((o) => o.status === "cancelled").length;

  const cards = [
    { label: "待處理訂單", value: pending, hint: "已下單、待付款/出貨" },
    { label: "本月營收", value: formatPrice(monthRevenue), hint: "不含已取消訂單" },
    { label: "訂單總數", value: orders.length, hint: "目前資料庫全部訂單" },
    { label: "已取消訂單", value: cancelled, hint: "" },
  ];
  return `
    <div class="admin-stats">
      ${cards
        .map(
          (c) => `
        <div class="admin-stat-card">
          <div class="admin-stat-card__value">${c.value}</div>
          <div class="admin-stat-card__label">${c.label}</div>
          ${c.hint ? `<div class="admin-stat-card__hint">${c.hint}</div>` : ""}
        </div>`
        )
        .join("")}
    </div>
  `;
}

function filterOrders(keyword, status = "all") {
  const q = keyword.trim().toLowerCase();
  return currentOrders.filter((o) => {
    const matchesStatus = status === "all" || o.status === status;
    const matchesQuery = !q ||
      o.order_number.toLowerCase().includes(q) ||
      o.customer_name.toLowerCase().includes(q) ||
      o.customer_email.toLowerCase().includes(q);
    return matchesStatus && matchesQuery;
  });
}

async function loadOrders() {
  const panel = document.getElementById("panel-orders");
  panel.innerHTML = `<p class="text-muted">訂單載入中…</p>`;
  const { orders } = await Api.get("/api/orders");
  currentOrders = orders;

  if (orders.length === 0) {
    panel.innerHTML = `<p class="empty-state">目前尚無訂單——請先從前台結帳建立一筆訂單。</p>`;
    return;
  }

  panel.innerHTML = `
    ${renderStatsCards(currentOrders)}
    <div class="admin-toolbar">
      <input type="search" id="order-search" placeholder="搜尋訂單編號、客戶姓名或 Email" aria-label="搜尋訂單">
      <select id="order-status-filter" aria-label="依訂單狀態篩選">
        <option value="all">所有狀態</option>
        ${STATUSES.map((s) => `<option value="${s}">${STATUS_LABEL[s]}</option>`).join("")}
      </select>
    </div>
    <div id="orders-table-wrap"></div>
    <div id="order-detail"></div>
  `;
  renderOrdersTable(currentOrders);

  const refreshFilteredOrders = () => {
    renderOrdersTable(filterOrders(
      document.getElementById("order-search").value,
      document.getElementById("order-status-filter").value
    ));
    document.getElementById("order-detail").innerHTML = "";
  };
  document.getElementById("order-search").addEventListener("input", refreshFilteredOrders);
  document.getElementById("order-status-filter").addEventListener("change", refreshFilteredOrders);
}

async function showOrderDetail(id) {
  const detail = document.getElementById("order-detail");
  detail.innerHTML = `<p class="text-muted">載入中…</p>`;
  const { order } = await Api.get(`/api/orders/${id}`);
  detail.innerHTML = `
    <div class="admin-order-detail">
      <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:16px;margin-bottom:16px;">
        <div>
          <h3 style="margin-bottom:2px;">訂單 ${order.order_number}</h3>
          <p class="text-muted" style="margin:0;">${order.customer_name} · ${order.customer_email}</p>
          <p class="text-muted" style="margin:0;">${order.shipping_address}</p>
          ${order.payment_card_brand ? `<p class="text-muted" style="margin:4px 0 0;">付款方式：${order.payment_card_brand} 末四碼 ${order.payment_card_last4}</p>` : ""}
        </div>
        <div style="min-width:220px;">${orderTimelineHTML(order)}</div>
      </div>
      ${order.items
        .map(
          (i) => `<div class="order-summary__line"><span>${i.title}${i.variant_label ? ` (${i.variant_label})` : ""} × ${i.quantity}</span><span>${formatPrice(i.price_cents * i.quantity)}</span></div>`
        )
        .join("")}
      ${orderTotalsHTML(order)}
    </div>
  `;
}

async function loadInventory() {
  const panel = document.getElementById("panel-inventory");
  panel.innerHTML = `<p class="text-muted">商品載入中…</p>`;
  const { products } = await Api.get("/api/products?sort=title");

  const LOW_STOCK_THRESHOLD = 5;
  const lowStock = products.flatMap((p) => (p.variants.length ? p.variants : []).filter((v) => v.inventory <= LOW_STOCK_THRESHOLD));
  const outOfStock = lowStock.filter((v) => v.inventory === 0).length;

  panel.innerHTML = `
    ${
      lowStock.length
        ? `<div class="banner banner--error" style="margin-bottom:16px;">⚠️ ${lowStock.length} 項規格庫存量偏低（≤${LOW_STOCK_THRESHOLD} 件）${outOfStock ? `，其中 ${outOfStock} 項已售罄` : ""}，建議儘快補貨。</div>`
        : ""
    }
    <div style="overflow-x:auto;">
    <table class="admin-table">
      <thead><tr><th>商品</th><th>價格（NT$）</th><th>規格</th><th>庫存</th></tr></thead>
      <tbody>
        ${products
          .map((p) =>
            (p.variants.length ? p.variants : [null])
              .map(
                (v, i) => `
            <tr>
              <td data-label="商品">${p.title}</td>
              <td data-label="價格（NT$）">${
                i === 0
                  ? `<input class="inline-input price-input" data-product="${p.id}" value="${centsToDollarsInput(p.price_cents)}">`
                  : `<span class="text-muted">${centsToDollarsInput(p.price_cents)}</span>`
              }</td>
              <td data-label="規格">${v ? `${v.option_name}: ${v.value}` : "—"}</td>
              <td data-label="庫存">${
                v
                  ? `<input class="inline-input stock-input" data-variant="${v.id}" type="number" min="0" value="${v.inventory}">`
                  : `<span class="text-muted">無</span>`
              }</td>
            </tr>`
              )
              .join("")
          )
          .join("")}
      </tbody>
    </table>
    </div>
  `;

  panel.querySelectorAll(".stock-input").forEach((input) => {
    input.addEventListener("change", async (e) => {
      try {
        await Api.patch(`/api/admin/variants/${e.target.dataset.variant}`, { inventory: Number(e.target.value) });
        showBanner("庫存已更新", false);
      } catch (err) {
        showBanner(err.message);
      }
    });
  });
  panel.querySelectorAll(".price-input").forEach((input) => {
    input.addEventListener("change", async (e) => {
      const cents = Math.round(Number(e.target.value) * 100);
      try {
        await Api.patch(`/api/products/${e.target.dataset.product}`, { price_cents: cents });
        showBanner("價格已更新", false);
      } catch (err) {
        showBanner(err.message);
      }
    });
  });
}

async function loadActivity() {
  const panel = document.getElementById("panel-activity");
  panel.innerHTML = `<p class="text-muted">載入中…</p>`;
  const { actions } = await Api.get("/api/admin/actions");

  if (actions.length === 0) {
    panel.innerHTML = `<p class="empty-state">目前尚無操作紀錄。</p>`;
    return;
  }

  panel.innerHTML = `
    <div style="overflow-x:auto;">
    <table class="admin-table">
      <thead><tr><th>時間</th><th>內容</th></tr></thead>
      <tbody>
        ${actions
          .map((a) => `<tr><td data-label="時間" style="white-space:nowrap;">${formatDateTime(a.created_at)}</td><td data-label="內容">${a.detail}</td></tr>`)
          .join("")}
      </tbody>
    </table>
    </div>
  `;
}

function switchTab(tab) {
  document.querySelectorAll(".admin-tabs button").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.tab === tab)));
  document.getElementById("panel-orders").hidden = tab !== "orders";
  document.getElementById("panel-inventory").hidden = tab !== "inventory";
  document.getElementById("panel-activity").hidden = tab !== "activity";
  if (tab === "orders") loadOrders();
  if (tab === "inventory") loadInventory();
  if (tab === "activity") loadActivity();
}

document.addEventListener("DOMContentLoaded", async () => {
  const { authenticated } = await Api.get("/api/admin/session");
  if (!authenticated) {
    location.href = "/admin/login.html";
    return;
  }

  document.querySelectorAll(".admin-tabs button").forEach((btn) => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });
  document.getElementById("logout-btn").addEventListener("click", async () => {
    await Api.post("/api/admin/logout", {});
    location.href = "/admin/login.html";
  });

  switchTab("orders");
});
