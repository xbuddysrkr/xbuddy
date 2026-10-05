# XBuddy Campus Ads — Google Apps Script Integration Guide

## 1. Separate Google Sheets & Drive Setup

### A. Orders Database (Dedicated Spreadsheet)
- **Spreadsheet ID**: `16R6KiGoNgH31qEJxCiKrNTD2u99TKHJfDlzgb6iH_nw`
- **Tab Name**: `Orders`
- Used exclusively for print orders, customer details, UPI transaction tracking, and print station workflow.

### B. Campus Ads Database (Dedicated Spreadsheet)
- **Spreadsheet ID**: `1a_dzI0AaOQo0gypw00BUUiKC872a7lKbKNQU4qe-Eq4`
- **Tab Name**: `XBuddy Ads`
- **Columns (in exact order)**:
  1. `adId`
  2. `clubName`
  3. `title`
  4. `description`
  5. `mediaType`
  6. `mediaFileId`
  7. `mediaUrl`
  8. `clickUrl`
  9. `buttonText`
  10. `placement`
  11. `startDate`
  12. `endDate`
  13. `status`
  14. `priority`
  15. `createdAt`

- **Google Drive Ads Folder ID**: `1HQ_WklATac1JXXpVOzQ40r_X9AClORGo`
- **Folder Structure**:
  ```
  XBuddy Ads/
  ├── Pending/
  ├── Approved/
  └── Archived/
  ```

---

## 2. Deploying to Existing Apps Script Project

1. Open your existing Google Apps Script editor (the one currently deployed at `https://script.google.com/macros/s/AKfycbymPjGiGwUpVHEY5rWy66tIenGzknt29CbfkkAnUJVTzUKG_bdi8f8Fz3M6eS6aLXot/exec`).
2. Add a new script file: Click **+** > **Script**, name it `CampusAds.gs`.
3. Copy and paste the entire contents of [`CampusAds.gs`](./CampusAds.gs).
4. In your main `Code.gs`, in your existing `doGet(e)` / `doPost(e)` function, add this one-line router call at the top:
   ```javascript
   function doGet(e) {
     // Handle Campus Ads actions
     var adsResponse = handleAdsRequest(e);
     if (adsResponse) return adsResponse;

     // ... existing doGet handlers continue unchanged ...
   }
   ```
5. Click **Deploy** > **Manage Deployments** > **Edit (pencil icon)** > select **New version** > click **Deploy**.
6. (Optional) Run `seedSampleCampusAd()` once in the script editor to automatically populate the `XBuddy Ads` sheet with the AD001 sample record.

---

## 3. Endpoints

- **Get Active Ads**:
  ```
  GET ?action=getAds&placement=order-status
  ```
  Returns:
  ```json
  {
    "success": true,
    "ads": [
      {
        "adId": "AD001",
        "clubName": "SRKR Innovation Hub & CSE Association",
        "title": "CSE Hackathon 2026",
        "description": "Register now",
        "mediaType": "image",
        "mediaFileId": "...",
        "mediaUrl": "...",
        "clickUrl": "https://srkrec.edu.in",
        "buttonText": "Register Now",
        "placement": "order-status",
        "startDate": "2026-10-05",
        "endDate": "2026-10-15",
        "status": "approved",
        "priority": 1
      }
    ]
  }
  ```
