// Same line-icon shapes used for the generated product placeholders
// (see api.js CATEGORY_VISUALS) so the category row and product tiles read
// as one consistent icon system instead of mixed platform emoji.
const CATEGORY_ICONS = [
  {
    label: "全部商品",
    href: "/collection.html",
    color: "var(--color-accent)",
    icon: `<rect x="90" y="90" width="90" height="90" rx="12"/><rect x="220" y="90" width="90" height="90" rx="12"/><rect x="90" y="220" width="90" height="90" rx="12"/><rect x="220" y="220" width="90" height="90" rx="12"/>`,
  },
  {
    label: "3C家電",
    href: "/collection.html?collection=3C家電",
    color: "#44607e",
    icon: `<rect x="115" y="90" width="170" height="112" rx="10"/><line x1="164" y1="128" x2="236" y2="128"/><rect x="90" y="208" width="220" height="16" rx="8"/>`,
  },
  {
    label: "美妝保養",
    href: "/collection.html?collection=美妝保養",
    color: "#bb7793",
    icon: `<rect x="178" y="86" width="44" height="38" rx="6"/><rect x="152" y="124" width="96" height="122" rx="14"/><line x1="152" y1="168" x2="248" y2="168"/>`,
  },
  {
    label: "時尚服飾",
    href: "/collection.html?collection=時尚服飾",
    color: "#8069ab",
    icon: `<polygon points="168,92 188,92 200,78 212,92 232,92 258,120 234,144 234,246 166,246 166,144 142,120"/>`,
  },
  {
    label: "生活居家",
    href: "/collection.html?collection=生活居家",
    color: "#ad8253",
    icon: `<polygon points="200,82 262,138 138,138"/><rect x="150" y="138" width="100" height="96"/><rect x="184" y="172" width="32" height="62"/>`,
  },
  {
    label: "食品雜貨",
    href: "/collection.html?collection=食品雜貨",
    color: "#67955f",
    icon: `<path d="M170 150 Q200 92 230 150"/><polygon points="152,150 248,150 233,232 167,232"/>`,
  },
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
  const heroSection = document.getElementById("hero-section");
  if (heroSection) heroSection.style.backgroundImage = `url('${brandPhotoUrl("hero", 1800, 700)}')`;
  const aboutImage = document.getElementById("about-image");
  if (aboutImage) aboutImage.src = brandPhotoUrl("about", 900, 900);

  const iconsEl = document.getElementById("category-icons");
  if (iconsEl) {
    iconsEl.innerHTML = CATEGORY_ICONS.map(
      (c) => `
      <a href="${c.href}">
        <svg class="category-icon" viewBox="0 0 400 400" style="color:${c.color};" fill="none" stroke="currentColor" stroke-width="20" stroke-linejoin="round" stroke-linecap="round">${c.icon}</svg>
        ${c.label}
      </a>`
    ).join("");
  }

  startCountdown();

  const flashGrid = document.getElementById("flash-sale-grid");
  const rankGrid = document.getElementById("rank-grid");
  document.querySelectorAll(".product-grid").forEach((grid) => {
    grid.innerHTML = skeletonCardsHTML(5);
  });

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
