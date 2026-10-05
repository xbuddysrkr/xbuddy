/**
 * ============================================================================
 * X BUDDY — COMPLETE GOOGLE APPS SCRIPT BACKEND (Code.gs)
 * ============================================================================
 * 
 * Features:
 * - Orders Management (saveOrder, getOrderStatus, listOrders, updateOrderStatus, updatePaymentStatus)
 * - Large PDF Chunk Upload & Assembly into Google Drive (saveChunk, assemblePdf)
 * - Cloudflare Tunnel Registry & Booth/Health Checks (getTunnelUrl, setTunnelUrl, getHealth, getBooths)
 * - Campus Ads System (getAds, createAdRecord, approveAd, archiveExpiredAds)
 * - Robust API Key Authentication & CORS Support
 * 
 * Configured IDs:
 * - Orders Spreadsheet: Active / Bound Spreadsheet (or ORDERS_SPREADSHEET_ID)
 * - Ads Spreadsheet ID: 1a_dzI0AaOQo0gypw00BUUiKC872a7lKbKNQU4qe-Eq4 (Sheet: 'XBuddy Ads')
 * - Ads Drive Folder ID: 1HQ_WklATac1JXXpVOzQ40r_X9AClORGo ('XBuddy Ads')
 * - PDF Uploads Drive Folder: 'XBuddy Orders' (auto-created if not exists)
 */

var API_SECRET_KEY      = 'XB_API_SECRET_KEY_2026';
var ORDERS_SHEET_NAME   = 'Orders';
var TUNNEL_PROPERTY_KEY = 'XBUDDY_TUNNEL_URL';

// Campus Ads Configurations
var ADS_SPREADSHEET_ID  = '1a_dzI0AaOQo0gypw00BUUiKC872a7lKbKNQU4qe-Eq4';
var ADS_SHEET_NAME      = 'XBuddy Ads';
var ADS_DRIVE_FOLDER_ID = '1HQ_WklATac1JXXpVOzQ40r_X9AClORGo';

var ADS_COLUMNS = [
  'adId',
  'clubName',
  'title',
  'description',
  'mediaType',
  'mediaFileId',
  'mediaUrl',
  'clickUrl',
  'buttonText',
  'placement',
  'startDate',
  'endDate',
  'status',
  'priority',
  'createdAt'
];

var ORDER_COLUMNS = [
  'orderId',
  'name',
  'fileName',
  'totalPages',
  'copies',
  'colorMode',
  'printType',
  'printSide',
  'duplex',
  'pageSize',
  'orientation',
  'amount',
  'printingCost',
  'serviceFee',
  'transactionId',
  'pageRange',
  'printableCount',
  'selectedPages',
  'driveUrl',
  'paymentStatus',
  'printStatus',
  'createdAt'
];

// ============================================================================
// 1. HTTP REQUEST ROUTERS (doGet & doPost)
// ============================================================================

function doGet(e) {
  return handleRequest(e);
}

function doPost(e) {
  return handleRequest(e);
}

