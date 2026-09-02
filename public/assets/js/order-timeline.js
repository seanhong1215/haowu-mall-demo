// Shared order-timeline + totals-breakdown rendering, used by the
// confirmation page, customer order history, and the admin order detail.
const STATUS_LABEL = { pending: "已下單", paid: "已付款", fulfilled: "已出貨", cancelled: "已取消" };
const MILESTONES = ["pending", "paid", "fulfilled"];

function formatDateTime(sqliteUtc) {
  // D1/SQLite datetime('now') is UTC without a timezone suffix — append one so
  // the browser doesn't interpret it as local time.
  return new Date(sqliteUtc.replace(" ", "T") + "Z").toLocaleString("zh-TW");
}

function orderTimelineHTML(order) {
  if (order.status === "cancelled") {
    const note = order.events?.find((e) => e.status === "cancelled");
    return `<div class="banner banner--error" style="margin-bottom:0;">此訂單已取消${note ? `（${formatDateTime(note.created_at)}）` : ""}。</div>`;
  }

  const currentIndex = MILESTONES.indexOf(order.status);
  const steps = MILESTONES.map((status, i) => {
    const event = order.events?.find((e) => e.status === status);
    const state = i <= currentIndex ? "done" : "upcoming";
    return `
      <li class="timeline-step timeline-step--${state}">
        <span class="timeline-dot"></span>
        <div>
          <div class="timeline-label">${STATUS_LABEL[status]}</div>
          ${event ? `<div class="timeline-time">${formatDateTime(event.created_at)}</div>` : ""}
        </div>
      </li>`;
  }).join("");

  return `
    <ul class="timeline">${steps}</ul>
    ${order.tracking_number ? `<p class="text-muted" style="margin-top:12px;">物流追蹤碼：<strong>${order.tracking_number}</strong>（黑貓宅急便 demo）</p>` : ""}
  `;
}

function orderTotalsHTML(order) {
  return `
    <div class="order-summary__line"><span>小計</span><span>${formatPrice(order.subtotal_cents)}</span></div>
    <div class="order-summary__line"><span>運費</span><span>${order.shipping_cents === 0 ? "免運" : formatPrice(order.shipping_cents)}</span></div>
    ${order.tax_cents > 0 ? `<div class="order-summary__line"><span>稅金</span><span>${formatPrice(order.tax_cents)}</span></div>` : ""}
    <div class="order-summary__line" style="border-bottom:none;font-size:1.05rem;"><strong>總計</strong><strong>${formatPrice(order.total_cents)}</strong></div>
  `;
}
