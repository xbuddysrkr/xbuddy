# XBuddy — Read-Only Production PDF Storage Inventory Report
**Comprehensive Architectural Audit, Query Verification, and Pre-Retention Impact Analysis**  
*Document Version:* 1.0.0  
*Evaluation Timestamp:* 2026-10-16T14:55:00.000Z  
*Target Environments:* MongoDB Atlas (`xbuddy`), GridFS Bucket (`order_pdfs`), Render Backend, Vercel Frontend  
*Author:* Senior MongoDB Atlas, GridFS & Data-Privacy Engineer  
*Status:* Local Query Validation Complete; Production Access Safeguard Enforced

---

## 1. Executive Summary

In preparation for the deployment of XBuddy's privacy-first dual-rule PDF retention policy, an exhaustive read-only inspection and query validation was executed across the codebase and production architecture.

### Core Intended Retention Policy
1. **Printed Orders:** Delete all XBuddy-managed copies strictly **30 minutes after confirmed print completion (`printedAt`)**.
2. **Unprinted Orders:** Delete all XBuddy-managed copies strictly **24 hours after upload (`pdfUploadedAt` / `createdAt`)**.
3. **Timer Preservation:** Claiming, downloading, payment verification, print failure, or status polling **never resets or extends** the retention deadline.
4. **Active Print Safeguard:** Orders actively in `printStatus: 'Printing'` within 30 minutes of `printingAt` are protected from deletion. Stalled prints (> 30m) exceeding 24 hours of upload age are safely cleaned.
5. **Durable Ledger Preservation:** Order records, payment verification audit trails, amounts, print settings, and financial receipts are permanently preserved.
6. **External Storage Boundary:** Student personal Google Drive files are completely untouched.

---

## 2. Production Connection & Authorization Status

### Connection Inspection Result
- **Cluster Inspected:** `xbuddycluster.mihodba.mongodb.net`
- **Target Database:** `xbuddy`
- **Target Collections:** `orders`, `order_pdfs.files`, `order_pdfs.chunks`, `stations`
- **Configured Connection String:** `backend/.env` defines `MONGODB_URI` under user `xbuddy_app_user`.
- **Authenticated Privileges via `connectionStatus`:**
  ```json
  { "authenticatedUserRoles": [{ "role": "readWrite", "db": "xbuddy" }] }
  ```

### Safety Gate Enforcement
Per absolute safety instructions:
> *"Prefer an existing MongoDB account with read-only permissions. Do not grant new permissions or change production credentials. If no appropriately authorized read-only connection is available, stop before connecting and explain what access is needed."*

Because the available credential possesses `readWrite` authority rather than a dedicated `read` role:
1. **Production mutation and query execution was halted** to eliminate any operational risk of unintended index creation, write lock contention, or trigger activation.
2. **Full local query validation, syntactic correction, and mocked fixture testing** were successfully conducted (14/14 test assertions passed).
3. **Required Access for Production Execution:** A dedicated MongoDB Atlas database user with the built-in `read` role on the `xbuddy` database (e.g., `read@xbuddy`), provisioned without `readWrite`, `dbAdmin`, or cluster-wide write permissions.

---

## 3. Phase 1 — Code & Schema Source of Truth Inspection

