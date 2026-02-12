// app/lib/baseline.server.ts
import prisma from "../db.server";

type AdminClient = {
  graphql: (query: string, options?: { variables?: any }) => Promise<any>;
};

const VARIANTS_QUERY = `#graphql
  query VariantsForBaseline($cursor: String) {
    productVariants(first: 250, after: $cursor) {
      pageInfo { hasNextPage endCursor }
      edges {
        node {
          id
          sku
          title
          price
          product {
            id
            title
          }
        }
      }
    }
  }
`;

function gidToId(gid: string) {
  // "gid://shopify/ProductVariant/123" -> "123"
  const parts = String(gid).split("/");
  return parts[parts.length - 1] ?? gid;
}

export async function buildBaseline({
  admin,
  shop,
}: {
  admin: AdminClient;
  shop: string;
}) {
  let cursor: string | null = null;
  let totalUpserts = 0;

  while (true) {
const resp = await admin.graphql(VARIANTS_QUERY, { variables: { cursor } });

const json =
  typeof (resp as any)?.json === "function"
    ? await (resp as any).json()
    : (resp as any);

const data = json?.data ?? json?.body?.data;
const errors = json?.errors ?? json?.body?.errors;

if (errors?.length) {
  throw new Error(`Shopify GraphQL errors: ${JSON.stringify(errors)}`);
}

const payload = data?.productVariants;

    const edges = payload?.edges ?? [];
    const pageInfo = payload?.pageInfo;

    for (const edge of edges) {
      const v = edge?.node;
      if (!v?.id) continue;

      const variantId = gidToId(v.id);
      const productId = v.product?.id ? gidToId(v.product.id) : "";
      const sku = v.sku ?? null;
      const productTitle = v.product?.title ?? null;
      const variantTitle = v.title ?? null;

      const priceNum = Number(v.price);
      if (!Number.isFinite(priceNum)) continue;

      await prisma.variantSnapshot.upsert({
        where: { shop_variantId: { shop, variantId } },
        create: {
          shop,
          variantId,
          productId,
          sku,
          productTitle,
          variantTitle,
          price: priceNum,
          // capturedAt will default if you add it in schema
        },
        update: {
          productId,
          sku,
          productTitle,
          variantTitle,
          price: priceNum,
          // updatedAt auto
        },
      });

      totalUpserts++;
    }

    if (!pageInfo?.hasNextPage) break;
    cursor = pageInfo.endCursor;
  }

  return { totalUpserts };
}
