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
          <tr data-id="${o.id}" style="cursor:pointer;" class="order-row">
            <td>${o.order_number}</td>
            <td>${o.customer_name}<br><span class="text-muted">${o.customer_email}</span></td>
            <td>${formatDateTime(o.created_at)}</td>
            <td>${formatPrice(o.total_cents)}</td>
            <td>
              <select data-id="${o.id}" class="status-select">
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
      try {
        await Api.patch(`/api/orders/${id}`, { status: e.target.value });
        const order = currentOrders.find((o) => o.id === Number(id));
        if (order) order.status = e.target.value;
        showBanner("訂單狀態已更新", false);
      } catch (err) {
        showBanner(err.message);
      }
    });
  });

  tableWrap.querySelectorAll(".order-row").forEach((row) => {
    row.addEventListener("click", () => showOrderDetail(row.dataset.id));
  });
}

function filterOrders(keyword) {
  const q = keyword.trim().toLowerCase();
  if (!q) return currentOrders;
  return currentOrders.filter(
    (o) =>
      o.order_number.toLowerCase().includes(q) ||
      o.customer_name.toLowerCase().includes(q) ||
      o.customer_email.toLowerCase().includes(q)
  );
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
    <div class="admin-toolbar">
      <input type="search" id="order-search" placeholder="搜尋訂單編號、客戶姓名或 Email" aria-label="搜尋訂單">
    </div>
    <div id="orders-table-wrap"></div>
    <div id="order-detail"></div>
  `;
  renderOrdersTable(currentOrders);

  document.getElementById("order-search").addEventListener("input", (e) => {
    renderOrdersTable(filterOrders(e.target.value));
    document.getElementById("order-detail").innerHTML = "";
  });
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

  panel.innerHTML = `
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
              ${i === 0 ? `<td rowspan="${p.variants.length || 1}">${p.title}</td>` : ""}
              ${i === 0 ? `<td rowspan="${p.variants.length || 1}"><input class="inline-input price-input" data-product="${p.id}" value="${centsToDollarsInput(p.price_cents)}"></td>` : ""}
              <td>${v ? `${v.option_name}: ${v.value}` : "—"}</td>
              <td>${
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
          .map((a) => `<tr><td style="white-space:nowrap;">${formatDateTime(a.created_at)}</td><td>${a.detail}</td></tr>`)
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
