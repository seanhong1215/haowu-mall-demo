import { json, errorJson } from "../lib/json.js";
import { requireAdmin, currentCustomerId } from "../lib/auth.js";

const FREE_SHIPPING_THRESHOLD_CENTS = 99000; // NT$990
const FLAT_SHIPPING_CENTS = 8000; // NT$80 flat-rate home delivery
// Taiwan retail prices are VAT-inclusive by law (營業稅內含) — unlike US sales
// tax, nothing is added at checkout, so this stays 0. The column/UI still
// exist (and would light back up) in case a future variant of this demo
// needs a market where tax is added on top.
const TAX_RATE = 0;

// GET /api/orders — admin only, list of orders (newest first)
export async function onRequestGet({ request, env }) {
  if (!(await requireAdmin(request, env))) return errorJson("Unauthorized", 401);

  const { results: orders } = await env.DB.prepare(
    `SELECT * FROM orders ORDER BY created_at DESC`
  ).all();
  return json({ orders });
}

// POST /api/orders — public checkout endpoint.
// Body: { customerName, customerEmail, shippingAddress, items: [{ productId, variantId, quantity }],
//         paymentCardBrand?, paymentCardLast4? }
// Prices, tax, and shipping are all computed server-side; the client's cart totals are never trusted.
// If a customer is logged in (customer_session cookie), the order is linked to their account.
export async function onRequestPost({ request, env }) {
  const body = await request.json().catch(() => null);
  if (!body) return errorJson("Invalid JSON body", 400);

  const { customerName, customerEmail, shippingAddress, items, paymentCardBrand, paymentCardLast4 } = body;
  if (!customerName || !customerEmail || !shippingAddress) {
    return errorJson("請填寫收件人姓名、電子郵件與收件地址", 400);
  }
  if (!Array.isArray(items) || items.length === 0) {
    return errorJson("購物車是空的", 400);
  }

  const orderItems = [];
  let subtotalCents = 0;

  for (const item of items) {
    const productId = Number(item.productId);
    const quantity = Number(item.quantity);
    if (!Number.isFinite(productId) || !Number.isFinite(quantity) || quantity < 1) {
      return errorJson("購物車內含無效的商品項目", 400);
    }

    const product = await env.DB.prepare(`SELECT * FROM products WHERE id = ?`).bind(productId).first();
    if (!product) return errorJson(`商品（編號 ${productId}）已下架`, 400);

    let variant = null;
    if (item.variantId != null) {
      variant = await env.DB.prepare(`SELECT * FROM product_variants WHERE id = ? AND product_id = ?`)
        .bind(Number(item.variantId), productId)
        .first();
      if (!variant) return errorJson(`「${product.title}」所選規格已下架`, 400);
      if (variant.inventory < quantity) {
        return errorJson(`「${product.title} — ${variant.value}」庫存不足`, 409);
      }
    }

    const lineTotal = product.price_cents * quantity;
    subtotalCents += lineTotal;
    orderItems.push({
      productId: product.id,
      variantId: variant ? variant.id : null,
      title: product.title,
      variantLabel: variant ? `${variant.option_name}: ${variant.value}` : null,
      priceCents: product.price_cents,
      quantity,
    });
  }

  const shippingCents = subtotalCents >= FREE_SHIPPING_THRESHOLD_CENTS ? 0 : FLAT_SHIPPING_CENTS;
  const taxCents = Math.round(subtotalCents * TAX_RATE);
  const totalCents = subtotalCents + shippingCents + taxCents;

  const orderNumber = `HW${Date.now().toString(36).toUpperCase()}`;

  // The session cookie only proves the id was signed by us — it doesn't
  // guarantee the account still exists (e.g. it was deleted, or a stale
  // cookie survived a database reset during development). Falling back to
  // a guest order here avoids a hard 500 from the FK constraint below.
  let customerId = await currentCustomerId(request, env);
  if (customerId) {
    const customerExists = await env.DB.prepare(`SELECT id FROM customers WHERE id = ?`).bind(customerId).first();
    if (!customerExists) customerId = null;
  }

  const [insertedOrder] = await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO orders
        (order_number, customer_id, customer_name, customer_email, shipping_address,
         subtotal_cents, shipping_cents, tax_cents, total_cents, payment_card_brand, payment_card_last4)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      orderNumber,
      customerId,
      customerName,
      customerEmail,
      shippingAddress,
      subtotalCents,
      shippingCents,
      taxCents,
      totalCents,
      paymentCardBrand || null,
      paymentCardLast4 || null
    ),
  ]);
  const orderId = insertedOrder.meta.last_row_id;

  const followUps = [
    env.DB.prepare(`INSERT INTO order_events (order_id, status, note) VALUES (?, 'pending', '訂單已成立')`).bind(
      orderId
    ),
  ];
  for (const li of orderItems) {
    followUps.push(
      env.DB.prepare(
        `INSERT INTO order_items (order_id, product_id, variant_id, title, variant_label, price_cents, quantity)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).bind(orderId, li.productId, li.variantId, li.title, li.variantLabel, li.priceCents, li.quantity)
    );
    if (li.variantId) {
      followUps.push(
        env.DB.prepare(`UPDATE product_variants SET inventory = inventory - ? WHERE id = ?`).bind(
          li.quantity,
          li.variantId
        )
      );
    }
  }
  await env.DB.batch(followUps);

  return json(
    {
      order: {
        orderNumber,
        customerName,
        customerEmail,
        shippingAddress,
        subtotalCents,
        shippingCents,
        taxCents,
        totalCents,
        items: orderItems,
      },
    },
    { status: 201 }
  );
}