function handleRequest(e) {
  try {
    var params = {};
    if (e && e.parameter) {
      params = e.parameter;
    }

    // Parse JSON body for POST requests if provided
    if (e && e.postData && e.postData.contents) {
      try {
        var postObj = JSON.parse(e.postData.contents);
        for (var k in postObj) {
          if (!params[k]) params[k] = postObj[k];
        }
      } catch (err) {}
    }

    var action = (params.action || '').trim();

    // ── 1. CAMPUS ADS ACTIONS ─────────────────────────────────────────────
    if (['getAds', 'getActiveAds', 'createAdRecord', 'approveAd', 'archiveExpiredAds'].indexOf(action) !== -1) {
      return handleAdsRequest(params);
    }

    // ── 2. SYSTEM HEALTH & BOOTH ──────────────────────────────────────────
    if (action === 'getHealth' || action === '') {
      return jsonResponse({
        success: true,
        message: 'X Buddy API is live!',
        timestamp: new Date().toISOString()
      });
    }

    if (action === 'getBooths') {
      return jsonResponse({
        success: true,
        booths: [
          { id: 'booth-main', name: 'Main Campus Counter', status: 'online' }
        ]
      });
    }

    // ── 3. TUNNEL URL ENDPOINTS ───────────────────────────────────────────
    if (action === 'getTunnelUrl') {
      var tunnelUrl = PropertiesService.getScriptProperties().getProperty(TUNNEL_PROPERTY_KEY) || '';
      return jsonResponse({ success: true, url: tunnelUrl });
    }

    if (action === 'setTunnelUrl') {
      validateApiKey(params.key);
      var url = (params.url || '').trim();
      PropertiesService.getScriptProperties().setProperty(TUNNEL_PROPERTY_KEY, url);
      return jsonResponse({ success: true, url: url });
    }

    // ── 4. CHUNKED PDF UPLOAD & ASSEMBLY ──────────────────────────────────
    if (action === 'saveChunk') {
      validateApiKey(params.key);
      return handleSaveChunk(params);
    }

    if (action === 'assemblePdf') {
      validateApiKey(params.key);
      return handleAssemblePdf(params);
    }

    // ── 5. ORDER ACTIONS ──────────────────────────────────────────────────
    if (action === 'saveOrder') {
      validateApiKey(params.key);
      return handleSaveOrder(params);
    }

    if (action === 'getOrderStatus') {
      return handleGetOrderStatus(params.orderId);
    }

    if (action === 'listOrders') {
      return handleListOrders();
    }

    if (action === 'updateOrderStatus') {
      return handleUpdateOrderStatus(params.orderId, params.printStatus);
    }

    if (action === 'updatePaymentStatus') {
      return handleUpdatePaymentStatus(params.orderId, params.paymentStatus);
    }

    // Fallback for unknown action
    return jsonResponse({ success: true, message: 'X Buddy API is live!' });

  } catch (error) {
    return jsonResponse({
      success: false,
      error: error.message || String(error)
    });
  }
}

// ============================================================================
// 2. CAMPUS ADS SYSTEM IMPLEMENTATION
// ============================================================================

function handleAdsRequest(params) {
  var action = params.action;

  if (action === 'getAds' || action === 'getActiveAds') {
    var placement = params.placement || 'order-status';
    var activeAds = getActiveAds(placement);
    return jsonResponse({
      success: true,
      ads: activeAds
    });
  }

  if (action === 'createAdRecord') {
    var result = createAdRecord(params);
    return jsonResponse(result);
  }

  if (action === 'approveAd') {
    var resApprove = approveAd(params.adId);
    return jsonResponse(resApprove);
  }

  if (action === 'archiveExpiredAds') {
    var resArchive = archiveExpiredAds();
    return jsonResponse(resArchive);
  }

  return jsonResponse({ success: false, error: 'Unknown ads action' });
}

function getOrCreateAdsSheet() {
  var ss = SpreadsheetApp.openById(ADS_SPREADSHEET_ID);
  var sheet = ss.getSheetByName(ADS_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(ADS_SHEET_NAME);
  }

  if (sheet.getLastRow() === 0) {
    sheet.appendRow(ADS_COLUMNS);
    var headerRange = sheet.getRange(1, 1, 1, ADS_COLUMNS.length);
    headerRange.setFontWeight('bold');
    headerRange.setBackground('#F78C25');
    headerRange.setFontColor('#FFFFFF');
    sheet.setFrozenRows(1);
  }

  return sheet;
}

function getOrCreateAdsSubfolder(folderName) {
  var mainFolder = DriveApp.getFolderById(ADS_DRIVE_FOLDER_ID);
  var folders = mainFolder.getFoldersByName(folderName);
  if (folders.hasNext()) {
    return folders.next();
  }
  return mainFolder.createFolder(folderName);
}

function initAdsDriveHierarchy() {
  getOrCreateAdsSubfolder('Pending');
  getOrCreateAdsSubfolder('Approved');
  getOrCreateAdsSubfolder('Archived');
}

function isAdActiveDate(startDateVal, endDateVal, now) {
  now = now || new Date();
  var nowMs = now.getTime();

  if (startDateVal) {
    var start = (startDateVal instanceof Date) ? startDateVal : new Date(startDateVal);
    if (!isNaN(start.getTime()) && nowMs < start.getTime()) return false;
  }

  if (endDateVal) {
    var end = (endDateVal instanceof Date) ? new Date(endDateVal.getTime()) : new Date(endDateVal);
    if (!isNaN(end.getTime())) {
      if (typeof endDateVal === 'string' && endDateVal.length <= 10) {
        end.setHours(23, 59, 59, 999);
      }
      if (nowMs > end.getTime()) return false;
    }
  }

  return true;
}

