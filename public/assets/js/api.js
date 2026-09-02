// Thin fetch wrapper shared by every page — talks to the Cloudflare Pages
// Functions under /api/* (see /functions in the project root).
const Api = {
  async get(path) {
    const res = await fetch(path, { credentials: "include" });
    return Api._handle(res);
  },
  async post(path, body) {
    const res = await fetch(path, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return Api._handle(res);
  },
  async patch(path, body) {
    const res = await fetch(path, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return Api._handle(res);
  },
  async _handle(res) {
    let data = null;
    try {
      data = await res.json();
    } catch {
      /* no body */
    }
    if (!res.ok) {
      const message = (data && data.error) || `Request failed (${res.status})`;
      throw new Error(message);
    }
    return data;
  },
};

// price_cents is stored as NT$ × 100 ("分") — displayed as whole New Taiwan
// Dollars, matching how prices are shown on Taiwanese e-commerce sites.
// Built manually (not style:"currency") because Intl's TWD currency symbol
// is inconsistent across browsers/OS locale data — some render "NT$", some
// just "$", which reads as ambiguous. "NT$" is unambiguous everywhere.
const priceFormatter = new Intl.NumberFormat("zh-TW", { maximumFractionDigits: 0 });
function formatPrice(cents) {
  return `NT$${priceFormatter.format(cents / 100)}`;
}

// ---------- product "photos" ----------
// This demo has no real product photography, and random stock-photo
// placeholders (the previous approach) look actively wrong — a t-shirt
// showing a photo of palm trees erodes trust fast. Instead, every product
// gets a generated on-brand tile: a category-tinted gradient plus a simple
// line icon, picked deterministically from its image_seed (seeds are
// prefixed by category, e.g. "gadget-earbuds", "beauty-serum"). No network
// request, no mismatch, and it reads clearly as "placeholder" rather than
// as a wrong photo.
const CATEGORY_VISUALS = {
  gadget: {
    colors: ["#7091b3", "#44607e"],
    icon: `<rect x="115" y="90" width="170" height="112" rx="10"/><line x1="164" y1="128" x2="236" y2="128"/><rect x="90" y="208" width="220" height="16" rx="8"/>`,
  },
  beauty: {
    colors: ["#e0a9bd", "#bb7793"],
    icon: `<rect x="178" y="86" width="44" height="38" rx="6"/><rect x="152" y="124" width="96" height="122" rx="14"/><line x1="152" y1="168" x2="248" y2="168"/>`,
  },
  fashion: {
    colors: ["#b39ad6", "#8069ab"],
    icon: `<polygon points="168,92 188,92 200,78 212,92 232,92 258,120 234,144 234,246 166,246 166,144 142,120"/>`,
  },
  arden: {
    colors: ["#d7ab7a", "#ad8253"],
    icon: `<polygon points="200,82 262,138 138,138"/><rect x="150" y="138" width="100" height="96"/><rect x="184" y="172" width="32" height="62"/>`,
  },
  grocery: {
    colors: ["#94bf8f", "#67955f"],
    icon: `<path d="M170 150 Q200 92 230 150"/><polygon points="152,150 248,150 233,232 167,232"/>`,
  },
};
const DEFAULT_VISUAL = CATEGORY_VISUALS.arden;

function visualForSeed(seed) {
  const prefix = String(seed).split("-")[0];
  return CATEGORY_VISUALS[prefix] || DEFAULT_VISUAL;
}

// Cache by seed+index so repeated calls (card + gallery thumb + cart line
// for the same product) reuse one generated string instead of rebuilding it.
const _placeholderCache = new Map();

function imageUrl(seed, index = 1, w = 900, h = 1125) {
  const cacheKey = `${seed}-${index}-${w}x${h}`;
  if (_placeholderCache.has(cacheKey)) return _placeholderCache.get(cacheKey);

  const visual = visualForSeed(seed);
  const gradientId = `g${Math.abs(hashCode(cacheKey))}`;
  const rotation = (hashCode(`${seed}-${index}`) % 7) - 3; // -3..3deg, subtle per-slot variation
  const iconScale = Math.min(w, h) / 400;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    <defs>
      <linearGradient id="${gradientId}" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="${visual.colors[0]}"/>
        <stop offset="1" stop-color="${visual.colors[1]}"/>
      </linearGradient>
    </defs>
    <rect width="${w}" height="${h}" fill="url(#${gradientId})"/>
    <g transform="translate(${w / 2} ${h / 2}) rotate(${rotation}) scale(${iconScale}) translate(-200 -200)"
       fill="none" stroke="#ffffff" stroke-opacity="0.92" stroke-width="9" stroke-linejoin="round" stroke-linecap="round">
      ${visual.icon}
    </g>
  </svg>`;

  const uri = `data:image/svg+xml,${encodeURIComponent(svg)}`;
  _placeholderCache.set(cacheKey, uri);
  return uri;
}

// Generic "nothing here" icon for empty states (empty cart, no search
// results, no orders yet) — reused instead of leaving those screens as
// bare text.
function emptyStateIcon(size = 56) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="5" stroke-linejoin="round" stroke-linecap="round">
    <path d="M15 40 L50 25 L85 40 L85 75 L50 90 L15 75 Z"/>
    <path d="M15 40 L50 55 L85 40"/>
    <path d="M50 55 L50 90"/>
    <path d="M30 18 L39 32 M70 18 L61 32" opacity="0.45"/>
  </svg>`;
}

// Skeleton placeholder cards for product grids while the first fetch is in
// flight — replaces a bare "loading…" line with something that at least
// hints at the layout that's about to appear.
function skeletonCardsHTML(count = 5) {
  return Array.from({ length: count })
    .map(
      () => `
    <div class="skeleton-card">
      <div class="skeleton-card__media"></div>
      <div class="skeleton-card__line"></div>
      <div class="skeleton-card__line skeleton-card__line--short"></div>
    </div>`
    )
    .join("");
}

function hashCode(str) {
  let hash = 0;
  for (const ch of str) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  return hash;
}
