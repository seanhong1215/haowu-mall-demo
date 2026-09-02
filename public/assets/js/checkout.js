const FREE_SHIPPING_THRESHOLD_CENTS = 99000; // NT$990
const FLAT_SHIPPING_CENTS = 8000; // NT$80
const TAX_RATE = 0; // 台灣零售價格已內含營業稅，結帳不額外加稅

// Client-side preview only — the server (functions/api/orders.js) recomputes
// all of this authoritatively and never trusts what the client sends.
function previewTotals() {
  const subtotalCents = Cart.subtotalCents();
  const shippingCents = subtotalCents >= FREE_SHIPPING_THRESHOLD_CENTS ? 0 : FLAT_SHIPPING_CENTS;
  const taxCents = Math.round(subtotalCents * TAX_RATE);
  return { subtotalCents, shippingCents, taxCents, totalCents: subtotalCents + shippingCents + taxCents };
}

function renderSummary() {
  const lines = Cart.get();
  const el = document.getElementById("order-summary-lines");
  if (lines.length === 0) {
    location.href = "/cart.html";
    return;
  }
  el.innerHTML = lines
    .map(
      (l) => `
    <div class="order-summary__line">
      <span>${l.title}${l.variantLabel ? ` <span class="text-muted">(${l.variantLabel})</span>` : ""} × ${l.quantity}</span>
      <span>${formatPrice(l.priceCents * l.quantity)}</span>
    </div>`
    )
    .join("");

  const t = previewTotals();
  document.getElementById("order-summary-totals").innerHTML = `
    <div class="order-summary__line"><span>小計</span><span>${formatPrice(t.subtotalCents)}</span></div>
    <div class="order-summary__line"><span>運費</span><span>${t.shippingCents === 0 ? "免運" : formatPrice(t.shippingCents)}</span></div>
    <div class="order-summary__line" style="border-bottom:none;font-size:1.05rem;"><strong>總計</strong><strong>${formatPrice(t.totalCents)}</strong></div>
  `;
}

// Simulates a payment gateway call: normalizes the card number, waits like a
// real network round-trip would, and resolves/rejects using the same test
// card convention real processors use (e.g. Stripe's 4242.../4000...0002),
// so the "declined" path is actually reachable and demoable.
function simulatePayment(rawCardNumber) {
  const digits = (rawCardNumber || "").replace(/\D/g, "");
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      if (digits.length < 12) {
        reject(new Error("請輸入有效的卡號。"));
        return;
      }
      if (digits === "4000000000000002") {
        reject(new Error("很抱歉，此卡片交易失敗。試試 4242 4242 4242 4242 完成模擬付款。"));
        return;
      }
      const brand = digits.startsWith("4") ? "Visa" : digits.startsWith("5") ? "Mastercard" : digits.startsWith("3") ? "Amex" : "信用卡";
      resolve({ brand, last4: digits.slice(-4) });
    }, 1200);
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  renderSummary();

  try {
    const { customer } = await Api.get("/api/customers/me");
    if (customer) {
      document.getElementById("customerName").value = customer.name;
      document.getElementById("customerEmail").value = customer.email;
      document.getElementById("account-note").hidden = false;
    }
  } catch {
    /* not logged in — guest checkout */
  }

  document.getElementById("checkout-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = e.target;
    const submitBtn = form.querySelector("button[type=submit]");
    const banner = document.getElementById("checkout-banner");
    banner.hidden = true;
    submitBtn.disabled = true;
    submitBtn.textContent = "付款處理中…";

    try {
      const payment = await simulatePayment(form.cardNumber.value);

      submitBtn.textContent = "訂單建立中…";
      const items = Cart.get().map((l) => ({
        productId: l.productId,
        variantId: l.variantId,
        quantity: l.quantity,
      }));

      const { order } = await Api.post("/api/orders", {
        customerName: form.customerName.value,
        customerEmail: form.customerEmail.value,
        shippingAddress: form.shippingAddress.value,
        items,
        paymentCardBrand: payment.brand,
        paymentCardLast4: payment.last4,
      });
      Cart.clear();
      location.href = `/order-confirmation.html?order=${encodeURIComponent(order.orderNumber)}`;
    } catch (err) {
      banner.hidden = false;
      banner.textContent = err.message;
      submitBtn.disabled = false;
      submitBtn.textContent = "送出訂單";
    }
  });
});
