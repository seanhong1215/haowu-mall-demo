// Renders the header / footer / cart-drawer "chrome" shared by every
// storefront page into the placeholder elements each page includes:
//   <header id="site-header"></header>
//   <footer id="site-footer"></footer>
//   <div id="cart-drawer-root"></div>
// A zero-build alternative to a templating engine — see README
// "Architecture decisions" for why this project doesn't use one.

const NAV_LINKS = [
  { href: "/index.html", label: "首頁" },
  { href: "/collection.html", label: "全部商品" },
  { href: "/collection.html?collection=3C家電", label: "3C家電" },
  { href: "/collection.html?collection=美妝保養", label: "美妝保養" },
  { href: "/collection.html?collection=時尚服飾", label: "時尚服飾" },
  { href: "/collection.html?collection=生活居家", label: "生活居家" },
  { href: "/collection.html?collection=食品雜貨", label: "食品雜貨" },
];

function renderHeader() {
  const el = document.getElementById("site-header");
  if (!el) return;
  el.innerHTML = `
    <div class="top-bar">
      <div class="container">
        <a href="/account/login.html">會員登入</a>
        <a href="/account/register.html">註冊</a>
        <a href="/account/orders.html">我的訂單</a>
        <a href="/admin/login.html">賣家後台</a>
        <span>客服專線 0800-000-000</span>
      </div>
    </div>
    <div class="site-header__bar container">
      <button class="icon-btn nav-toggle" id="nav-toggle" aria-expanded="false" aria-controls="mobile-nav">☰ <span class="visually-hidden">選單</span></button>
      <a href="/index.html" class="site-header__logo">好物<span>商城</span></a>
      <form class="site-header__search" id="site-search" role="search">
        <input type="search" name="q" placeholder="搜尋商品、品牌、關鍵字" aria-label="搜尋商品">
        <button type="submit">搜尋</button>
      </form>
      <div class="site-header__actions">
        <span id="account-slot" class="account-slot"></span>
        <button class="icon-btn" data-open-cart aria-label="開啟購物車">
          🛒 購物車 <span class="cart-count" id="cart-count">0</span>
        </button>
      </div>
    </div>
    <nav class="category-nav" aria-label="商品分類">
      <ul class="category-nav__list">
        ${NAV_LINKS.map((l) => `<li><a href="${l.href}">${l.label}</a></li>`).join("")}
      </ul>
    </nav>
    <nav id="mobile-nav" hidden aria-label="行動選單">
      <ul class="site-header__nav" style="flex-direction:column;padding:12px 20px 16px;gap:14px;background:#fff;">
        ${NAV_LINKS.map((l) => `<li><a href="${l.href}">${l.label}</a></li>`).join("")}
      </ul>
    </nav>
  `;

  const toggle = document.getElementById("nav-toggle");
  const mobileNav = document.getElementById("mobile-nav");
  toggle.addEventListener("click", () => {
    const isOpen = mobileNav.hidden === false;
    mobileNav.hidden = isOpen;
    toggle.setAttribute("aria-expanded", String(!isOpen));
  });

  document.getElementById("site-search").addEventListener("submit", (e) => {
    e.preventDefault();
    const q = e.target.q.value.trim();
    location.href = q ? `/collection.html?q=${encodeURIComponent(q)}` : "/collection.html";
  });

  renderAccountState();
}

async function renderAccountState() {
  const slot = document.getElementById("account-slot");
  if (!slot) return;
  try {
    const { customer } = await Api.get("/api/customers/me");
    slot.innerHTML = customer
      ? `<a href="/account/orders.html" class="icon-btn" style="text-decoration:none;">Hi, ${customer.name}</a>`
      : `<a href="/account/login.html" class="icon-btn" style="text-decoration:none;">會員登入</a>`;
  } catch {
    slot.innerHTML = `<a href="/account/login.html" class="icon-btn" style="text-decoration:none;">會員登入</a>`;
  }
}

function renderFooter() {
  const el = document.getElementById("site-footer");
  if (!el) return;
  el.innerHTML = `
    <div class="container">
      <div class="site-footer__grid">
        <div>
          <h4>好物商城</h4>
          <p class="text-muted" style="color:#999;">天天好物，件件優惠。一個為了作品集 Demo 虛構的電商平台。</p>
        </div>
        <div>
          <h4>購物指南</h4>
          <ul>
            <li><a href="/collection.html">全部商品</a></li>
            <li><a href="/cart.html">購物車</a></li>
            <li><a href="/checkout.html">結帳</a></li>
          </ul>
        </div>
        <div>
          <h4>會員服務</h4>
          <ul>
            <li><a href="/account/login.html">會員登入</a></li>
            <li><a href="/account/orders.html">我的訂單</a></li>
            <li><a href="/account/profile.html">個人資料</a></li>
            <li><a href="/admin/login.html">賣家後台</a></li>
          </ul>
        </div>
        <div>
          <h4>訂閱電子報</h4>
          <p class="text-muted" style="color:#999;">獲得最新優惠與新品資訊。</p>
        </div>
      </div>
      <div class="site-footer__bottom">
        <span>© ${new Date().getFullYear()} 好物商城 — Demo 展示網站，非真實交易平台。</span>
        <span>技術架構：Cloudflare Pages · Pages Functions · D1</span>
      </div>
    </div>
  `;
}

