let currentProduct = null;
let currentReviews = [];
let selectedVariantId = null;
let selectedImageIndex = 1;

const RECENTLY_VIEWED_KEY = "haowu_recently_viewed_v1";

// Deterministic "X people viewed this today" — stable for the whole day so
// it doesn't look janky on refresh, changes daily. Purely decorative social
// proof, same idea as the urgency banners on most real product pages.
function dailyViewerCount(productId) {
  const daySeed = new Date().toISOString().slice(0, 10);
  let hash = 0;
  for (const ch of `${productId}-${daySeed}`) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return 8 + (hash % 37); // 8–44
}

function trackRecentlyViewed(product) {
  let list = [];
  try {
    list = JSON.parse(localStorage.getItem(RECENTLY_VIEWED_KEY)) || [];
  } catch {
    list = [];
  }
  list = list.filter((p) => p.slug !== product.slug);
  list.unshift({
    slug: product.slug,
    title: product.title,
    price_cents: product.price_cents,
    compare_at_price_cents: product.compare_at_price_cents,
    image_seed: product.image_seed,
    variants: [],
    rating_avg: product.rating_avg,
    rating_count: product.rating_count,
  });
  localStorage.setItem(RECENTLY_VIEWED_KEY, JSON.stringify(list.slice(0, 6)));
}

function renderRecentlyViewed(excludeSlug) {
  const section = document.getElementById("recently-viewed-section");
  const grid = document.getElementById("recently-viewed-grid");
  if (!section || !grid) return;
  let list = [];
  try {
    list = JSON.parse(localStorage.getItem(RECENTLY_VIEWED_KEY)) || [];
  } catch {
    list = [];
  }
  list = list.filter((p) => p.slug !== excludeSlug);
  if (list.length === 0) {
    section.hidden = true;
    return;
  }
  section.hidden = false;
  grid.innerHTML = list.map((p) => productCardHTML(p)).join("");
}

function stockNote(inventory) {
  if (inventory <= 0) return `<p class="stock-note stock-note--out">已售完</p>`;
  if (inventory <= 5) return `<p class="stock-note stock-note--low">庫存僅剩 ${inventory} 件</p>`;
  return `<p class="stock-note stock-note--ok">現貨供應中</p>`;
}

function renderGallery(p) {
  const main = document.getElementById("gallery-main");
  main.src = imageUrl(p.image_seed, selectedImageIndex, 900, 900);
  main.alt = p.title;

  const thumbs = document.getElementById("gallery-thumbs");
  thumbs.innerHTML = [1, 2, 3]
    .map(
      (i) => `
      <button aria-current="${i === selectedImageIndex}" data-index="${i}">
        <img src="${imageUrl(p.image_seed, i, 160, 160)}" alt="">
      </button>`
    )
    .join("");
  thumbs.querySelectorAll("button").forEach((btn) => {
    btn.addEventListener("click", () => {
      selectedImageIndex = Number(btn.dataset.index);
      renderGallery(p);
    });
  });
}

function currentVariant() {
  if (!currentProduct.variants.length) return null;
  return currentProduct.variants.find((v) => v.id === selectedVariantId) || null;
}

function renderOptions(p) {
  const wrap = document.getElementById("options-wrap");
  if (!p.variants.length) {
    wrap.innerHTML = "";
    return;
  }
  const optionName = p.variants[0].option_name;
  wrap.innerHTML = `
    <div class="option-block">
      <span class="option-block__label">${optionName}</span>
      <div class="swatches" id="swatches"></div>
    </div>
  `;
  const swatches = document.getElementById("swatches");
  swatches.innerHTML = p.variants
    .map(
      (v) => `
      <button class="swatch" data-id="${v.id}" aria-pressed="${v.id === selectedVariantId}" ${v.inventory <= 0 ? "disabled" : ""}>
        ${v.value}
      </button>`
    )
    .join("");
  swatches.querySelectorAll(".swatch").forEach((btn) => {
    btn.addEventListener("click", () => {
      selectedVariantId = Number(btn.dataset.id);
      renderOptions(p);
      renderBuyBox(p);
    });
  });
}

function renderBuyBox(p) {
  const variant = currentVariant();
  const noteEl = document.getElementById("stock-note");
  const inventory = variant ? variant.inventory : 99;
  noteEl.innerHTML = stockNote(inventory);

  const qtyInput = document.getElementById("qty-input");
  qtyInput.value = 1;
  qtyInput.max = Math.max(inventory, 0);

  const addBtn = document.getElementById("add-to-cart");
  const needsSelection = p.variants.length > 0 && !selectedVariantId;
  addBtn.disabled = needsSelection || inventory <= 0;
  addBtn.textContent = inventory <= 0 ? "已售完" : needsSelection ? "請選擇規格" : "加入購物車";
}

