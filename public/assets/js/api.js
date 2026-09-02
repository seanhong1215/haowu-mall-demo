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

function imageUrl(seed, index = 1, w = 900, h = 1125) {
  return `https://picsum.photos/seed/${seed}-${index}/${w}/${h}`;
}
