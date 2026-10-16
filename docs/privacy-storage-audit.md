# XBuddy — Privacy & Database Storage Growth Audit
**Authoritative Architectural & Storage Lifecycle Audit**  
*Document Version:* 1.0.0  
*Target Platforms:* MongoDB Atlas (`xbuddy`), GridFS (`order_pdfs`), Express Backend (Render), Print Station Agent (Windows)  
*Status:* Complete Audit (Phase 1)

---

## 1. Executive Summary

An exhaustive audit of the XBuddy codebase was conducted to identify the root cause of MongoDB storage accumulation, audit student data retention practices, and verify the 30-minute PDF lifecycle.

The investigation revealed that **unprinted and abandoned orders were never subject to the 30-minute cleanup job**. Previous retention logic coupled `pdfExpiresAt` strictly to the transition `printStatus === 'Printed'`. Consequently, any order that was uploaded but abandoned, unverified, unprinted, or canceled had its PDF binary retained in MongoDB Atlas GridFS (`order_pdfs.chunks`) **indefinitely**.

This document outlines the complete data lifecycle, pinpoints the exact source files and functions responsible, catalogs student data exposure, and specifies the safeguards needed to enforce automatic 30-minute deletion from upload time without breaking printing or payment workflows.

---

## 2. Complete PDF Data Lifecycle Trace

### 2.1 PDF Upload & Validation
- **Entry Points:**
  - `POST /api/orders` (JSON body with `pdfBase64`, handled in `backend/api/orders.js:257`).
  - `POST /api/orders` (`multipart/form-data` with binary PDF, parsed via `busboy` in `parseMultipartOrder`, `backend/api/orders.js:154-190`).
- **Validation:**
  - `validateOrderPayload` (`backend/api/orders.js:192-221`) verifies magic header `%PDF-`.
  - Non-PDF files or payloads lacking both a PDF and a valid Google Drive URL are rejected immediately with HTTP 400.

### 2.2 GridFS File Metadata & Chunk Creation
- **Module:** `backend/api/_lib/gridfs.js` -> `savePdfToGridFS(db, orderId, pdfSource, metadata)`
- **Bucket Configuration:**
  - Bucket Name: `order_pdfs` (`GRIDFS_BUCKET_NAME = 'order_pdfs'`)
  - Chunk Size: `GRIDFS_CHUNK_SIZE = 1048576` (1 MB chunks, designed to minimize roundtrips to MongoDB Atlas)
  - Target Collections:
    - `order_pdfs.files` (File metadata document)
    - `order_pdfs.chunks` (Binary chunk documents)
- **Metadata Stored in `order_pdfs.files`:**
  ```javascript
  {
    _id: ObjectId(...),
    length: Number,
    chunkSize: 1048576,
    uploadDate: ISODate(...),
    filename: `${orderId}.pdf`,
    contentType: 'application/pdf',
    metadata: {
      orderId: cleanId,
      fileName: metadata.fileName || filename,
      size: Number,
      uploadedAt: new Date().toISOString()
    }
  }
  ```

### 2.3 Storage of Document References in Order Records
- **Module:** `backend/api/orders.js:521-609`
- **Collection:** `orders`
- **Fields Written:**
  - `hasGridFsPdf`: `true`
  - `hasPdf`: `true`
  - `pdfStorage`: `'gridfs'` (or `'inline'` for small files < 250 KB)
  - `pdfSize`: size in bytes
  - `pdfBase64`: empty string for large files; inline Base64 string for files < 250 KB
- **Defect Identified:** At insertion time, `orderDoc` does **not** record `pdfExpiresAt` or `pdfUploadedAt`. Expiration calculation was deferred to `printStatus === 'Printed'`.
- **Ephemeral Cache:** A copy of the PDF buffer is written to `.pdf_cache/${orderId}.pdf` for local read acceleration.

### 2.4 Payment Verification
- **Module:** `backend/api/orders.js:1293-1330` -> action `updatePaymentStatus`
- **Mechanism:** Manual verification by the booth operator. Updates `paymentStatus` to `'paid'`, `'pending'`, or `'failed'`.
- **Decoupling:** Payment verification does not manage PDF storage or alter the document retention timer.

### 2.5 Order Retrieval & Pending Queue
- **Client Route:** `GET /api/orders?action=getWaitingOrders` (queries `printStatus: { $in: ['waiting_for_shopkeeper', 'Waiting', 'queued', 'pending'] }`).
- **Agent Route:** `GET /api/agent/orders/pending` (`backend/api/agent/orders.js:194-214`).
- **Data Returned:** Normalizes order details, provides `pdfUrl: 'https://xbuddy.onrender.com/api/orders?action=getOrderPdf&orderId=...'`, and excludes inline `pdfBase64` from list queries to minimize bandwidth.

