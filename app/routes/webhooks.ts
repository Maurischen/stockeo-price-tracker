import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export async function action({ request }: ActionFunctionArgs) {
  const { topic, shop, payload } = await authenticate.webhook(request);

  if (topic === "PRODUCTS_UPDATE") {
    for (const variant of payload.variants || []) {
      const variantId = String(variant.id);
      const newPrice = parseFloat(variant.price);

      const existing = await prisma.variantSnapshot.findUnique({
        where: {
          shop_variantId: {
            shop,
            variantId,
          },
        },
      });

      if (!existing) {
        // baseline not built yet
        await prisma.variantSnapshot.create({
          data: {
            shop,
            variantId,
            productId: String(payload.id),
            sku: variant.sku,
            productTitle: payload.title,
            variantTitle: variant.title,
            price: newPrice,
          },
        });
        continue;
      }

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
            productId: String(payload.id),
            sku: variant.sku,
            productTitle: payload.title,
            variantTitle: variant.title,
            oldPrice: existing.price,
            newPrice,
            diff,
            pct,
            direction: diff > 0 ? "up" : "down",
          },
        });

        await prisma.variantSnapshot.update({
          where: {
            shop_variantId: { shop, variantId },
          },
          data: { price: newPrice },
        });
      }
    }
  }

  if (topic === "APP_UNINSTALLED") {
    await prisma.variantSnapshot.deleteMany({ where: { shop } });
    await prisma.priceChange.deleteMany({ where: { shop } });
  }

  return new Response();
}
