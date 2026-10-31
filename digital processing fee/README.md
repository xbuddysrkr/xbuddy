# XBuddy Digital Processing Fee Structure & Architecture

This document provides the authoritative specification, pricing slabs, calculation formulas, data schema, and implementation references for the **Digital Processing Fee** across the XBuddy platform.

---

## 1. Slab Rate Structure

The Digital Processing Fee is calculated dynamically based on the **total billable printed pages** for an order:

| Total Printed Pages | Digital Processing Fee (INR) | Effective Student Cost Example (B&W @ ₹2/page) | Effective Student Cost Example (Color @ ₹5/page) |
| :--- | :--- | :--- | :--- |
| **1 – 5 pages** | **₹1** | 1 page = ₹2 print + ₹1 fee = **₹3** | 1 page = ₹5 print + ₹1 fee = **₹6** |
| **6 – 10 pages** | **₹2** | 6 pages = ₹12 print + ₹2 fee = **₹14** | 6 pages = ₹30 print + ₹2 fee = **₹32** |
| **11 – 20 pages** | **₹3** | 15 pages = ₹30 print + ₹3 fee = **₹33** | 15 pages = ₹75 print + ₹3 fee = **₹78** |
| **21 – 30 pages** | **₹4** | 25 pages = ₹50 print + ₹4 fee = **₹54** | 25 pages = ₹125 print + ₹4 fee = **₹129** |
| **31 – 50 pages** | **₹5** | 40 pages = ₹80 print + ₹5 fee = **₹85** | 40 pages = ₹200 print + ₹5 fee = **₹205** |
| **51 – 80 pages** | **₹7** | 60 pages = ₹120 print + ₹7 fee = **₹127** | 60 pages = ₹300 print + ₹7 fee = **₹307** |
| **81 – 100 pages** | **₹10** | 100 pages = ₹200 print + ₹10 fee = **₹210** | 100 pages = ₹500 print + ₹10 fee = **₹510** |
| **> 100 pages** | *Over-limit* | Directs student to contact the Xerox shop | Directs student to contact the Xerox shop |

---

## 2. Calculation Formulas & Mathematical Model

$$\text{Total Billable Pages} = (\text{Effective Pages}) \times \text{Copies}$$

### Page Count Derivation
- **Single-Side Printing (`printSide === 'Single'`):**
  $$\text{Effective Pages} = \text{Printable Pages}$$
- **Double-Side / Duplex (`printSide === 'Double'`):**
  $$\text{Effective Pages} = \left\lceil \dfrac{\text{Printable Pages}}{2} \right\rceil$$

### Financial Breakdown
- **Physical Printing Cost:**
  $$\text{Printing Cost} = \text{Total Billable Pages} \times \text{Rate}$$
  *(Rate: ₹2 per page for Black & White, ₹5 per page for Color)*
- **Digital Processing Fee:**
  Evaluated from the slab based on $\text{Total Billable Pages}$.
- **Final Order Total (INR):**
  $$\text{Total Amount} = \text{Printing Cost} + \text{Digital Processing Fee}$$
- **UPI Paise Equivalent:**
  $$\text{Amount in Paise} = \text{Total Amount} \times 100$$

---

## 3. Data Schema & Persistence Model

The breakdown is authoritatively persisted in **MongoDB Atlas** (`orders` collection) and Google Apps Script records.

### Document Schema Example
```json
{
  "orderId": "XP3372",
  "fileName": "Project_Report.pdf",
  "totalPages": 1,
  "copies": 1,
  "printType": "B&W",
  "printSide": "Single",
  "duplex": false,
  
  "printingCost": 2,
  "digitalProcessingFee": 1,
  "serviceFee": 1,
  "amount": 3,
  "amountPaise": 300,
  
  "paymentStatus": "verified",
  "printStatus": "waiting_for_shopkeeper",
  "source": "direct_upi_checkout",
  "createdAt": "2026-10-31T09:12:00.000Z"
}
```

### Field Definitions
- **`printingCost` (Number):** The cost allocated to printer maintenance, paper, and toner.
- **`digitalProcessingFee` (Number):** The platform convenience fee according to the slab.
- **`serviceFee` (Number):** Maintained as an exact alias of `digitalProcessingFee` for legacy backward compatibility.
- **`amount` (Number):** The complete transaction amount collected from the student via UPI (`printingCost + digitalProcessingFee`).
- **`amountPaise` (Number):** Integer amount in paise used for standard NPCI UPI URI and QR payload generation (`am=3.00`).

---

## 4. Implementation Code References

1. **Frontend Pricing Utilities:**
   - [`calcDigitalProcessingFee`](file:///f:/xerox%20buddy/frontend/src/utils/pricing.js#L18-L34) in [`frontend/src/utils/pricing.js`](file:///f:/xerox%20buddy/frontend/src/utils/pricing.js)
   - Real-time Price Breakdown in [`PriceCard.jsx`](file:///f:/xerox%20buddy/frontend/src/components/PriceCard.jsx) and [`PaymentModal.jsx`](file:///f:/xerox%20buddy/frontend/src/components/PaymentModal.jsx).

2. **Backend Authoritative Pricing & Gateway:**
   - Server-side calculation in [`calculateOrderPrice`](file:///f:/xerox%20buddy/backend/api/_lib/retention.js#L82-L113) in [`backend/api/_lib/retention.js`](file:///f:/xerox%20buddy/backend/api/_lib/retention.js).
   - Direct UPI Checkout persistence in [`direct.js`](file:///f:/xerox%20buddy/backend/api/payments/direct.js#L130-L195).
   - Order creation & list queries in [`orders.js`](file:///f:/xerox%20buddy/backend/api/orders.js#L571-L611).

3. **Admin Dashboard Reporting & Queue Display:**
   - Station-wise Digital Processing Fee Report & CSV Export in [`AdminDashboard.jsx`](file:///f:/xerox%20buddy/frontend/src/components/AdminDashboard.jsx#L618-L847).
   - Campus Queue table with granular Amount breakdown (`₹X print + ₹Y fee`) in [`AdminDashboard.jsx`](file:///f:/xerox%20buddy/frontend/src/components/AdminDashboard.jsx#L1035-L1050).
   - Order Details Modal breakdown in [`AdminDashboard.jsx`](file:///f:/xerox%20buddy/frontend/src/components/AdminDashboard.jsx#L1260-L1275).

4. **Print Station & Google Apps Script Engine:**
   - Slabs synchronization in [`GAS_COMPLETE.js`](file:///f:/xerox%20buddy/backend/print-agent/GAS_COMPLETE.js#L54-L65) and [`Code.gs`](file:///f:/xerox%20buddy/backend/google-apps-script/Code.gs#L520-L535).