### 2.6 PDF Download by Print Agent
- **Module:** `backend/api/orders.js:856-940` -> action `getOrderPdf`
- **Retrieval Pipeline:**
  1. Checks `orders` collection for existence and expiration.
  2. If present in local runtime disk cache (`.pdf_cache/${orderId}.pdf`), serves binary directly (< 10 ms).
  3. If cache misses, opens download stream from GridFS (`getPdfStreamFromGridFS`) and streams to response while backfilling the local disk cache.

### 2.7 Order Claiming & Release
- **Module:** `backend/api/agent/orders.js:216-371` -> `POST /api/agent/orders/:orderId/claim`
- **Atomic Transition:** Atomically updates `printStatus` from pending to `'Printing'`, recording `claimedAt` and `claimedBy`.
- **Release Execution:** Windows Print Station (`backend/print-agent/services/localServer.js:868-1040`) receives booth command `/release-print`, retrieves order, executes claim, downloads PDF from cloud, and sends to physical printer via SumatraPDF/MuPDF.

### 2.8 Printing & Order-Status Updates
- **Module:** `backend/api/agent/orders.js:373-455` -> `POST /api/agent/orders/:orderId/status`
- **Status Change:** Updates `printStatus` to `'Printed'`.
- **Historical Logic:** Only when `newStatus === 'Printed'` did the backend record `printedAt: nowIso` and calculate `pdfExpiresAt = nowIso + 30m`.

### 2.9 Cleanup Job Initialization & Scheduling
- **Module:** `backend/server.js:148-175`
- **Schedule:**
  - Initial startup purge: 2 seconds after Express server boots.
  - Background worker: `setInterval(..., 60 * 1000)` running `cleanupExpiredPdfs(db)` every 60 seconds with an overlap lock (`isCleanupRunning`).
- **Execution Function:** `backend/api/_lib/retention.js:155-283` -> `cleanupExpiredPdfs(db)`.

---

## 3. Root Cause Analysis of Database Storage Growth

| Root Cause | Severity | Mechanism | Impact |
| :--- | :--- | :--- | :--- |
| **1. Unprinted / Abandoned Orders Excluded from Cleanup** | **CRITICAL** | `cleanupExpiredPdfs` searched only for orders where `pdfExpiresAt <= now` OR (`pdfExpiresAt` missing AND `printedAt <= 30m ago`). Because `pdfExpiresAt` was set only upon printing, any order never printed had neither field. | Every abandoned, unpaid, or failed order remained in GridFS forever, leaking chunks indefinitely. |
| **2. Expiration Derived from `printedAt` Instead of Upload Time** | **HIGH** | `calculateExpiryTimestamp(printedAtIso)` derived the 30-minute deadline from print completion. If an order sat in the queue for 3 hours before being printed, it was retained for 3.5 hours. | Violated strict 30-minute privacy retention and bloated the active storage window. |
| **3. Orphaned GridFS Chunks Unmonitored** | **HIGH** | `cleanupExpiredPdfs` only queried `db.collection('orders')`. Any GridFS files/chunks in `order_pdfs.files` without an active order record were never discovered or swept. | Incomplete transactions or manual order purges left binary chunks permanently orphaned in MongoDB Atlas. |
| **4. Render Free-Tier Sleeping Lifecycle** | **MEDIUM** | Render instances spin down after 15 minutes of HTTP inactivity, suspending `setInterval`. Upon restart, because unprinted orders lacked expiry, startup cleanup also skipped them. | Accumulation went unpurged during idle nighttime hours. |
| **5. Inline Base64 Bloat for Small PDFs** | **MEDIUM** | PDFs under 250 KB stored inline Base64 strings in `xbuddy.orders`. Unless cleared, these multiplied storage across indexes and BSON document storage. | Document size overhead in the main collection. |
| **6. WiredTiger Storage Reuse vs Shrink** | **LOW / OPERATIONAL** | MongoDB's storage engine (WiredTiger) marks freed blocks as reusable within internal `.wt` files rather than immediately shrinking operating system file size. | Apparent "Storage Size" in Atlas metrics does not shrink immediately upon document deletion, leading to false impressions that cleanup failed. |

---

## 4. Actual Data Storage Locations & Collections