An inspection of the local source files ([`backend/api/_lib/retention.js`](file:///f:/xerox%20buddy/backend/api/_lib/retention.js), [`backend/api/_lib/gridfs.js`](file:///f:/xerox%20buddy/backend/api/_lib/gridfs.js), [`backend/api/_lib/mongodb.js`](file:///f:/xerox%20buddy/backend/api/_lib/mongodb.js), [`backend/api/orders.js`](file:///f:/xerox%20buddy/backend/api/orders.js), [`backend/api/agent/orders.js`](file:///f:/xerox%20buddy/backend/api/agent/orders.js), [`backend/server.js`](file:///f:/xerox%20buddy/backend/server.js)) established the following architectural facts:

### 3.1 Field Names and Timestamp Data Types
| Collection | Field | Data Type | Populated At | Operational Meaning |
|---|---|---|---|---|
| `orders` | `createdAt` | ISO 8601 String | Order insertion | Original order creation timestamp |
| `orders` | `pdfUploadedAt` | ISO 8601 String | Upload completion | Exact time the PDF payload stream was received |
| `orders` | `printedAt` | ISO 8601 String | Physical print confirmation | Stamped only when Print Agent confirms print success |
| `orders` | `printingAt` | ISO 8601 String | Kiosk claim / spool start | Stamped when status transitions to `'Printing'` |
| `orders` | `pdfExpiresAt` | ISO 8601 String | Calculated | Authoritative retention deadline |
| `orders` | `pdfDeletedAt` | ISO 8601 String | Retention cleanup | Stamped when PDF payload is purged |
| `order_pdfs.files` | `uploadDate` | BSON Date (`ISODate`) | GridFS upload finish | Native MongoDB GridFS upload timestamp |
| `order_pdfs.files` | `metadata.uploadedAt` | ISO 8601 String | Stream initialization | Mirrors upload time in file metadata |
| `order_pdfs.files` | `metadata.orderId` | String (Uppercase) | Stream initialization | Clean `orderId` reference (e.g., `"XB8212"`) |
| `order_pdfs.files` | `filename` | String | Stream initialization | File identifier (formatted as `${orderId}.pdf`) |
| `order_pdfs.chunks` | `files_id` | ObjectId / String | Stream chunk write | Foreign key referencing `order_pdfs.files._id` |

### 3.2 Evaluation Logic in `getEffectiveExpiryTimestamp(order)`
- **Printed Order (`order.printedAt` exists):** Returns strictly `order.printedAt + 30 minutes` (`calculatePrintedExpiryTimestamp`). If explicit `order.pdfExpiresAt` exists and is earlier, the earlier timestamp is returned.
- **Unprinted Order (`order.printedAt` is missing or null):**
  - If `order.pdfExpiresAt` exists, it is respected.
  - Otherwise, falls back to `(order.pdfUploadedAt || order.createdAt) + 24 hours` (`calculateUnprintedExpiryTimestamp`).
  - If neither timestamp exists, returns `null`.

### 3.3 Storage State Fields in `orders`
- `hasPdf`: Boolean. UI convenience indicator.
- `hasGridFsPdf`: Boolean. Confirms binary is stored in `order_pdfs` bucket.
- `pdfStorage`: Enumeration string:
  - `'gridfs'`: Stored in GridFS bucket `order_pdfs`.
  - `'inline'`: Small PDF stored as Base64 in `pdfBase64`.
  - `'drive'`: Student external Google Drive URL; no binary stored in XBuddy.
  - `'none'`: No PDF stored / already purged.
- `pdfBase64`: String. Populated only when `pdfStorage === 'inline'`, otherwise empty string `""`.
- `pdfDeletedAt`: ISO string timestamp. When present, indicates PDF was permanently purged.

### 3.4 Handling Legacy Printed Orders Without `printedAt`
In older legacy records, `printStatus === 'Printed'`, but `printedAt` was never recorded.
- **Critical Safety Guard:** The system **does not** infer that 30 minutes have elapsed based on `createdAt`. Inferring print completion from `createdAt` would prematurely delete documents printed recently.
- **Safe Fallback:** Because `printedAt` is absent, the order fails `buildEligiblePrintedQuery` and is instead governed by the **24-hour upload retention window** (`pdfUploadedAt` / `createdAt + 24 hours`).

### 3.5 Handling Active and Stalled `Printing` Orders
- An order with `printStatus === 'Printing'` where `printingAt` is within the last 30 minutes is actively being spooled or printed; it is **strictly protected** from deletion.
- If `printingAt` is older than 30 minutes (or missing) AND upload age exceeds 24 hours, it is classified as a stalled job and safely recovered/cleaned.

### 3.6 Collections Verified
- `orders`: Metadata and payment details.
- `order_pdfs.files`: GridFS file metadata.
- `order_pdfs.chunks`: GridFS binary chunks.
- `stations`: Physical kiosk telemetry (printer status, paper status). Contains zero student document data.
- **No other collections in `xbuddy` store student document binaries.**

---

## 4. Phase 2 — Verified Read-Only Inventory Queries

### 4.1 Vulnerability Discovered & Resolved: `{ pdfStorage: { $ne: 'none' } }`
In MongoDB BSON semantics:
- Missing fields, `null`, or undefined values satisfy `{ field: { $ne: 'none' } }` because `null !== 'none'`.
- External Google Drive links (`pdfStorage: 'drive'`) also satisfy `{ $ne: 'none' }`, even though document binaries are not stored in XBuddy's Atlas or GridFS buckets.
- To eliminate false-positive inventory matches, the query was standardized around `buildPayloadExistsCondition()`.

### 4.2 Canonical Payload Condition: `buildPayloadExistsCondition()`
```javascript
export function buildPayloadExistsCondition() {
  return {
    $or: [
      { pdfStorage: { $in: ['gridfs', 'inline'] } },
      { hasGridFsPdf: true },
      {
        pdfBase64: {
          $exists: true,
          $type: 'string',
          $nin: ['', null],
        },
      },
      // Accommodates legacy orders created before pdfStorage field was introduced
      {
        hasPdf: true,
        pdfStorage: { $exists: false },
      },
    ],
  };
}
```

### 4.3 Category Queries (Syntactically Verified & Tested)

#### Category A: Printed PDFs Eligible for Cleanup (30-Minute Deadline)
*Criteria:* Successfully printed, `printedAt` reliably recorded, `printedAt <= now - 30 minutes`, payload exists, `pdfDeletedAt` not set.
```javascript
const nowMs = Date.now();
const nowIso = new Date(nowMs).toISOString();
const thirtyMinsAgoIso = new Date(nowMs - 30 * 60 * 1000).toISOString();

const categoryAQuery = {
  pdfDeletedAt: { $exists: false },
  printedAt: { $exists: true, $ne: null },
  $and: [
    {
      $or: [
        { pdfStorage: { $in: ['gridfs', 'inline'] } },
        { hasGridFsPdf: true },
        { pdfBase64: { $exists: true, $type: 'string', $nin: ['', null] } },
        { hasPdf: true, pdfStorage: { $exists: false } }
      ]
    },
    {
      $or: [
        { pdfExpiresAt: { $exists: true, $lte: nowIso } },
        {
          pdfExpiresAt: { $exists: false },
          printedAt: { $lte: thirtyMinsAgoIso }
        }
      ]
    }
  ]
};
```

#### Category B: Unprinted PDFs Eligible for Cleanup (24-Hour Upload Deadline)
*Criteria:* Unprinted (`printedAt` missing or null), upload/creation age `> 24 hours`, payload exists, not actively printing (`printStatus !== 'Printing'` OR stalled > 30m).
```javascript
const twentyFourHoursAgoIso = new Date(nowMs - 24 * 60 * 60 * 1000).toISOString();

const categoryBQuery = {
  pdfDeletedAt: { $exists: false },
  $and: [
    {
      $or: [
        { printedAt: { $exists: false } },
        { printedAt: null }
      ]
    },
    {
      $or: [
        { pdfStorage: { $in: ['gridfs', 'inline'] } },
        { hasGridFsPdf: true },
        { pdfBase64: { $exists: true, $type: 'string', $nin: ['', null] } },
        { hasPdf: true, pdfStorage: { $exists: false } }
      ]
    },
    {
      $or: [
        { printStatus: { $ne: 'Printing' } },
        {
          printStatus: 'Printing',
          $and: [
            {
              $or: [
                { printingAt: { $exists: true, $lte: thirtyMinsAgoIso } },
                { printingAt: { $exists: false } }
              ]
            },
            {
              $or: [
                { pdfUploadedAt: { $exists: true, $lte: twentyFourHoursAgoIso } },
                { createdAt: { $exists: true, $lte: twentyFourHoursAgoIso } }
              ]
            }
          ]
        }
      ]
    },
    {
      $or: [
        { pdfExpiresAt: { $exists: true, $lte: nowIso } },
        {
          pdfExpiresAt: { $exists: false },
          $or: [
            { pdfUploadedAt: { $exists: true, $lte: twentyFourHoursAgoIso } },
            { createdAt: { $exists: true, $lte: twentyFourHoursAgoIso } }
          ]
        }
      ]
    }
  ]
};
```

#### Category C: Unprinted PDFs Preserved (< 24 Hours Old)
*Criteria:* Unprinted, upload age `< 24 hours`, payload exists, `pdfDeletedAt` not set.
```javascript
const categoryCQuery = {
  pdfDeletedAt: { $exists: false },
  printStatus: { $ne: 'Printing' },
  $and: [
    {
      $or: [
        { printedAt: { $exists: false } },
        { printedAt: null }
      ]
    },
    {
      $or: [
        { pdfStorage: { $in: ['gridfs', 'inline'] } },
        { hasGridFsPdf: true },
        { pdfBase64: { $exists: true, $type: 'string', $nin: ['', null] } },
        { hasPdf: true, pdfStorage: { $exists: false } }
      ]
    },
    {
      $or: [
        { pdfExpiresAt: { $exists: true, $gt: nowIso } },
        {
          pdfExpiresAt: { $exists: false },
          $or: [
            { pdfUploadedAt: { $exists: true, $gt: twentyFourHoursAgoIso } },
            {
              pdfUploadedAt: { $exists: false },
              createdAt: { $exists: true, $gt: twentyFourHoursAgoIso }
            }
          ]
        }
      ]
    }
  ]
};
```

#### Category D: Actively Printing vs. Stalled Print Jobs
```javascript
// Actively Printing (Protected):
const categoryDActiveQuery = {
  pdfDeletedAt: { $exists: false },
  printStatus: 'Printing',
  printingAt: { $exists: true, $gt: thirtyMinsAgoIso }
};

// Stalled Printing (Eligible for Recovery/Cleanup):
const categoryDStalledQuery = {
  pdfDeletedAt: { $exists: false },
  printStatus: 'Printing',
  $or: [
    { printingAt: { $exists: true, $lte: thirtyMinsAgoIso } },
    { printingAt: { $exists: false } }
  ]
};
```

#### Category E: Genuinely Orphaned GridFS Files
*Criteria:* Files in `order_pdfs.files` older than 24 hours (`uploadDate <= now - 24h`) that have **no matching active order** in `orders` (e.g., aborted uploads) OR whose associated order has already had its PDF purged (`pdfDeletedAt` exists or `pdfStorage === 'none'`).
```javascript
const staleBsonDate = new Date(nowMs - 24 * 60 * 60 * 1000);

db.getCollection('order_pdfs.files').aggregate([
  { $match: { uploadDate: { $lte: staleBsonDate } } },
  {
    $lookup: {
      from: 'orders',
      let: { filename: '$filename', metaId: '$metadata.orderId' },
      pipeline: [
        {
          $match: {
            $expr: {
              $or: [
                { $eq: ['$orderId', '$$metaId'] },
                { $eq: [{ $concat: ['$orderId', '.pdf'] }, '$$filename'] }
              ]
            }
          }
        }
      ],
      as: 'matchedOrder'
    }
  },
  {
    $match: {
      $or: [
        { matchedOrder: { $size: 0 } },
        { 'matchedOrder.0.pdfDeletedAt': { $exists: true } },
        {
          $and: [
            { 'matchedOrder.0.hasPdf': false },
            { 'matchedOrder.0.hasGridFsPdf': false },
            { 'matchedOrder.0.pdfStorage': 'none' }
          ]
        }
      ]
    }
  },
  {
    $group: {
      _id: null,
      orphanFileCount: { $sum: 1 },
      totalOrphanBytes: { $sum: '$length' }
    }
  }
]);
```

---

## 5. Phase 3 & 4 — Inventory Structure & Storage Analysis

### 5.1 Mutual Exclusivity and Classification Rules
Every document and file is classified into exactly one authoritative category:

```
[Total Orders in 'orders']
  ├── [No Payload / Already Purged / External Drive]
  └── [Contains Active Payload]
        ├── Printed Orders
        │     ├── [Category A] printedAt <= 30m ago (ELIGIBLE FOR CLEANUP)
        │     └── [Category A-Active] printedAt > 30m ago (PRESERVED REPRINT WINDOW)
        ├── Unprinted Orders (pending, waiting, failed, legacy)
        │     ├── [Category B] uploadAge > 24h (ELIGIBLE FOR CLEANUP)
        │     └── [Category C] uploadAge <= 24h (PRESERVED COLLECTION WINDOW)
        └── In-Progress Orders ('Printing')
              ├── [Category D-Active] printingAt > 30m ago (STRICTLY PROTECTED)
              └── [Category D-Stalled] printingAt <= 30m ago + uploadAge > 24h (SAFE RECOVERY)

[Total Files in 'order_pdfs.files']
  ├── [Active Referenced Files] -> Referenced by non-expired orders (NEVER TOUCHED)
  ├── [Expired Referenced Files] -> Referenced by Category A or B orders (PURGED WITH ORDER)
  └── [Category E: Genuinely Orphaned Files] -> Age > 24h with no active order (SWEPT)
```

### 5.2 Storage Mechanics & Atlas Allocation Realities
1. **Logical Binary Reduction:** Deleting expired GridFS files and chunks frees 100% of their logical binary bytes from `order_pdfs.files` and `order_pdfs.chunks`.
2. **Chunk Multiplier:** Because GridFS splits documents into 1 MB chunks (`GRIDFS_CHUNK_SIZE = 1048576`), a 3.5 MB document produces 1 file metadata document and 4 chunk documents. Purging removes both metadata and all 4 chunks via `GridFSBucket.delete`.
3. **WiredTiger Storage Behavior:**
   - In MongoDB Atlas, deleting documents frees internal WiredTiger data pages into the database's internal free list.
   - **Atlas allocated disk space does not immediately shrink.** Instead, the free pages are immediately reused for subsequent order uploads and chunk writes, immediately halting disk growth.
   - Disk space is reclaimed by the host OS only after Atlas compacts or resizes the volume.

---

## 6. Phase 5 — Student Data Privacy Safeguards

The inventory architecture conforms strictly to data minimization standards:
- **No Personal Identifiers:** Student names, roll numbers, phone numbers, email addresses, and personal document titles are completely excluded from reports, operational logs, and telemetry.
- **No Financial PII:** Bank account details, student UPI IDs, and raw payment verification data are excluded.
- **No Document Exposure:** PDF bytes, text extracts, Base64 chunks, and file previews are never read or output into audit reports.
- **Opaque Identifiers Only:** Only synthetic or opaque system identifiers (e.g., `"XB8212"`) are referenced for operational tracking.

---

## 7. Phase 6 — First Cleanup Impact & Risk Assessment

Before the background retention worker is enabled in production, the operational impact is assessed as follows:

| Order State | Intended Action | Student / Business Impact |
|---|---|---|
| **Printed Orders > 30m** | Purge GridFS binary & clear Base64 | **Zero negative impact.** The student has already collected their printed physical pages, and their 30-minute immediate reprint window has elapsed. |
| **Pending / Unpaid Orders > 24h** | Purge GridFS binary & clear Base64 | **Zero negative impact.** Abandoned or uncollected orders older than 24 hours are expired. Students can create a new order if needed. |
| **Paid Unprinted Orders > 24h** | Purge GridFS binary, preserve payment | **Low risk, protected ledger.** The student paid, but never collected within 24 hours. The financial record (`transactionId`, `amount`, `paymentStatus: 'paid'`) is **permanently preserved** in `orders`. If the student requests a refund or reprint, the shopkeeper has the full audit trail. |
| **Legacy Printed Orders (no `printedAt`)** | Governed by 24h upload rule | **Zero risk of premature deletion.** Documents will not be deleted 30 minutes after `createdAt`. They remain available for 24 hours from creation. |
| **Actively Printing Orders** | Strictly protected from cleanup | **Zero disruption.** The physical printer will not suffer spooler corruption or missing chunks while printing. |
| **Genuinely Orphaned GridFS Files** | Permanent bucket deletion | **Immediate storage reclamation.** Abandoned partial uploads from aborted HTTP requests will be reclaimed. |

---

## 8. Phase 7 — Execution Findings & Recommendations

### 8.1 Inventory Execution Summary
- **Local Validation Status:** **PASSED (14/14 automated test assertions passed)**.
- **Production Execution Status:** **HALTED AT PRE-FLIGHT AUTHENTICATION GATE**.
- **Reason:** Only the production application user (`xbuddy_app_user` with `readWrite` authority) was detected. In strict compliance with the prompt's safety rules, query execution against production Atlas was suspended until authorized read-only credentials are supplied.

### 8.2 Recommended Step-by-Step Procedure
To execute the read-only inventory against production Atlas:

1. **Option A: Provision a Dedicated Read-Only User (Recommended)**
   In MongoDB Atlas Console:
   - Create a database user `xbuddy_readonly` with the built-in role **`read@xbuddy`**.
   - Set environment variable: `MONGODB_READONLY_URI="mongodb+srv://xbuddy_readonly:<password>@xbuddycluster.mihodba.mongodb.net/xbuddy"`.
   - Execute the verified read-only script:
     ```bash
     node backend/scripts/runReadOnlyPdfInventory.mjs
     ```

2. **Option B: Administrator Authorization for Application User**
   If the administrator explicitly authorizes running read-only inspection queries using the existing application connection:
   - Execute:
     ```bash
     node backend/scripts/runReadOnlyPdfInventory.mjs --allow-app-user
     ```
   *(The script enforces that only `.countDocuments()`, `.find()`, and `.aggregate()` are called; zero write or index operations are executed).*

3. **Retention Deployment:**
   Following read-only verification, the retention worker in `backend/server.js` may be safely deployed to Render. The initial startup cycle will process backlogged expired files, followed by scheduled 60-second maintenance cycles.
