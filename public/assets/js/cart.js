// Client-side cart state (localStorage). The cart itself is intentionally
// kept on the client — see README "Architecture decisions" — but every
// price/stock number in it is re-validated server-side at checkout
// (functions/api/orders.js) before an order is ever created.
const CART_KEY = "haowu_cart_v1";

const Cart = {
  lineKey(productId, variantId) {
    return `${productId}::${variantId ?? "default"}`;
  },
  get() {
    try {
      return JSON.parse(localStorage.getItem(CART_KEY)) || [];
    } catch {
      return [];
    }
  },
  save(lines) {
    localStorage.setItem(CART_KEY, JSON.stringify(lines));
    document.dispatchEvent(new CustomEvent("cart:updated", { detail: lines }));
  },
  add(line) {
    const lines = Cart.get();
    const key = Cart.lineKey(line.productId, line.variantId);
    const existing = lines.find((l) => Cart.lineKey(l.productId, l.variantId) === key);
    if (existing) {
      existing.quantity = Math.min(existing.quantity + line.quantity, line.maxInventory ?? 99);
    } else {
      lines.push(line);
    }
    Cart.save(lines);
  },
  updateQuantity(productId, variantId, quantity) {
    let lines = Cart.get();
    const key = Cart.lineKey(productId, variantId);
    if (quantity <= 0) {
      lines = lines.filter((l) => Cart.lineKey(l.productId, l.variantId) !== key);
    } else {
      const line = lines.find((l) => Cart.lineKey(l.productId, l.variantId) === key);
      if (line) line.quantity = Math.min(quantity, line.maxInventory ?? 99);
    }
    Cart.save(lines);
  },
  remove(productId, variantId) {
    Cart.updateQuantity(productId, variantId, 0);
  },
  clear() {
    Cart.save([]);
  },
  count() {
    return Cart.get().reduce((sum, l) => sum + l.quantity, 0);
  },
  subtotalCents() {
    return Cart.get().reduce((sum, l) => sum + l.priceCents * l.quantity, 0);
  },
};