| Storage Layer | Collection / Location | Data Stored | Typical Size |
| :--- | :--- | :--- | :--- |
| **GridFS Metadata** | `xbuddy.order_pdfs.files` | File metadata, upload dates, filenames, order IDs. | ~500 bytes per order |
| **GridFS Binary Chunks** | `xbuddy.order_pdfs.chunks` | Binary PDF chunks (1 MB chunk size). | **95%+ of total database storage** (1–30 MB per order) |
| **Orders Primary** | `xbuddy.orders` | Student name, order config, payment status, print status, audit history, inline Base64 (< 250 KB). | 1–3 KB (or up to 350 KB with inline Base64) |
| **Agent Telemetry** | `xbuddy.stations` | Machine heartbeat, printer online status, agent version, timestamps. | < 1 KB per station |
| **Runtime Disk Cache** | Backend `.pdf_cache/` | Local copy of recently uploaded or streamed PDFs. | Ephemeral disk files |

---

## 5. Current Cleanup Behavior & Missing Safeguards

### Current Cleanup Code in `backend/api/_lib/retention.js`:
```javascript
// Existing flawed query:
const query = {
  $or: [
    { pdfExpiresAt: { $exists: true, $lte: nowIso } },
    {
      pdfExpiresAt: { $exists: false },
      printedAt: { $exists: true, $ne: null, $lte: thirtyMinsAgoIso },
    },
  ],
  pdfDeletedAt: { $exists: false },
  $and: [
    {
      $or: [
        { hasPdf: true },
        { hasGridFsPdf: true },
        { pdfStorage: { $ne: 'none' } },
        { pdfBase64: { $exists: true, $ne: '' } },
      ],
    },
  ],
}
```

### Missing Safeguards:
1. **No Upload-Time Expiration Anchor:** Expiration is not set when the order is created.
2. **Workflow Enforcement Gap in `getOrderPdf`:** Lines 883–884 evaluate `effectiveExpiry = order.pdfExpiresAt || (order.printedAt ? calculateExpiryTimestamp(order.printedAt) : null)`. If an order is 3 days old and unprinted, `effectiveExpiry` is `null`, and the PDF is freely served.
3. **Workflow Enforcement Gap in Agent Claim:** Lines 243–251 of `backend/api/agent/orders.js` only check `existing.pdfExpiresAt`. Stale unprinted orders can still be claimed.
4. **No GridFS Bucket Orphan Sweep:** Cleanup does not query `order_pdfs.files` for documents older than 30 minutes that may have become disconnected from the `orders` collection.

---

## 6. Recommended Changes & Safeguards

1. **Set `pdfExpiresAt` at Order Creation:**
   In `backend/api/orders.js`, when saving an order:
   ```javascript
   orderDoc.pdfUploadedAt = nowIso
   orderDoc.pdfExpiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString()
   ```
2. **Anchor Expiration to Upload Time in `retention.js`:**
   Change `calculateExpiryTimestamp(baseTimeIso)` so it defaults to the upload time (`createdAt` / `uploadedAt`), guaranteeing that all PDFs expire strictly 30 minutes from upload regardless of status.
3. **Broaden Cleanup Query:**
   Update `cleanupExpiredPdfs` to find all orders where:
   - `pdfExpiresAt <= nowIso`, OR
   - `pdfExpiresAt` does not exist AND `createdAt <= thirtyMinsAgoIso`
4. **Add GridFS Orphan Sweep:**
   In `cleanupExpiredPdfs`, query `order_pdfs.files` for any file whose `uploadDate <= thirtyMinsAgoIso` and ensure it is removed via `bucket.delete(file._id)`.
5. **Enforce Expiration in Retrieval & Claim Workflows:**
   In `getOrderPdf` and `/api/agent/orders/:orderId/claim`, evaluate:
   ```javascript
   const effectiveExpiry = order.pdfExpiresAt || (order.createdAt ? calculateExpiryTimestamp(order.createdAt) : null)
   if (order.pdfDeletedAt || (effectiveExpiry && new Date(effectiveExpiry).getTime() <= Date.now())) {
     return res.status(410).json({ success: false, error: 'Document retention expired; PDF deleted.', expired: true })
   }
   ```
6. **Preserve Accounting & Payment Workflows:**
   - Orders whose PDF has expired remain in `orders` for accounting, audit logs, and customer support.
   - If a student pays after 30 minutes, payment verification is recorded, but print release is blocked with a clear `missingPdf: true` / `expired: true` notice, prompting re-upload rather than silently printing stale or missing data.

---

## 7. Impact on Pending Orders & Printing Workflow

