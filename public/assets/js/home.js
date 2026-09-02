const CATEGORY_ICONS = [
  { label: "全部商品", emoji: "🛍️", href: "/collection.html" },
  { label: "3C家電", emoji: "💻", href: "/collection.html?collection=3C家電" },
  { label: "美妝保養", emoji: "💄", href: "/collection.html?collection=美妝保養" },
  { label: "時尚服飾", emoji: "👕", href: "/collection.html?collection=時尚服飾" },
  { label: "生活居家", emoji: "🏠", href: "/collection.html?collection=生活居家" },
  { label: "食品雜貨", emoji: "🛒", href: "/collection.html?collection=食品雜貨" },
];

function startCountdown() {
  const el = document.getElementById("countdown");
  if (!el) return;
  function tick() {
    const now = new Date();
    const midnight = new Date(now);
    midnight.setHours(24, 0, 0, 0);
    const diff = Math.max(0, midnight - now);
    const h = String(Math.floor(diff / 3_600_000)).padStart(2, "0");
    const m = String(Math.floor((diff % 3_600_000) / 60_000)).padStart(2, "0");
    const s = String(Math.floor((diff % 60_000) / 1000)).padStart(2, "0");
    el.innerHTML = `<span class="countdown__box">${h}</span>:<span class="countdown__box">${m}</span>:<span class="countdown__box">${s}</span>`;
  }
  tick();
  setInterval(tick, 1000);
}

document.addEventListener("DOMContentLoaded", async () => {
  const iconsEl = document.getElementById("category-icons");
  if (iconsEl) {
    iconsEl.innerHTML = CATEGORY_ICONS.map(
      (c) => `<a href="${c.href}"><span class="icon-emoji">${c.emoji}</span>${c.label}</a>`
    ).join("");
  }

  startCountdown();

  const flashGrid = document.getElementById("flash-sale-grid");
  const rankGrid = document.getElementById("rank-grid");

  try {
    const { products } = await Api.get("/api/products?sort=newest");

    if (flashGrid) {
      const onSale = products.filter((p) => p.compare_at_price_cents && p.compare_at_price_cents > p.price_cents);
      flashGrid.innerHTML = (onSale.length ? onSale : products).slice(0, 5).map((p) => productCardHTML(p)).join("");
    }

    if (rankGrid) {
      const ranked = [...products].sort((a, b) => (b.rating_count || 0) - (a.rating_count || 0)).slice(0, 5);
      rankGrid.innerHTML = ranked.map((p, i) => productCardHTML(p, i + 1)).join("");
    }

    const categories = ["3C家電", "美妝保養", "時尚服飾", "生活居家", "食品雜貨"];
    for (const cat of categories) {
      const grid = document.getElementById(`cat-grid-${cat}`);
      if (!grid) continue;
      const items = products.filter((p) => p.collection === cat).slice(0, 5);
      grid.innerHTML = items.map((p) => productCardHTML(p)).join("");
    }
  } catch (err) {
    if (flashGrid) flashGrid.innerHTML = `<p class="text-muted">商品載入失敗：${err.message}</p>`;
  }
});

document.addEventListener("submit", (e) => {
  if (e.target.id !== "newsletter-form") return;
  e.preventDefault();
  const btn = e.target.querySelector("button");
  const original = btn.textContent;
  btn.textContent = "訂閱成功 ✓";
  btn.disabled = true;
  setTimeout(() => {
    btn.textContent = original;
    btn.disabled = false;
    e.target.reset();
  }, 2500);
});
