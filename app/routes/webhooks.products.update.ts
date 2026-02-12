// app/routes/webhooks.products.update.ts
import type { ActionFunctionArgs } from "react-router";
import prisma from "../db.server";
import { authenticate } from "../shopify.server";

function toNumberPrice(val: unknown) {
  const n = Number(val);
  return Number.isFinite(n) ? n : null;
}

export async function action({ request }: ActionFunctionArgs) {
  // This verifies HMAC, parses JSON, and returns { topic, shop, payload }
  const { topic, shop, payload } = await authenticate.webhook(request);

  // Depending on Shopify lib/version, this topic can be "products/update" or "PRODUCTS_UPDATE"
  const isProductsUpdate = topic === "products/update" || topic === "PRODUCTS_UPDATE";
  if (!isProductsUpdate) return new Response(null, { status: 200 });

  // Basic payload safety
  const productId = payload?.id ? String(payload.id) : null;
  const productTitle = payload?.title ? String(payload.title) : null;
  const variants = Array.isArray(payload?.variants) ? payload.variants : [];

  if (!variants.length) return new Response(null, { status: 200 });

  for (const v of variants) {
    const variantId = v?.id ? String(v.id) : null;
    if (!variantId) continue;

    const newPrice = toNumberPrice(v?.price);
    if (newPrice === null) continue;

    const sku = v?.sku ? String(v.sku) : null;
    const variantTitle = v?.title ? String(v.title) : null;

    // Find existing snapshot baseline
    const existing = await prisma.variantSnapshot.findUnique({
      where: { shop_variantId: { shop, variantId } }, // matches @@unique([shop, variantId])
    });

    // If no baseline exists yet for this variant, create it (NO price change log)
    if (!existing) {
      // Your schema requires productId, so fall back to "" if missing
      await prisma.variantSnapshot.create({
        data: {
          shop,
          variantId,
          productId: productId ?? "",
          sku,
          productTitle,
          variantTitle,
          price: newPrice,
          // capturedAt will auto default now() if you added it
          // updatedAt is automatic
        },
      });
      continue;
    }

    // If price changed, log it + update snapshot
    if (existing.price !== newPrice) {
      const diff = newPrice - existing.price;
      const pct =
        existing.price !== 0
          ? Number(((diff / existing.price) * 100).toFixed(2))
          : null;

      await prisma.priceChange.create({
        data: {
          shop,
          variantId,
          productId: productId ?? existing.productId ?? "",
          sku,
          productTitle: productTitle ?? existing.productTitle ?? null,
          variantTitle: variantTitle ?? existing.variantTitle ?? null,
          oldPrice: existing.price,
          newPrice,
          diff,
          pct,
          direction: diff > 0 ? "up" : "down",
          // detectedAt defaults to now()
        },
      });

      await prisma.variantSnapshot.update({
        where: { shop_variantId: { shop, variantId } },
        data: {
          price: newPrice,
          productId: productId ?? existing.productId,
          sku,
          productTitle: productTitle ?? existing.productTitle,
          variantTitle: variantTitle ?? existing.variantTitle,
          // updatedAt auto
        },
      });
    }
  }

  return new Response(null, { status: 200 });
}
