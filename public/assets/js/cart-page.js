function renderCartPage() {
  const lines = Cart.get();
  const body = document.getElementById("cart-body");
  const wrap = document.getElementById("cart-wrap");
  const empty = document.getElementById("cart-empty");

  if (lines.length === 0) {
    wrap.hidden = true;
    empty.hidden = false;
    return;
  }
  wrap.hidden = false;
  empty.hidden = true;

  body.innerHTML = lines
    .map(
      (l) => `
    <tr data-product="${l.productId}" data-variant="${l.variantId ?? ""}">
      <td>
        <div style="display:flex;gap:14px;">
          <img src="${imageUrl(l.imageSeed, 1, 160, 160)}" alt="" style="width:76px;height:76px;object-fit:cover;border-radius:2px;">
          <div>
            <div>${l.title}</div>
            ${l.variantLabel ? `<div class="text-muted" style="font-size:0.85rem;">${l.variantLabel}</div>` : ""}
          </div>
        </div>
      </td>
      <td>${formatPrice(l.priceCents)}</td>
      <td>
        <div class="qty-input">
          <button class="qty-dec" type="button" aria-label="減少數量">−</button>
          <input type="text" readonly value="${l.quantity}" aria-label="數量">
          <button class="qty-inc" type="button" aria-label="增加數量">+</button>
        </div>
      </td>
      <td>${formatPrice(l.priceCents * l.quantity)}</td>
      <td><button class="cart-line__remove" type="button">移除</button></td>
    </tr>`
    )
    .join("");

  body.querySelectorAll("tr").forEach((row) => {
    const productId = Number(row.dataset.product);
    const variantId = row.dataset.variant ? Number(row.dataset.variant) : null;
    const line = lines.find((l) => Cart.lineKey(l.productId, l.variantId) === Cart.lineKey(productId, variantId));
    row.querySelector(".qty-inc").addEventListener("click", () => Cart.updateQuantity(productId, variantId, line.quantity + 1));
    row.querySelector(".qty-dec").addEventListener("click", () => Cart.updateQuantity(productId, variantId, line.quantity - 1));
    row.querySelector(".cart-line__remove").addEventListener("click", () => Cart.remove(productId, variantId));
  });

  document.getElementById("cart-subtotal").textContent = formatPrice(Cart.subtotalCents());
}

document.addEventListener("DOMContentLoaded", renderCartPage);
document.addEventListener("cart:updated", renderCartPage);
