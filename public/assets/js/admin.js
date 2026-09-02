const STATUSES = ["pending", "paid", "fulfilled", "cancelled"];

function centsToDollarsInput(cents) {
  return (cents / 100).toFixed(2);
}

async function loadOrders() {
  const panel = document.getElementById("panel-orders");
  panel.innerHTML = `<p class="text-muted">Loading orders…</p>`;
  const { orders } = await Api.get("/api/orders");

  if (orders.length === 0) {
    panel.innerHTML = `<p class="empty-state">No orders yet — place one from the storefront checkout to see it here.</p>`;
    return;
  }

  panel.innerHTML = `
    <table class="admin-table">
      <thead>
        <tr><th>Order</th><th>Customer</th><th>Placed</th><th>Total</th><th>Status</th></tr>
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
                ${STATUSES.map((s) => `<option value="${s}" ${s === o.status ? "selected" : ""}>${s}</option>`).join("")}
              </select>
            </td>
          </tr>`
          )
          .join("")}
      </tbody>
    </table>
    <div id="order-detail"></div>
  `;

  panel.querySelectorAll(".status-select").forEach((select) => {
    select.addEventListener("click", (e) => e.stopPropagation());
    select.addEventListener("change", async (e) => {
      const id = e.target.dataset.id;
      try {
        await Api.patch(`/api/orders/${id}`, { status: e.target.value });
      } catch (err) {
        alert(err.message);
      }
    });
  });

  panel.querySelectorAll(".order-row").forEach((row) => {
    row.addEventListener("click", () => showOrderDetail(row.dataset.id));
  });
}

async function showOrderDetail(id) {
  const detail = document.getElementById("order-detail");
  detail.innerHTML = `<p class="text-muted">Loading…</p>`;
  const { order } = await Api.get(`/api/orders/${id}`);
  detail.innerHTML = `
    <div class="admin-order-detail">
      <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:16px;margin-bottom:16px;">
        <div>
          <h3 style="margin-bottom:2px;">Order ${order.order_number}</h3>
          <p class="text-muted" style="margin:0;">${order.customer_name} · ${order.customer_email}</p>
          <p class="text-muted" style="margin:0;">${order.shipping_address}</p>
          ${order.payment_card_brand ? `<p class="text-muted" style="margin:4px 0 0;">Paid with ${order.payment_card_brand} ending in ${order.payment_card_last4}</p>` : ""}
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
  panel.innerHTML = `<p class="text-muted">Loading products…</p>`;
  const { products } = await Api.get("/api/products?sort=title");

  panel.innerHTML = `
    <table class="admin-table">
      <thead><tr><th>Product</th><th>Price (NT$)</th><th>Variant</th><th>Stock</th></tr></thead>
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
                  : `<span class="text-muted">n/a</span>`
              }</td>
            </tr>`
              )
              .join("")
          )
          .join("")}
      </tbody>
    </table>
  `;

  panel.querySelectorAll(".stock-input").forEach((input) => {
    input.addEventListener("change", async (e) => {
      try {
        await Api.patch(`/api/admin/variants/${e.target.dataset.variant}`, { inventory: Number(e.target.value) });
      } catch (err) {
        alert(err.message);
      }
    });
  });
  panel.querySelectorAll(".price-input").forEach((input) => {
    input.addEventListener("change", async (e) => {
      const cents = Math.round(Number(e.target.value) * 100);
      try {
        await Api.patch(`/api/products/${e.target.dataset.product}`, { price_cents: cents });
      } catch (err) {
        alert(err.message);
      }
    });
  });
}

function switchTab(tab) {
  document.querySelectorAll(".admin-tabs button").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.tab === tab)));
  document.getElementById("panel-orders").hidden = tab !== "orders";
  document.getElementById("panel-inventory").hidden = tab !== "inventory";
  if (tab === "orders") loadOrders();
  if (tab === "inventory") loadInventory();
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