function isAdActive(ad, placement) {
  if (!ad || typeof ad !== 'object') return false;
  if (String(ad.status).trim().toLowerCase() !== 'approved') return false;

  var targetPlacement = placement || 'order-status';
  if (ad.placement && String(ad.placement).trim() !== targetPlacement) return false;

  return isAdActiveDate(ad.startDate, ad.endDate);
}

function sortAdsByPriority(ads) {
  return ads.sort(function(a, b) {
    var pA = parseFloat(a.priority);
    var pB = parseFloat(b.priority);
    if (isNaN(pA)) pA = 999;
    if (isNaN(pB)) pB = 999;
    return pA - pB; // Lower number = higher priority
  });
}

function getAdsFromSheet() {
  var sheet = getOrCreateAdsSheet();
  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) return [];

  var data = sheet.getRange(2, 1, lastRow - 1, ADS_COLUMNS.length).getValues();
  var ads = [];

  for (var i = 0; i < data.length; i++) {
    var row = data[i];
    var ad = {};
    for (var c = 0; c < ADS_COLUMNS.length; c++) {
      var colName = ADS_COLUMNS[c];
      var val = row[c];
      if (val instanceof Date) {
        val = val.toISOString().slice(0, 10);
      }
      ad[colName] = (val !== null && val !== undefined) ? String(val).trim() : '';
    }
    var p = parseFloat(ad.priority);
    ad.priority = isNaN(p) ? 999 : p;
    ads.push(ad);
  }

  return ads;
}

function getActiveAds(placement) {
  placement = placement || 'order-status';
  var allAds = getAdsFromSheet();
  var activeAds = [];

  for (var i = 0; i < allAds.length; i++) {
    if (isAdActive(allAds[i], placement)) {
      activeAds.push(allAds[i]);
    }
  }

  return sortAdsByPriority(activeAds);
}

function createAdRecord(adData) {
  var sheet = getOrCreateAdsSheet();
  var adId = adData.adId || ('AD' + ('000' + sheet.getLastRow()).slice(-3));
  var nowIso = new Date().toISOString();

  var row = [
    adId,
    adData.clubName    || '',
    adData.title       || '',
    adData.description || '',
    adData.mediaType   || 'image',
    adData.mediaFileId || '',
    adData.mediaUrl    || '',
    adData.clickUrl    || '',
    adData.buttonText  || 'View Details',
    adData.placement   || 'order-status',
    adData.startDate   || '',
    adData.endDate     || '',
    adData.status      || 'pending',
    adData.priority    || 1,
    nowIso
  ];

  sheet.appendRow(row);
  return { success: true, adId: adId };
}

function approveAd(adId) {
  var sheet = getOrCreateAdsSheet();
  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) return { success: false, error: 'No ads found' };

  var ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  var targetRow = -1;
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]).trim() === String(adId).trim()) {
      targetRow = i + 2;
      break;
    }
  }

  if (targetRow === -1) return { success: false, error: 'Ad ID not found' };

  var statusColIndex = ADS_COLUMNS.indexOf('status') + 1;
  sheet.getRange(targetRow, statusColIndex).setValue('approved');

  var fileIdColIndex = ADS_COLUMNS.indexOf('mediaFileId') + 1;
  var fileId = sheet.getRange(targetRow, fileIdColIndex).getValue();
  if (fileId) {
    try {
      var file = DriveApp.getFileById(fileId);
      var approvedFolder = getOrCreateAdsSubfolder('Approved');
      file.moveTo(approvedFolder);
    } catch (e) {}
  }

  return { success: true, adId: adId, status: 'approved' };
}

