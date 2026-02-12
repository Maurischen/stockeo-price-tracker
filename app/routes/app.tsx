// app/routes/app.tsx
import type { LoaderFunctionArgs } from "react-router";
import { Outlet } from "react-router";
import { authenticate } from "../shopify.server";

import { AppProvider as PolarisAppProvider } from "@shopify/polaris";
import enTranslations from "@shopify/polaris/locales/en.json";
import "@shopify/polaris/build/esm/styles.css";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  // Ensures embedded auth/session is valid
  await authenticate.admin(request);
  return null;
};

export default function App() {
  return (
    <PolarisAppProvider i18n={enTranslations}>
      <Outlet />
    </PolarisAppProvider>
  );
}