| Scenario | Behavior Before Fix | Behavior After Fix |
| :--- | :--- | :--- |
| **Normal Print within 30 min** | Uploaded, paid, claimed, printed normally. | Uploaded, paid, claimed, printed normally. No change. |
| **Order Pending for 35 min (Unprinted)** | PDF remained in GridFS indefinitely; could be printed days later. | PDF deleted at minute 30. Attempted release returns HTTP 410 / "PDF expired". |
| **Late Payment (Paid at min 35)** | PDF remained available. | Payment status recorded as paid; release blocked due to expired PDF; operator guided to request re-upload. |
| **Reprint Request within 30 min** | Allowed if printed within window. | Allowed if within 30 minutes of upload. |
| **Reprint Request after 30 min** | Blocked with HTTP 410. | Blocked with HTTP 410. |
| **Backend Restart / Wake from Sleep** | Stale unprinted PDFs persisted. | Startup sweep immediately purges all PDFs older than 30 minutes. |

---

## 8. Implementation Details & Verification Results

### 8.1 Files Modified & Exact Enhancements
1. **`backend/api/orders.js`:**
   - Lines 347–352: Set `pdfUploadedAt: nowIso` and `pdfExpiresAt: calculateExpiryTimestamp(nowIso)` at order creation time (`saveOrder`).
   - Lines 874, 883–894: Updated `getOrderPdf` to evaluate effective expiration against upload time (`order.pdfExpiresAt || order.pdfUploadedAt || order.createdAt`). Reject with HTTP 410 if expired and unlink disk cache immediately.
   - Lines 1230–1238: Preserved original upload-time expiration deadline upon transition to `Printed`, preventing the retention window from resetting or extending.
2. **`backend/api/agent/orders.js`:**
   - Lines 242–252: Added effective expiration derivation from upload time in the `/claim` route. Stale unprinted orders are rejected with HTTP 410.
   - Lines 409–413: Preserved upload-time expiration deadline upon status updates to `Printed`.
3. **`backend/api/_lib/gridfs.js`:**
   - Lines 68–74: Recorded `uploadedAt` and `expiresAt` in GridFS metadata upon upload.
   - Lines 191–197: Handled `FileNotFound` errors gracefully in `deletePdfFromGridFS` for complete deletion idempotency.
4. **`backend/api/_lib/retention.js`:**
   - Lines 13–16: Parameterized `calculateExpiryTimestamp(baseTimeIso)` for upload-anchored deadline calculation.
   - Lines 70–76: Evaluated reprint eligibility using upload-anchored expiration.
   - Lines 165–186: Broadened cleanup query in `cleanupExpiredPdfs` to identify all orders where `pdfExpiresAt <= nowIso` OR (`createdAt <= 30m ago` / `pdfUploadedAt <= 30m ago`).
   - Lines 234–235: Derived genuine expiry from `pdfUploadedAt` / `createdAt`.
   - Lines 255–290: Added orphaned GridFS file/chunk sweep querying `order_pdfs.files` for documents older than 30 minutes and removing them via `bucket.delete(file._id)`.
5. **`backend/server.js`:**
   - Lines 186–214: Updated startup pre-warming query to exclude orders older than 30 minutes from upload time, preventing stale files from being populated into runtime disk cache.
6. **`backend/package.json`:**
   - Added `test/privacy_pdf_retention.test.js` to automated test script.
7. **`backend/test/privacy_pdf_retention.test.js`:**
   - Created comprehensive mock-based unit test suite verifying all 13 core requirements in total isolation without hitting production.
8. **`backend/test/retention_reprint.test.js`:**
   - Aligned Test 1 and Test 4 to verify upload-time expiration and verify that unprinted orders older than 30 minutes have their PDFs purged while preserving order documents.

### 8.2 Test Verification Results
- **Unit Test Suite:** `node test/privacy_pdf_retention.test.js`
  - Total Tests: 13
  - Passing: 13
  - Failures: 0
- **Regression Test Suites:**
  - `test/order_creation_guard.test.js`: 9/9 passing
  - `test/agent_orders.test.js`: 7/7 passing
  - `test/phase4_cutover.test.js`: 8/8 passing
  - `test/parity_audit.test.js`: 13/13 passing
  - `test/backfill_orders.test.js`: 6/6 passing
  - `test/cloud_telemetry.test.js`: 7/7 passing
  - `test/missing_pdf_persistence.test.js`: 11/11 passing
  - `test/retention_reprint.test.js`: 13/13 passing
- **All tests executed successfully with 0 errors.**