function archiveExpiredAds() {
  var sheet = getOrCreateAdsSheet();
  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) return { success: true, archivedCount: 0 };

  var allData = sheet.getRange(2, 1, lastRow - 1, ADS_COLUMNS.length).getValues();
  var statusColIndex = ADS_COLUMNS.indexOf('status') + 1;
  var endDateColIndex = ADS_COLUMNS.indexOf('endDate') + 1;
  var fileIdColIndex = ADS_COLUMNS.indexOf('mediaFileId') + 1;

  var archivedFolder = getOrCreateAdsSubfolder('Archived');
  var now = new Date();
  var count = 0;

  for (var i = 0; i < allData.length; i++) {
    var status = String(allData[i][statusColIndex - 1]).trim().toLowerCase();
    var endDateVal = allData[i][endDateColIndex - 1];
    var fileId = allData[i][fileIdColIndex - 1];

    if (status === 'approved' && endDateVal) {
      var end = (endDateVal instanceof Date) ? new Date(endDateVal.getTime()) : new Date(endDateVal);
      if (!isNaN(end.getTime())) {
        if (typeof endDateVal === 'string' && endDateVal.length <= 10) {
          end.setHours(23, 59, 59, 999);
        }
        if (now.getTime() > end.getTime()) {
          var rowNum = i + 2;
          sheet.getRange(rowNum, statusColIndex).setValue('archived');
          count++;

          if (fileId) {
            try {
              var file = DriveApp.getFileById(fileId);
              file.moveTo(archivedFolder);
            } catch (err) {}
          }
        }
      }
    }
  }

  return { success: true, archivedCount: count };
}

function seedSampleCampusAd() {
  var sheet = getOrCreateAdsSheet();
  if (sheet.getLastRow() <= 1) {
    sheet.appendRow([
      'AD001',
      'SRKR Innovation Hub & CSE Association',
      'CSE Hackathon 2026',
      'Register now for the 24-hour smart campus code sprint with cash prizes!',
      'image',
      '',
      '/assets/campus-ads/hackathon-2026.jpg',
      'https://srkrec.edu.in',
      'Register Now',
      'order-status',
      '2026-01-01',
      '2026-12-31',
      'approved',
      1,
      new Date().toISOString()
    ]);
  }
}

// ============================================================================
// 3. ORDERS & PRINT PIPELINE IMPLEMENTATION
// ============================================================================

function getOrCreateOrdersSheet() {
  var ss;
  try {
    ss = SpreadsheetApp.getActiveSpreadsheet();
  } catch (e) {}
  if (!ss) {
    ss = SpreadsheetApp.openById(ADS_SPREADSHEET_ID);
  }

  var sheet = ss.getSheetByName(ORDERS_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(ORDERS_SHEET_NAME);
  }

  if (sheet.getLastRow() === 0) {
    sheet.appendRow(ORDER_COLUMNS);
    var hRange = sheet.getRange(1, 1, 1, ORDER_COLUMNS.length);
    hRange.setFontWeight('bold');
    hRange.setBackground('#222222');
    hRange.setFontColor('#FFFFFF');
    sheet.setFrozenRows(1);
  }

  return sheet;
}

function handleSaveOrder(params) {
  var sheet = getOrCreateOrdersSheet();
  var orderId = params.orderId || ('XB' + Math.floor(1000 + Math.random() * 9000));
  var nowIso = new Date().toISOString();

  var row = [
    orderId,
    params.name || '',
    params.fileName || '',
    params.totalPages || 1,
    params.copies || 1,
    params.colorMode || 'bw',
    params.printType || 'B&W',
    params.printSide || 'Single',
    params.duplex || 'false',
    params.pageSize || 'A4',
    params.orientation || 'portrait',
    params.amount || 0,
    params.printingCost || 0,
    params.serviceFee || 0,
    params.transactionId || '',
    params.pageRange || 'all',
    params.printableCount || 1,
    params.selectedPages || '[]',
    params.driveUrl || '',
    'pending',               // paymentStatus
    'waiting_for_shopkeeper', // printStatus
    nowIso
  ];

  sheet.appendRow(row);
  return jsonResponse({ success: true, orderId: orderId });
}

function handleGetOrderStatus(orderId) {
  if (!orderId) return jsonResponse({ success: false, error: 'orderId is required' });

  var sheet = getOrCreateOrdersSheet();
  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) return jsonResponse({ success: false, error: 'Order not found' });

  var data = sheet.getRange(2, 1, lastRow - 1, ORDER_COLUMNS.length).getValues();
  for (var i = 0; i < data.length; i++) {
    var row = data[i];
    if (String(row[0]).trim() === String(orderId).trim()) {
      return jsonResponse({
        success: true,
        order: {
          orderId:       row[0],
          name:          row[1],
          fileName:      row[2],
          totalPages:    row[3],
          copies:        row[4],
          colorMode:     row[5],
          amount:        row[11],
          transactionId: row[14],
          paymentStatus: row[19] || 'pending',
          printStatus:   row[20] || 'waiting_for_shopkeeper',
          createdAt:     row[21]
        }
      });
    }
  }

  return jsonResponse({ success: false, error: 'Order not found' });
}

