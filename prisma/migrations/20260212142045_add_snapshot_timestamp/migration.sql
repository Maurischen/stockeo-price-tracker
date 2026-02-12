-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_VariantSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "sku" TEXT,
    "productTitle" TEXT,
    "variantTitle" TEXT,
    "price" REAL NOT NULL,
    "currency" TEXT,
    "capturedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_VariantSnapshot" ("currency", "id", "price", "productId", "productTitle", "shop", "sku", "updatedAt", "variantId", "variantTitle") SELECT "currency", "id", "price", "productId", "productTitle", "shop", "sku", "updatedAt", "variantId", "variantTitle" FROM "VariantSnapshot";
DROP TABLE "VariantSnapshot";
ALTER TABLE "new_VariantSnapshot" RENAME TO "VariantSnapshot";
CREATE UNIQUE INDEX "VariantSnapshot_shop_variantId_key" ON "VariantSnapshot"("shop", "variantId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
