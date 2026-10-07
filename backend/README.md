# X Buddy — Backend Codebase

The backend ecosystem for X Buddy, comprising serverless order management, local print agent automation, and Google Apps Script integrations.

## Architecture & Subsystems

1. **`api/` (Vercel Serverless Functions)**
   - `orders.js`: Primary authoritative Orders API (`saveOrder`, `getOrderStatus`, `listOrders`, `updateOrderStatus`, `updatePaymentStatus`).
   - `_lib/mongodb.js`: MongoDB Atlas client pool connection.
   - `_lib/parityAudit.js`: Parity auditor comparing MongoDB Atlas vs legacy Google Sheet.
   - `_lib/backfill.js`: Safe backfill migration utility.
   - `agent/orders.js`: Dedicated, secret-authenticated agent synchronization endpoints.

2. **`print-agent/` (Local Print Station)**
   - Node.js Express server running on `http://localhost:3001`.
   - Manages physical hardware printing via SumatraPDF (`EPSON L130 Series`).
   - Handles grayscale DeviceGray conversion, local file staging, and Cloudflare tunnel status monitoring.

3. **`google-apps-script/` (GAS Archive & Campus Ads)**
   - `CampusAds.gs`: Active Campus Advertisement management.
   - `Code.gs`: Frozen legacy orders sheet backend.

4. **`scripts/` & `test/`**
   - Live audit and regression testing suites.

## Available Scripts

```bash
# Run backend regression tests
npm test

# Run local Print Agent
npm run agent

# Run database parity audit
npm run audit

# Run historical backfill dry run
npm run backfill
```
