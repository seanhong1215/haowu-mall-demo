// Shared product-card markup used on the home page and collection page.
// Deterministic "已售出 N 件" — stable per product per day (not real sales
// data), same idea as the product-page viewer count: common social-proof
// styling on Taiwanese marketplaces, purely decorative.
function dailySoldCount(productId) {
  const daySeed = new Date().toISOString().slice(0, 10);
  let hash = 0;
  for (const ch of `sold-${productId}-${daySeed}`) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return 30 + (hash % 970);
}

function productCardHTML(p, rank) {
  const onSale = p.compare_at_price_cents && p.compare_at_price_cents > p.price_cents;
  const inStock = !p.variants || p.variants.length === 0 || p.variants.some((v) => v.inventory > 0);
  const discountPct = onSale ? Math.round((1 - p.price_cents / p.compare_at_price_cents) * 100) : 0;
  return `
    <a class="product-card" href="/product.html?slug=${p.slug}">
      <div class="product-card__media">
        <div class="product-card__badges">
          ${rank ? `<span class="product-card__badge product-card__badge--rank">TOP ${rank}</span>` : ""}
          ${onSale ? `<span class="product-card__badge">省${discountPct}%</span>` : ""}
          ${!inStock ? `<span class="product-card__badge product-card__badge--sold-out">已售完</span>` : ""}
        </div>
        <img src="${imageUrl(p.image_seed, 1, 500, 500)}" alt="${p.title}" loading="lazy">
      </div>
      <div class="product-card__body">
        <div class="product-card__title">${p.title}</div>
        ${p.rating_count ? `<div class="product-card__rating">${starRatingHTML(p.rating_avg, p.rating_count)}</div>` : ""}
        <span class="price">
          ${onSale ? `<span class="price--compare">${formatPrice(p.compare_at_price_cents)}</span><span class="price--sale">${formatPrice(p.price_cents)}</span>` : formatPrice(p.price_cents)}
        </span>
        <div class="product-card__meta">
          <span class="free-shipping-tag">滿990免運</span>
          <span class="sold-count">已售出 ${dailySoldCount(p.id)} 件</span>
        </div>
      </div>
    </a>
  `;
}
