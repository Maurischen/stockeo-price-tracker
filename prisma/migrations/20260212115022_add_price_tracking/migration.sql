-- CreateTable
CREATE TABLE "VariantSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "sku" TEXT,
    "productTitle" TEXT,
    "variantTitle" TEXT,
    "price" REAL NOT NULL,
    "currency" TEXT,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "PriceChange" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "sku" TEXT,
    "productTitle" TEXT,
    "variantTitle" TEXT,
    "oldPrice" REAL NOT NULL,
    "newPrice" REAL NOT NULL,
    "diff" REAL NOT NULL,
    "pct" REAL,
    "direction" TEXT NOT NULL,
    "detectedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "VariantSnapshot_shop_variantId_key" ON "VariantSnapshot"("shop", "variantId");

-- CreateIndex
CREATE INDEX "PriceChange_shop_idx" ON "PriceChange"("shop");