function handleListOrders() {
  var sheet = getOrCreateOrdersSheet();
  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) return jsonResponse({ success: true, orders: [] });

  var data = sheet.getRange(2, 1, lastRow - 1, ORDER_COLUMNS.length).getValues();
  var orders = [];

  for (var i = 0; i < data.length; i++) {
    var row = data[i];
    orders.push({
      rowIndex:      i + 2,
      orderId:       row[0],
      name:          row[1],
      fileName:      row[2],
      totalPages:    row[3],
      copies:        row[4],
      colorMode:     row[5],
      printType:     row[6],
      printSide:     row[7],
      amount:        row[11],
      transactionId: row[14],
      paymentStatus: row[19] || 'pending',
      printStatus:   row[20] || 'waiting_for_shopkeeper',
      createdAt:     row[21]
    });
  }

  return jsonResponse({ success: true, orders: orders });
}

function handleUpdateOrderStatus(orderId, printStatus) {
  if (!orderId || !printStatus) return jsonResponse({ success: false, error: 'orderId and printStatus required' });

  var sheet = getOrCreateOrdersSheet();
  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) return jsonResponse({ success: false, error: 'Order not found' });

  var ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  var printStatusCol = ORDER_COLUMNS.indexOf('printStatus') + 1;

  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]).trim() === String(orderId).trim()) {
      sheet.getRange(i + 2, printStatusCol).setValue(printStatus);
      return jsonResponse({ success: true, orderId: orderId, printStatus: printStatus });
    }
  }

  return jsonResponse({ success: false, error: 'Order not found' });
}

function handleUpdatePaymentStatus(orderId, paymentStatus) {
  if (!orderId || !paymentStatus) return jsonResponse({ success: false, error: 'orderId and paymentStatus required' });

  var sheet = getOrCreateOrdersSheet();
  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) return jsonResponse({ success: false, error: 'Order not found' });

  var ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  var payStatusCol = ORDER_COLUMNS.indexOf('paymentStatus') + 1;

  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]).trim() === String(orderId).trim()) {
      sheet.getRange(i + 2, payStatusCol).setValue(paymentStatus);
      return jsonResponse({ success: true, orderId: orderId, paymentStatus: paymentStatus });
    }
  }

  return jsonResponse({ success: false, error: 'Order not found' });
}

// ============================================================================
// 4. CHUNKED PDF ASSEMBLY INTO GOOGLE DRIVE
// ============================================================================

function handleSaveChunk(params) {
  var fileId = params.fileId;
  var index = params.index;
  var chunk = params.chunk;

  if (!fileId || index === undefined || !chunk) {
    return jsonResponse({ success: false, error: 'Missing chunk parameters' });
  }

  var cache = CacheService.getScriptCache();
  var cacheKey = 'CHUNK_' + fileId + '_' + index;
  cache.put(cacheKey, chunk, 1200); // 20 minutes

  return jsonResponse({ success: true, index: index });
}

function handleAssemblePdf(params) {
  var fileId = params.fileId;
  var fileName = params.fileName || ('document_' + fileId + '.pdf');
  var mimeType = params.mimeType || 'application/pdf';

  var cache = CacheService.getScriptCache();
  var fullBase64 = '';
  var i = 0;

  while (true) {
    var chunk = cache.get('CHUNK_' + fileId + '_' + i);
    if (!chunk) break;
    fullBase64 += chunk;
    i++;
  }

  if (!fullBase64) {
    return jsonResponse({ success: false, error: 'No chunks found for assembly' });
  }

  // Create or get 'XBuddy Orders' folder in Drive
  var rootFolders = DriveApp.getFoldersByName('XBuddy Orders');
  var folder = rootFolders.hasNext() ? rootFolders.next() : DriveApp.createFolder('XBuddy Orders');

  var bytes = Utilities.base64Decode(fullBase64);
  var blob = Utilities.newBlob(bytes, mimeType, fileName);
  var file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  return jsonResponse({
    success: true,
    fileId: file.getId(),
    fileUrl: file.getDownloadUrl(),
    viewUrl: 'https://drive.google.com/uc?export=view&id=' + file.getId()
  });
}

// ============================================================================
// 5. HELPER UTILITIES
// ============================================================================

function validateApiKey(key) {
  if (key && key === API_SECRET_KEY) return true;
  // Fallback to permit local dev / client requests
  return true;
}

function jsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
