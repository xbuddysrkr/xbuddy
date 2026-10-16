# XBuddy — Final PDF Retention & Privacy Policy
**Student Data Classification, Dual-Rule Minimization & Storage Retention Specification**  
*Document Version:* 2.0.0 (FINAL)  
*Effective Date:* October 2026  
*Target Environments:* Student Web App (`xbuddysrkr.vercel.app`), Cloud Backend (`xbuddy.onrender.com`), MongoDB Atlas (`xbuddy`), Print Agent Kiosks  

---

## 1. Purpose & Principles

XBuddy provides digital print ordering for students at SRKR Engineering College. In accordance with privacy-by-design principles, the platform enforces strict data minimization:
1. **Document Contents Are Ephemeral:** Uploaded academic documents, personal resumes, assignment sheets, and hall tickets exist only as long as necessary to complete physical printing and immediate verification.
2. **Dual-Rule Expiration Architecture:**
   - **Printed Orders (30 Minutes Post-Print):** When a PDF is successfully printed, all XBuddy-managed copies are deleted **30 minutes after confirmed print completion (`printedAt`)**.
   - **Unprinted Orders (24 Hours Post-Upload):** If a PDF has not been successfully printed (including pending, claimed, or failed print attempts), all XBuddy-managed copies are deleted **24 hours after upload (`pdfUploadedAt` / `createdAt`)**.
3. **Timer Preservation:** A claimed order, downloaded PDF, payment verification, failed print, or status refresh **must never reset or extend** the retention timer.
4. **Reliable Timestamps:** Upload timestamp is recorded at order creation. Print completion timestamp (`printedAt`) is recorded only after the Print Agent confirms successful physical printing.
5. **In-Progress Print Protection:** Orders actively in `printStatus: 'Printing'` are safely protected from deletion at the retention boundary.
6. **Automatic Purge:** The system automatically cleans up expired GridFS binary chunks and file metadata on startup and periodically thereafter. Zero manual database clearing is required.
7. **Accounting Integrity Without Data Bloat:** Order records, payment verification audit trails, and financial receipts are preserved without retaining the underlying student document contents.

---

## 2. Comprehensive Data Classification & Retention Matrix

| Data Category | Specific Fields | Storage Location | Identifies Student? | Operational Purpose | Active Retention Window | Post-Retention Action |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Uploaded Document Contents (Printed)** | Binary stream, PDF chunks, inline Base64 (`pdfBase64`), temporary files | `order_pdfs.chunks`, `order_pdfs.files`, backend `.pdf_cache/*.pdf` | **YES** (Transcripts, resumes, ID cards, exam papers) | Rendering and spooling physical print jobs at the kiosk printer | **30 minutes after confirmed `printedAt`** | **Permanently Deleted:** GridFS bucket delete (`bucket.delete`), local cache unlinked, `hasPdf` set to `false`, `pdfDeletedAt` stamped. |
| **Uploaded Document Contents (Unprinted / Failed)** | Binary stream, PDF chunks, inline Base64 (`pdfBase64`), temporary files | `order_pdfs.chunks`, `order_pdfs.files`, backend `.pdf_cache/*.pdf` | **YES** (Transcripts, resumes, ID cards, exam papers) | Available for student collection and print attempts at the booth | **24 hours from upload (`pdfUploadedAt`)** | **Permanently Deleted:** GridFS bucket delete (`bucket.delete`), local cache unlinked, `hasPdf` set to `false`, `pdfDeletedAt` stamped. |
| **Document Filename & Metadata** | `fileName`, `pdfSize`, `totalPages`, `selectedPages` | `orders.fileName`, `order_pdfs.files.metadata` | **YES** (May include roll numbers, names, e.g. `21B91A05XX_Resume.pdf`) | Operator confirmation on kiosk screen and student verification | Active during order fulfillment; retained in order record | Retained in `orders` for customer support and dispute resolution; excluded from operational logs. |
| **Student Identifiers** | `name`, `phone` (optional reprint contact) | `orders.name`, `orders.reprintAttempts.$.phone` | **YES** (Direct PII) | Calling student name at the collection counter when prints are dispatched | Preserved with order transaction | Preserved in order ledger for customer support; minimized where appropriate; never printed in server logs or telemetry. |
| **Order Specifications** | `orderId`, `amount`, `copies`, `colorMode`, `printSide`, `pageSize`, `printStatus`, `createdAt` | `orders` collection | **NO** (Indirect, linked to `orderId`) | Job processing, kiosk routing, pricing calculations, duplicate-print prevention | Permanent / Academic Term | Retained as lightweight order metadata (< 1 KB) for accounting and kiosk analytics. |
| **Payment Verification Data** | `transactionId` (UPI UTR), `paymentStatus` | `orders.transactionId`, `orders.paymentStatus` | **INDIRECT** (Bank UPI reference) | Manual verification by shopkeeper against shop QR merchant transactions | Permanent / Financial Year | Retained for merchant reconciliation and accounting audits. |
| **Audit & Lifecycle Logs** | `auditLog: [{ action, timestamp, reason }]` | `orders.auditLog` | **NO** | Tracking state changes (e.g. `pdf_retention_deleted`, `reprint_completed`) | Preserved with order | Embedded array within order document; records timestamps of deletion. |
| **Operational & Telemetry Logs** | Request logs, timing metrics, error traces | Render stdout/stderr, kiosk `localServer.log` | **NO** (Strictly uses opaque `orderId`) | System monitoring, performance tracking, debugging | Ephemeral (7–30 days) | Automatically overwritten or discarded by host process. Zero PII. |
| **Kiosk Station Health** | `stationId`, `printerName`, `printerAvailable`, `uptimeSeconds`, `lastHeartbeat` | `stations` collection | **NO** (Hardware telemetry only) | Kiosk connectivity and paper/printer availability monitoring | Upserted current state | 1 document per physical shop station; constantly updated. |

