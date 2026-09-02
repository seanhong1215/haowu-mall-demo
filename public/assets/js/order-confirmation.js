document.addEventListener("DOMContentLoaded", async () => {
  const orderNumber = new URLSearchParams(location.search).get("order");
  const el = document.getElementById("confirmation-content");
  if (!orderNumber) {
    el.innerHTML = `<p>未指定訂單編號。</p>`;
    return;
  }
  try {
    const { order } = await Api.get(`/api/orders/${encodeURIComponent(orderNumber)}`);
    document.getElementById("order-number").textContent = order.order_number;
    document.getElementById("order-email").textContent = order.customer_email;
    document.getElementById("order-timeline").innerHTML = orderTimelineHTML(order);
    document.getElementById("order-items").innerHTML = order.items
      .map(
        (i) => `<div class="order-summary__line"><span>${i.title}${i.variant_label ? ` (${i.variant_label})` : ""} × ${i.quantity}</span><span>${formatPrice(i.price_cents * i.quantity)}</span></div>`
      )
      .join("");
    document.getElementById("order-totals").innerHTML = orderTotalsHTML(order);
    if (order.payment_card_brand) {
      document.getElementById("order-payment").textContent = `付款方式：${order.payment_card_brand} 末四碼 ${order.payment_card_last4}`;
    }
  } catch (err) {
    el.innerHTML = `<p class="banner banner--error">${err.message}</p>`;
  }
});
