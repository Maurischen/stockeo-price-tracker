import { useState, useCallback } from "react";
import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import { useLoaderData, useSubmit, useNavigation } from "react-router";
import { buildBaseline } from "../lib/baseline.server";
import {
  Page,
  Layout,
  Card,
  DataTable,
  Text,
  Badge,
  Button,
  TextField,
  BlockStack,
  InlineStack,
  InlineGrid,
  Box,
  Banner,
  Select,
  Divider,
  EmptyState,
  Pagination,
} from "@shopify/polaris";

import { authenticate } from "../shopify.server";
import prisma from "../db.server";

const PAGE_SIZE = 25;
type ChangeRow = {
  id: string;
  productTitle: string | null;
  variantTitle: string | null;
  sku: string | null;
  oldPrice: number;
  newPrice: number;
  diff: number;
  pct: number | null;
  direction: "up" | "down" | string;
  detectedAt: string; // Prisma Date serialized
};

type LoaderData = {
  shop: string;
  stats: { total: number; ups: number; downs: number; variantCount: number };
  changes: ChangeRow[];
  pagination: { page: number; total: number; totalPages: number };
  search: string;
  direction: string;
};

// ── Loader ────────────────────────────────────────────────────────────
export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const url = new URL(request.url);
  const page = Number(url.searchParams.get("page") ?? "1") || 1;
  const search = url.searchParams.get("search") ?? "";
  const direction = url.searchParams.get("direction") ?? "";

  const [total, ups, downs, variantCount] = await Promise.all([
    prisma.priceChange.count({ where: { shop } }),
    prisma.priceChange.count({ where: { shop, direction: "up" } }),
    prisma.priceChange.count({ where: { shop, direction: "down" } }),
    prisma.variantSnapshot.count({ where: { shop } }),
  ]);

  const where: any = {
    shop,
    ...(direction ? { direction } : {}),
    ...(search
      ? {
          OR: [
            { productTitle: { contains: search, mode: "insensitive" } },
            { sku: { contains: search, mode: "insensitive" } },
            { variantTitle: { contains: search, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [changes, filteredTotal] = await Promise.all([
    prisma.priceChange.findMany({
      where,
      orderBy: { detectedAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.priceChange.count({ where }),
  ]);

  return Response.json({
    shop,
    stats: { total, ups, downs, variantCount },
    changes,
    pagination: {
      page,
      total: filteredTotal,
      totalPages: Math.max(1, Math.ceil(filteredTotal / PAGE_SIZE)),
    },
    search,
    direction,
  });
}

// ── Action ────────────────────────────────────────────────────────────
export async function action({ request }: ActionFunctionArgs) {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;

  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");

  if (intent === "clearHistory") {
    await prisma.priceChange.deleteMany({ where: { shop } });
    return Response.json({ ok: true });
  }

  if (intent === "buildBaseline") {
    const result = await buildBaseline({ admin, shop });
    console.log(`[baseline] shop=${shop} upserts=${result.totalUpserts}`);
    return Response.json({ ok: true, ...result });
  }

  return Response.json({ ok: false, error: "Unknown intent" }, { status: 400 });
}

// ── Helpers ───────────────────────────────────────────────────────────
function fmtPrice(n: number) {
  return Number(n).toFixed(2);
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtChangeBadgeText(c: any) {
  const arrow = c.direction === "up" ? "▲" : c.direction === "down" ? "▼" : "—";
  const diff = Number(c.diff ?? 0);
  const diffStr = `${diff >= 0 ? "+" : ""}${diff.toFixed(2)}`;
  const pctStr =
    c.pct !== null && c.pct !== undefined
      ? ` (${diff >= 0 ? "+" : ""}${c.pct}%)`
      : "";
  return `${arrow} ${diffStr}${pctStr}`;
}

// ── Component ─────────────────────────────────────────────────────────
export default function Dashboard() {
  const data = useLoaderData() as LoaderData;
  const submit = useSubmit();
  const navigation = useNavigation();

  const [search, setSearch] = useState(data.search ?? "");
  const [direction, setDirection] = useState(data.direction ?? "");

  const isSubmitting = navigation.state === "submitting";

  const handleBuildBaseline = useCallback(() => {
  const fd = new FormData();
  fd.set("intent", "buildBaseline");
  submit(fd, { method: "post" });
}, [submit]);

const handleClearHistory = useCallback(() => {
  if (confirm("Delete all logged price changes for this store? This cannot be undone.")) {
    const fd = new FormData();
    fd.set("intent", "clearHistory");
    submit(fd, { method: "post" });
  }
}, [submit]);

  const handleSearch = useCallback(() => {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (direction) params.set("direction", direction);
    params.set("page", "1");
    submit(params, { method: "get" });
  }, [submit, search, direction]);

  const rows = (data.changes ?? []).map((c: any) => [
    <BlockStack gap="050" key={c.id}>
      <Text variant="bodyMd" fontWeight="semibold" as="span">
        {c.productTitle ?? "(Unknown product)"}
      </Text>
      {c.variantTitle ? (
        <Text variant="bodySm" tone="subdued" as="span">
          {c.variantTitle}
        </Text>
      ) : null}
      {c.sku ? (
        <Text variant="bodySm" tone="subdued" as="span">
          SKU: {c.sku}
        </Text>
      ) : null}
    </BlockStack>,
    <Text variant="bodyMd" tone="subdued" as="span" key={`${c.id}-old`}>
      <s>{fmtPrice(c.oldPrice)}</s>
    </Text>,
    <Text variant="bodyMd" fontWeight="medium" as="span" key={`${c.id}-new`}>
      {fmtPrice(c.newPrice)}
    </Text>,
    <Badge
      key={`${c.id}-dir`}
      tone={c.direction === "up" ? "critical" : c.direction === "down" ? "success" : "attention"}
    >
      {fmtChangeBadgeText(c)}
    </Badge>,
    <Text variant="bodySm" tone="subdued" as="span" key={`${c.id}-date`}>
      {fmtDate(c.detectedAt)}
    </Text>,
  ]);

  return (
    <Page
      title="Price Change Tracker"
      subtitle="Logs product price changes (ideal for monitoring Stockeo updates)"
      primaryAction={
        <Button variant="primary" loading={isSubmitting} onClick={handleBuildBaseline}>
          Build baseline
        </Button>
      }
    >
      <Layout>
        {/* Stats */}
        <Layout.Section>
          <InlineGrid columns={4} gap="400">
            {[
              { label: "Variants tracked", value: data.stats.variantCount, tone: undefined },
              { label: "Total changes", value: data.stats.total, tone: undefined },
              { label: "Price increases", value: data.stats.ups, tone: "critical" as const },
              { label: "Price decreases", value: data.stats.downs, tone: "success" as const },
            ].map(({ label, value, tone }) => (
              <Card key={label}>
                <BlockStack gap="100">
                  <Text variant="bodySm" tone="subdued" as="p">
                    {label}
                  </Text>
                  <Text variant="heading2xl" fontWeight="bold" tone={tone as any} as="p">
                    {Number(value ?? 0).toLocaleString()}
                  </Text>
                </BlockStack>
              </Card>
            ))}
          </InlineGrid>
        </Layout.Section>

        {/* History */}
        <Layout.Section>
          <Card padding="0">
            <Box padding="400" paddingBlockEnd="300">
              <BlockStack gap="300">
                <InlineStack align="space-between" blockAlign="center">
                  <Text variant="headingMd" as="h2">
                    Price Change History
                  </Text>
                  <Button
                    tone="critical"
                    variant="plain"
                    onClick={handleClearHistory}
                    disabled={(data.stats.total ?? 0) === 0}
                  >
                    Clear history
                  </Button>
                </InlineStack>

                <InlineStack gap="300" wrap>
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <TextField
                      label=""
                      labelHidden
                      placeholder="Search product or SKU…"
                      value={search}
                      onChange={setSearch}
                      autoComplete="off"
                      clearButton
                      onClearButtonClick={() => {
                        setSearch("");
                        submit(new URLSearchParams({ page: "1" }), { method: "get" });
                      }}
                    />
                  </div>

                  <Select
                    label=""
                    labelHidden
                    options={[
                      { label: "All changes", value: "" },
                      { label: "Increases only", value: "up" },
                      { label: "Decreases only", value: "down" },
                    ]}
                    value={direction}
                    onChange={(v) => {
                      setDirection(v);
                      const params = new URLSearchParams();
                      if (search) params.set("search", search);
                      if (v) params.set("direction", v);
                      params.set("page", "1");
                      submit(params, { method: "get" });
                    }}
                  />

                  <Button onClick={handleSearch}>Search</Button>
                </InlineStack>
              </BlockStack>
            </Box>

            <Divider />

            {rows.length === 0 ? (
              <EmptyState
                heading={(data.stats.total ?? 0) === 0 ? "No price changes logged yet" : "No results found"}
                image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
              >
                <p>
                  {(data.stats.variantCount ?? 0) === 0
                    ? "Click Build baseline to record current prices. After that, price changes will appear here when Stockeo updates prices."
                    : "Try adjusting your search or filter."}
                </p>
              </EmptyState>
            ) : (
              <>
                <DataTable
                  columnContentTypes={["text", "text", "text", "text", "text"]}
                  headings={["Product", "Old Price", "New Price", "Change", "Detected"]}
                  rows={rows}
                  hoverable
                  increasedTableDensity
                />

                {(data.pagination.totalPages ?? 1) > 1 && (
                  <Box padding="400">
                    <InlineStack align="center">
                      <Pagination
                        hasPrevious={data.pagination.page > 1}
                        onPrevious={() => {
                          const params = new URLSearchParams();
                          if (search) params.set("search", search);
                          if (direction) params.set("direction", direction);
                          params.set("page", String(data.pagination.page - 1));
                          submit(params, { method: "get" });
                        }}
                        hasNext={data.pagination.page < data.pagination.totalPages}
                        onNext={() => {
                          const params = new URLSearchParams();
                          if (search) params.set("search", search);
                          if (direction) params.set("direction", direction);
                          params.set("page", String(data.pagination.page + 1));
                          submit(params, { method: "get" });
                        }}
                        label={`Page ${data.pagination.page} of ${data.pagination.totalPages} (${data.pagination.total} records)`}
                      />
                    </InlineStack>
                  </Box>
                )}
              </>
            )}
          </Card>
        </Layout.Section>

        {/* First-run callout */}
        {(data.stats.variantCount ?? 0) === 0 && (
          <Layout.Section>
            <Banner
              title="Build a baseline first"
              tone="info"
              action={{ content: "Build baseline", onAction: handleBuildBaseline }}
            >
              <p>
                Your first baseline stores the current prices for all variants. After that, when Stockeo updates prices,
                this app will log the differences.
              </p>
            </Banner>
          </Layout.Section>
        )}
      </Layout>
    </Page>
  );
}
