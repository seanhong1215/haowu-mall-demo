// Shared star-rating markup used on product cards and the product detail page.
function starRatingHTML(avg, count) {
  if (!count) return `<span class="rating rating--empty">尚無評價</span>`;
  const filled = Math.round(avg);
  const stars = "★".repeat(filled) + "☆".repeat(5 - filled);
  return `<span class="rating" title="${avg.toFixed(1)} / 5"><span class="rating__stars">${stars}</span><span class="rating__count">(${count})</span></span>`;
}