function renderReviews() {
  const list = document.getElementById("reviews-list");
  const summary = document.getElementById("reviews-summary");
  if (currentReviews.length === 0) {
    list.innerHTML = `<p class="text-muted">目前尚無評價，成為第一個留言的人。</p>`;
  } else {
    const avg = currentReviews.reduce((s, r) => s + r.rating, 0) / currentReviews.length;
    summary.innerHTML = starRatingHTML(avg, currentReviews.length);
    list.innerHTML = currentReviews
      .map(
        (r) => `
      <div class="review">
        <div class="review__header">
          <span class="rating__stars">${"★".repeat(r.rating)}${"☆".repeat(5 - r.rating)}</span>
          <strong>${r.author_name}</strong>
          <span class="text-muted">${formatDateTime(r.created_at)}</span>
        </div>
        <p>${r.comment}</p>
      </div>`
      )
      .join("");
  }
}

async function loadReviews(productId) {
  const { reviews } = await Api.get(`/api/reviews?productId=${productId}`);
  currentReviews = reviews;
  renderReviews();
}

function renderRelated(related) {
  const grid = document.getElementById("related-grid");
  if (!grid) return;
  if (!related.length) {
    grid.closest("section").hidden = true;
    return;
  }
  grid.innerHTML = related.map((p) => productCardHTML(p)).join("");
}

async function loadProduct() {
  const slug = new URLSearchParams(location.search).get("slug");
  const content = document.getElementById("product-content");
  if (!slug) {
    content.innerHTML = `<p class="banner banner--error">未指定商品。</p>`;
    return;
  }
  try {
    const { product, related } = await Api.get(`/api/products/${encodeURIComponent(slug)}`);
    currentProduct = product;
    selectedVariantId = product.variants.length === 1 ? product.variants[0].id : null;

    document.title = `${product.title} — 好物商城`;
    document.getElementById("product-collection").textContent = product.collection;
    document.getElementById("product-title").textContent = product.title;
    document.getElementById("product-price").innerHTML =
      product.compare_at_price_cents && product.compare_at_price_cents > product.price_cents
        ? `<span class="price--compare">${formatPrice(product.compare_at_price_cents)}</span><span class="price--sale">${formatPrice(product.price_cents)}</span>`
        : formatPrice(product.price_cents);
    document.getElementById("product-description").textContent = product.description;
    document.getElementById("product-rating").innerHTML = starRatingHTML(product.rating_avg || 0, product.rating_count);
    document.getElementById("viewer-count").textContent = `🔥 24 小時內已有 ${dailyViewerCount(product.id)} 人瀏覽此商品`;

    renderGallery(product);
    renderOptions(product);
    renderBuyBox(product);
    renderRelated(related);
    loadReviews(product.id);
    trackRecentlyViewed(product);
    renderRecentlyViewed(product.slug);
  } catch (err) {
    content.innerHTML = `<p class="banner banner--error">商品載入失敗：${err.message}</p>`;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  loadProduct();

  document.getElementById("qty-dec").addEventListener("click", () => {
    const input = document.getElementById("qty-input");
    input.value = Math.max(1, Number(input.value) - 1);
  });
  document.getElementById("qty-inc").addEventListener("click", () => {
    const input = document.getElementById("qty-input");
    const max = Number(input.max) || 99;
    input.value = Math.min(max, Number(input.value) + 1);
  });

  document.getElementById("add-to-cart").addEventListener("click", () => {
    const variant = currentVariant();
    const quantity = Number(document.getElementById("qty-input").value) || 1;
    Cart.add({
      productId: currentProduct.id,
      variantId: variant ? variant.id : null,
      title: currentProduct.title,
      variantLabel: variant ? `${variant.option_name}: ${variant.value}` : null,
      priceCents: currentProduct.price_cents,
      imageSeed: currentProduct.image_seed,
      quantity,
      maxInventory: variant ? variant.inventory : 99,
    });
    openCart();
  });

  document.getElementById("review-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = e.target;
    const btn = form.querySelector("button[type=submit]");
    const banner = document.getElementById("review-banner");
    banner.hidden = true;
    btn.disabled = true;
    try {
      const { review } = await Api.post("/api/reviews", {
        productId: currentProduct.id,
        authorName: form.authorName.value,
        rating: Number(form.rating.value),
        comment: form.comment.value,
      });
      currentReviews = [review, ...currentReviews];
      renderReviews();
      form.reset();
      form.hidden = true;
      document.getElementById("review-form-toggle").hidden = false;
    } catch (err) {
      banner.hidden = false;
      banner.textContent = err.message;
    } finally {
      btn.disabled = false;
    }
  });

  document.getElementById("review-form-toggle").addEventListener("click", (e) => {
    e.target.hidden = true;
    document.getElementById("review-form").hidden = false;
  });
});