function renderCartDrawer() {
  const root = document.getElementById("cart-drawer-root");
  if (!root) return;
  root.innerHTML = `
    <div class="cart-drawer-backdrop" id="cart-backdrop"></div>
    <aside class="cart-drawer" id="cart-drawer" aria-hidden="true" aria-label="購物車">
      <div class="cart-drawer__header">
        <h2 style="margin:0;font-size:1.1rem;">購物車</h2>
        <button class="cart-drawer__close" id="cart-close" aria-label="關閉購物車">×</button>
      </div>
      <div class="cart-drawer__items" id="cart-items"></div>
      <div class="cart-drawer__footer" id="cart-footer"></div>
    </aside>
  `;
  document.getElementById("cart-backdrop").addEventListener("click", closeCart);
  document.getElementById("cart-close").addEventListener("click", closeCart);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeCart();
  });
  updateCartUI();
}

function openCart() {
  document.body.classList.add("cart-open");
  document.getElementById("cart-drawer")?.setAttribute("aria-hidden", "false");
}
function closeCart() {
  document.body.classList.remove("cart-open");
  document.getElementById("cart-drawer")?.setAttribute("aria-hidden", "true");
}

function updateCartUI() {
  const lines = Cart.get();
  const countEl = document.getElementById("cart-count");
  if (countEl) countEl.textContent = String(Cart.count());

  const itemsEl = document.getElementById("cart-items");
  const footerEl = document.getElementById("cart-footer");
  if (!itemsEl || !footerEl) return;

  if (lines.length === 0) {
    itemsEl.innerHTML = `<div class="cart-drawer__empty">${emptyStateIcon(48)}<p>購物車還是空的。</p><a href="/collection.html" class="btn btn--outline">去逛逛</a></div>`;
    footerEl.innerHTML = "";
    return;
  }

  itemsEl.innerHTML = lines
    .map(
      (l) => `
    <div class="cart-line" data-product="${l.productId}" data-variant="${l.variantId ?? ""}">
      <img src="${imageUrl(l.imageSeed, 1, 160, 160)}" alt="${l.title}">
      <div class="cart-line__info">
        <div class="cart-line__title">${l.title}</div>
        ${l.variantLabel ? `<div class="cart-line__variant">${l.variantLabel}</div>` : ""}
        <div class="cart-line__row">
          <div class="qty-input">
            <button class="qty-dec" aria-label="減少數量">−</button>
            <input type="text" readonly value="${l.quantity}" aria-label="數量">
            <button class="qty-inc" aria-label="增加數量">+</button>
          </div>
          <span class="price">${formatPrice(l.priceCents * l.quantity)}</span>
        </div>
        <button class="cart-line__remove">移除</button>
      </div>
    </div>`
    )
    .join("");

  itemsEl.querySelectorAll(".cart-line").forEach((row) => {
    const productId = Number(row.dataset.product);
    const variantId = row.dataset.variant ? Number(row.dataset.variant) : null;
    const line = lines.find((l) => Cart.lineKey(l.productId, l.variantId) === Cart.lineKey(productId, variantId));
    row.querySelector(".qty-inc").addEventListener("click", () => Cart.updateQuantity(productId, variantId, line.quantity + 1));
    row.querySelector(".qty-dec").addEventListener("click", () => Cart.updateQuantity(productId, variantId, line.quantity - 1));
    row.querySelector(".cart-line__remove").addEventListener("click", () => Cart.remove(productId, variantId));
  });

  footerEl.innerHTML = `
    <div class="cart-drawer__subtotal"><span>小計</span><span>${formatPrice(Cart.subtotalCents())}</span></div>
    <a href="/checkout.html" class="btn btn--accent btn--block" style="margin-bottom:8px;">前往結帳</a>
    <a href="/cart.html" class="btn btn--outline btn--block">查看購物車</a>
  `;
}

document.addEventListener("DOMContentLoaded", () => {
  renderHeader();
  renderFooter();
  renderCartDrawer();
  document.body.addEventListener("click", (e) => {
    const opener = e.target.closest("[data-open-cart]");
    if (opener) {
      e.preventDefault();
      openCart();
    }
  });
});
document.addEventListener("cart:updated", updateCartUI);
