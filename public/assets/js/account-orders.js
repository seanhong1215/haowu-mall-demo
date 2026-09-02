async function loadMyOrders() {
  const content = document.getElementById("orders-content");
  const { orders } = await Api.get("/api/customers/orders");

  if (orders.length === 0) {
    content.innerHTML = `<p class="empty-state">目前還沒有訂單。<a href="/collection.html">開始購物 →</a></p>`;
    return;
  }

  content.innerHTML = `
    <table class="admin-table">
      <thead><tr><th>訂單編號</th><th>下單時間</th><th>總計</th><th>狀態</th></tr></thead>
      <tbody>
        ${orders
          .map(
            (o) => `
          <tr class="order-row" data-id="${o.id}" style="cursor:pointer;">
            <td>${o.order_number}</td>
            <td>${formatDateTime(o.created_at)}</td>
            <td>${formatPrice(o.total_cents)}</td>
            <td><span class="status-pill status-pill--${o.status}">${STATUS_LABEL[o.status] || o.status}</span></td>
          </tr>`
          )
          .join("")}
      </tbody>
    </table>
    <div id="order-detail"></div>
  `;

  content.querySelectorAll(".order-row").forEach((row) => {
    row.addEventListener("click", () => showOrderDetail(row.dataset.id));
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
          <p class="text-muted" style="margin:0;">${order.shipping_address}</p>
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

document.addEventListener("DOMContentLoaded", async () => {
  const { customer } = await Api.get("/api/customers/me");
  if (!customer) {
    location.href = "/account/login.html";
    return;
  }
  document.getElementById("account-greeting").textContent = `${customer.name} · ${customer.email}`;
  document.getElementById("logout-btn").addEventListener("click", async () => {
    await Api.post("/api/customers/logout", {});
    location.href = "/index.html";
  });
  loadMyOrders();
});