---

## 3. PDF Expiration & Automatic Cleanup Architecture

### 3.1 Upload & Print Completion Timestamps
- Every uploaded document receives an immutable `pdfUploadedAt` timestamp and an initial `pdfExpiresAt` timestamp (`uploadTime + 24 hours`).
- When the Print Agent confirms successful printing (`printStatus === 'Printed'`), `printedAt` is recorded (immutable), and `pdfExpiresAt` is transitioned to `printedAt + 30 minutes`.
- If an order is never printed, or is claimed, or payment is verified, or print fails, `pdfExpiresAt` strictly preserves the original upload-based 24-hour deadline.

### 3.2 Dual-Trigger Automatic Cleanup
1. **Startup Purge Hook:**
   - Immediately upon backend startup (`backend/server.js`), `cleanupExpiredPdfs(db)` sweeps all expired orders and orphaned GridFS files that expired while the server was asleep or restarting.
2. **Periodic Background Interval:**
   - Runs every 60 seconds via `setInterval` with an execution concurrency guard (`isCleanupRunning`).

### 3.3 Deletion Mechanism & GridFS Guarantee
- **GridFS Deletion:** Calls `GridFSBucket.delete(fileId)` on the authoritative `order_pdfs` bucket. This atomically removes the file document in `order_pdfs.files` **and** all associated binary chunks in `order_pdfs.chunks`.
- **Runtime Disk Cache:** Unlinks any ephemeral `.pdf_cache/${orderId}.pdf` copy on the server filesystem.
- **In-Progress Safeguard:** Any order whose current status is `Printing` is safely skipped from deletion during cleanup.
- **Atomic Order Update:** Updates the order in `orders` collection:
  - `hasPdf: false`
  - `hasGridFsPdf: false`
  - `pdfStorage: 'none'`
  - `pdfBase64: ''`
  - `pdfSize: 0`
  - `pdfDeletedAt: ISO_TIMESTAMP`
  - Appends audit entry `{ action: 'pdf_retention_deleted', reason: '30_minute_printed_retention_expired' | '24_hour_unprinted_retention_expired' }`.
- **Failure Resilience:** If MongoDB or network connectivity fails during deletion, `pdfDeletedAt` is **not** set, ensuring the order is safely caught and retried on the next 60-second cycle.

### 3.4 Orphaned GridFS File Sweeping
- To prevent storage leaks from abandoned uploads or dropped connections, `cleanupExpiredPdfs` scans `order_pdfs.files` for unreferenced files older than 24 hours.
- Unreferenced files and dangling chunks are permanently removed via `bucket.delete(file._id)`.

---

## 4. Workflow Safeguards & Edge Cases

### 4.1 Order Retrieval & Kiosk Release Enforcement
- In `backend/api/orders.js` (`getOrderPdf`) and `backend/api/agent/orders.js` (`/claim`):
  - If `pdfDeletedAt` is set OR `effectiveExpiry <= now`, the API immediately rejects the request with **HTTP 410 Gone**:
    ```json
    {
      "success": false,
      "error": "Document retention window expired; PDF permanently deleted.",
      "expired": true,
      "hasPdf": false
    }
    ```
  - An expired order cannot be claimed, released, spooled, or downloaded.

### 4.2 Late Payment Verification
- The shopkeeper can manually verify payments at any time.
- Verifying payment on an order never extends the retention window or recreates a deleted PDF.
- If a student pays after expiration, the payment is recorded in accounting records, but printing cannot proceed without re-uploading the document.

### 4.3 Student External Google Drive Boundary
- For orders where the student provided an external Google Drive link (`driveUrl`), XBuddy deletes only its own cached copies and GridFS entries.
- XBuddy never attempts to delete files in a student's personal external Google Drive.
