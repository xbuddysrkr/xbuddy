/**
 * ============================================================================
 * X BUDDY — CAMPUS ADVERTISEMENT BACKEND MODULE
 * Google Apps Script Integration
 * ============================================================================
 * 
 * Google Sheet ID:
 * 1a_dzI0AaOQo0gypw00BUUiKC872a7lKbKNQU4qe-Eq4
 * Sheet Name:
 * XBuddy Ads
 * 
 * Google Drive XBuddy Ads Folder ID:
 * 1HQ_WklATac1JXXpVOzQ40r_X9AClORGo
 * Folder Structure:
 * XBuddy Ads/
 * ├── Pending/
 * ├── Approved/
 * └── Archived/
 */

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

/**
 * Ensures the 'XBuddy Ads' sheet exists with the required columns.
 * Does not overwrite existing data.
 */
function getOrCreateAdsSheet() {
  var ss = SpreadsheetApp.openById(ADS_SPREADSHEET_ID);
  var sheet = ss.getSheetByName(ADS_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(ADS_SHEET_NAME);
  }

  // Initialize header row if sheet is empty
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

/**
 * Ensures required subfolders (Pending, Approved, Archived) exist inside the
 * main 'XBuddy Ads' Drive folder. Does NOT create duplicate folders.
 */
function getOrCreateAdsSubfolder(folderName) {
  var mainFolder = DriveApp.getFolderById(ADS_DRIVE_FOLDER_ID);
  var folders = mainFolder.getFoldersByName(folderName);
  if (folders.hasNext()) {
    return folders.next();
  }
  return mainFolder.createFolder(folderName);
}

/**
 * Initializes the full Drive subfolder hierarchy:
 * XBuddy Ads/
 * ├── Pending/
 * ├── Approved/
 * └── Archived/
 */
function initAdsDriveHierarchy() {
  getOrCreateAdsSubfolder('Pending');
  getOrCreateAdsSubfolder('Approved');
  getOrCreateAdsSubfolder('Archived');
}

/**
 * Parses and normalizes date ranges safely.
 * Handles string, Date, and timestamp formats.
 * If endDate is given as YYYY-MM-DD, ensures it is active until 23:59:59.999 of that day.
 */
function isAdActiveDate(startDateVal, endDateVal, now) {
  now = now || new Date();
  var nowMs = now.getTime();

  if (startDateVal) {
    var start = (startDateVal instanceof Date) ? startDateVal : new Date(startDateVal);
    if (!isNaN(start.getTime()) && nowMs < start.getTime()) {
      return false;
    }
  }

  if (endDateVal) {
    var end = (endDateVal instanceof Date) ? new Date(endDateVal.getTime()) : new Date(endDateVal);
    if (!isNaN(end.getTime())) {
      // If time was not explicitly specified (midnight 00:00:00), extend to end of day
      if (typeof endDateVal === 'string' && endDateVal.length <= 10) {
        end.setHours(23, 59, 59, 999);
      }
      if (nowMs > end.getTime()) {
        return false;
      }
    }
  }

  return true;
}

/**
 * Validates whether an ad record is currently active:
 * - status === "approved"
 * - placement matches requested placement (e.g. "order-status")
 * - startDate <= now
 * - endDate >= now
 */
function isAdActive(ad, placement) {
  if (!ad || typeof ad !== 'object') return false;
  if (String(ad.status).trim().toLowerCase() !== 'approved') return false;

  var targetPlacement = placement || 'order-status';
  if (ad.placement && String(ad.placement).trim() !== targetPlacement) return false;

  return isAdActiveDate(ad.startDate, ad.endDate);
}

/**
 * Sorts ads by numeric priority ascending.
 * Lower priority number = higher priority (e.g., priority 1 appears before priority 2).
 */
function sortAdsByPriority(ads) {
  return ads.sort(function(a, b) {
    var pA = parseFloat(a.priority);
    var pB = parseFloat(b.priority);
    if (isNaN(pA)) pA = 999;
    if (isNaN(pB)) pB = 999;
    return pA - pB;
  });
}

/**
 * Reads all rows from 'XBuddy Ads' sheet and maps them to object representations.
 */
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
    // Convert priority to number if valid
    var p = parseFloat(ad.priority);
    ad.priority = isNaN(p) ? 999 : p;
    ads.push(ad);
  }

  return ads;
}

/**
 * Main API function: returns active approved ads for the requested placement.
 * @param {string} placement - defaults to 'order-status'
 * @return {Array<Object>} Sorted active approved ads
 */
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

/**
 * Creates an ad record in the sheet.
 * Initial status is set to 'pending'.
 */
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

/**
 * Admin action: approves an ad and moves its Drive media from Pending/ to Approved/.
 */
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

  // Update status column (13th column = 'status')
  var statusColIndex = ADS_COLUMNS.indexOf('status') + 1;
  sheet.getRange(targetRow, statusColIndex).setValue('approved');

  // Move Drive file if mediaFileId is present
  var fileIdColIndex = ADS_COLUMNS.indexOf('mediaFileId') + 1;
  var fileId = sheet.getRange(targetRow, fileIdColIndex).getValue();
  if (fileId) {
    try {
      var file = DriveApp.getFileById(fileId);
      var approvedFolder = getOrCreateAdsSubfolder('Approved');
      file.moveTo(approvedFolder);
    } catch (e) {
      Logger.log('Could not move file: ' + e.message);
    }
  }

  return { success: true, adId: adId, status: 'approved' };
}

/**
 * Maintenance action: finds expired approved ads and moves them to 'archived'.
 * Also moves their Drive files from Approved/ to Archived/.
 */
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

/**
 * Central API Router Handler for Campus Ads
 * Call this from your existing doGet(e) and doPost(e) in the Google Apps Script project.
 */
function handleAdsRequest(e) {
  var params = (e && e.parameter) ? e.parameter : {};
  var action = params.action || '';

  if (action === 'getAds' || action === 'getActiveAds') {
    var placement = params.placement || 'order-status';
    var activeAds = getActiveAds(placement);
    return ContentService.createTextOutput(JSON.stringify({
      success: true,
      ads: activeAds
    })).setMimeType(ContentService.MimeType.JSON);
  }

  if (action === 'createAdRecord') {
    var result = createAdRecord(params);
    return ContentService.createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
  }

  if (action === 'approveAd') {
    var resApprove = approveAd(params.adId);
    return ContentService.createTextOutput(JSON.stringify(resApprove))
      .setMimeType(ContentService.MimeType.JSON);
  }

  if (action === 'archiveExpiredAds') {
    var resArchive = archiveExpiredAds();
    return ContentService.createTextOutput(JSON.stringify(resArchive))
      .setMimeType(ContentService.MimeType.JSON);
  }

  return null; // Not an ads action — delegate back to existing handler
}

/**
 * Seed initial sample ad (AD001) for testing if sheet is empty.
 */
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
