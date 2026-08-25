# Minimal embedded GoodData views

This React/Vite/TypeScript example provides two tabs: one saved GoodData visualization and one embedded, read-only dashboard.

## The two edits

1. Set the backend, workspace, and optional token in `.env`.
2. Set the visualization and optional dashboard IDs in `.env`.

The generated catalog formerly listed three dashboard IDs, but the live public `demo` workspace currently exposes no analytical dashboards. Those stale IDs cannot be rendered by the Dashboard component.

Then run:

```sh
npm install
npm run dev
```

The development server opens at `http://127.0.0.1:3000`. The host is intentionally loopback-only. API requests are sent through Vite's proxy so browser cookies stay same-origin.

The local `.env` file contains all runtime configuration:

```dotenv
GOODDATA_HOSTNAME=https://public-examples.gooddata.com
VITE_GOODDATA_WORKSPACE_ID=demo
VITE_GOODDATA_DASHBOARD_ID=
VITE_GOODDATA_PIVOT_TABLE_ID=
TIGER_API_TOKEN=your-development-token
PORT=3000
```

`.env` is ignored by Git. `.env.example` documents the required keys without containing a secret. The `VITE_` workspace and content IDs are public metadata and are available to browser code through `import.meta.env`. The token and backend hostname have no `VITE_` prefix and remain server-only.

`VITE_GOODDATA_DASHBOARD_ID` is empty because the live public `demo` workspace currently exposes no analytical dashboards. The Dashboard tab points to this setting until a dashboard ID is provided.

`VITE_GOODDATA_PIVOT_TABLE_ID` is optional. When it is empty or does not match an accessible visual, the Single visual tab loads the complete workspace insight catalog and selects the first item. Use the picker to switch visuals.

Do not use the development proxy as a production authentication layer. In production, serve the built files behind an HTTPS reverse proxy, authenticate on the server, restrict iframe parents with an HTTP `Content-Security-Policy: frame-ancestors ...` header, and keep secrets out of the static bundle.

The default insight is a pivot-style table. Other saved tables in the demo workspace include `all_products`, `all_customers`, and `percent_revenue_per_product_by_customer_and_category`.

## Checks

```sh
npm run typecheck
npm run build
```
