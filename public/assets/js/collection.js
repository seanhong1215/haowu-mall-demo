const COLLECTIONS = ["全部", "3C家電", "美妝保養", "時尚服飾", "生活居家", "食品雜貨"];

async function loadCollection() {
  const params = new URLSearchParams(location.search);
  const collection = params.get("collection") || "全部";
  const sort = params.get("sort") || "newest";
  const q = params.get("q") || "";

  document.querySelectorAll(".chip").forEach((chip) => {
    chip.setAttribute("aria-pressed", String(chip.dataset.collection === collection));
  });
  document.getElementById("sort-select").value = sort;
  document.getElementById("collection-title").textContent = q
    ? `搜尋「${q}」的結果`
    : collection === "全部"
      ? "全部商品"
      : collection;

  const grid = document.getElementById("collection-grid");
  grid.innerHTML = `<p class="text-muted">商品載入中…</p>`;

  const query = new URLSearchParams();
  if (collection !== "全部" && !q) query.set("collection", collection);
  query.set("sort", sort);

  try {
    const { products: all } = await Api.get(`/api/products?${query.toString()}`);
    const products = q ? all.filter((p) => p.title.includes(q) || p.description.includes(q)) : all;
    grid.innerHTML = products.length
      ? products.map((p) => productCardHTML(p)).join("")
      : `<p class="empty-state">找不到符合條件的商品。</p>`;
  } catch (err) {
    grid.innerHTML = `<p class="banner banner--error">商品載入失敗：${err.message}</p>`;
  }
}

function setParam(key, value) {
  const url = new URL(location.href);
  if (value === "全部" || !value) url.searchParams.delete(key);
  else url.searchParams.set(key, value);
  url.searchParams.delete("q");
  history.pushState({}, "", url);
  loadCollection();
}

document.addEventListener("DOMContentLoaded", () => {
  const chipGroup = document.getElementById("chip-group");
  chipGroup.innerHTML = COLLECTIONS.map(
    (c) => `<button class="chip" data-collection="${c}" aria-pressed="false">${c}</button>`
  ).join("");
  chipGroup.addEventListener("click", (e) => {
    const chip = e.target.closest(".chip");
    if (chip) setParam("collection", chip.dataset.collection);
  });

  document.getElementById("sort-select").addEventListener("change", (e) => setParam("sort", e.target.value));

  loadCollection();
});
window.addEventListener("popstate", loadCollection);
