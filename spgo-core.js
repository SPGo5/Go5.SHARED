// ============================================================
// SPGo Super Portal — Google Apps Script Backend
// Deploy as: Web App > Execute as Me > Anyone can access
// ============================================================

const CLIENT_DB_SHEET_ID  = "1p9B-jSx7FOgXziCBcsQ7ZFwyy6XhuwT1OcoYyEB-gl4";
const CONTACTS_SHEET_NAME = "Contacts";
const STATS_SHEET_NAME    = "Stats";
const VEDIC_FOLDER_ID     = "1zremwI3revG-7JXVrNBbVPIDr2XoD1N7";
const TIMEZONE            = "GMT+7";
const HAIRCUT_SHEET_ID    = "1EuIY_1WEG5jpHPtjPBoknuAlqxkWP05vtitElxkvF2o";
const PROFILE_PIX_FOLDER  = "1lqdsCGjE1-O51Y6JxGHuTdlhDvaFH-rA";

// ── GET handler (all read operations + JSONP) ──
function doGet(e) {
  if (!e || !e.parameter) {
    return ContentService.createTextOutput("OK — deploy as web app to use.")
      .setMimeType(ContentService.MimeType.TEXT);
  }
  const action   = (e.parameter.action   || '').trim();
  const callback = (e.parameter.callback || '').trim();
  let result;
  try {
    if      (action === 'validateEmail')  result = handleValidateEmail(e.parameter.email || '');
    else if (action === 'debugRow')       result = debugRow(e.parameter.email || '');
    else if (action === 'today')          result = handleHaircutToday();
    else if (action === 'date')           result = handleHaircutDate(e.parameter.date || '');
    else if (action === 'vedicCharts')    result = handleVedicCharts(e.parameter.idCode || '');
    else if (action === 'vedicData')      result = handleVedicData(e.parameter.idCode || '', e.parameter.chart || '');
    else if (action === 'getProfilePic')  result = handleGetProfilePic(e.parameter.idCode || '', parseInt(e.parameter.tier || '0'));
    else if (action === 'fsChart')        result = handleFsChart(e.parameter.file || '');
    else if (action === 'ping')           result = handlePing(e.parameter.stat || '', e.parameter.mode || '');
    else if (action === 'stats')          result = handleStats(e.parameter.stat || '');
    else result = { error: 'Unknown action: ' + action };
  } catch(err) {
    result = { error: err.message };
  }
  if (callback) {
    return ContentService
      .createTextOutput(callback + '(' + JSON.stringify(result) + ')')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService
    .createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── POST handler (upload operations — large data) ──
function doPost(e) {
  let result;
  try {
    const params = e.parameter || {};
    const action = (params.action || '').trim();
    if (action === 'saveProfilePic') {
      result = handleSaveProfilePic(params.idCode || '', params.data || '');
    } else if (action === 'deleteProfilePic') {
      result = handleDeleteProfilePic(params.idCode || '');
    } else {
      result = { error: 'Unknown POST action: ' + action };
    }
  } catch(err) {
    result = { error: err.message };
  }
  return ContentService
    .createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── LOGIN: only column B (email) determines access ──
function handleValidateEmail(inputEmail) {
  if (!inputEmail) return { valid: false };
  const db    = SpreadsheetApp.openById(CLIENT_DB_SHEET_ID);
  const sheet = db.getSheetByName(CONTACTS_SHEET_NAME);
  if (!sheet) return { valid: false };
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return { valid: false };
  const data       = sheet.getRange('A2:L' + lastRow).getValues();
  const emailClean = inputEmail.trim().toLowerCase();
  for (const row of data) {
    const email1 = String(row[1]).trim().toLowerCase();
    if (!email1) continue;
    if (email1 === emailClean) {
      const idCode       = String(row[0]).trim();
      const hasPortal    = String(row[2]).trim().toUpperCase() === 'X';
      const fsSubscriber = String(row[4]).trim().toUpperCase() === 'X';
      const hasBara      = String(row[6]).trim().toUpperCase() === 'X';
      const welcomeName  = String(row[8] || '').trim() || idCode;
      const tier         = String(row[9]  || '').trim().toUpperCase() === 'X' ? 1
                         : String(row[10] || '').trim().toUpperCase() === 'X' ? 2
                         : String(row[11] || '').trim().toUpperCase() === 'X' ? 3
                         : 0;
      return { valid: true, idCode, name: welcomeName, fsSubscriber, hasPortal, hasBara, tier };
    }
  }
  return { valid: false };
}

function debugRow(inputEmail) {
  const db    = SpreadsheetApp.openById(CLIENT_DB_SHEET_ID);
  const sheet = db.getSheetByName(CONTACTS_SHEET_NAME);
  const lastRow = sheet.getLastRow();
  const data    = sheet.getRange('A2:M' + lastRow).getValues();
  const emailClean = inputEmail.trim().toLowerCase();
  for (const row of data) {
    if (String(row[1]).trim().toLowerCase() === emailClean) {
      const result = {};
      row.forEach((val, i) => {
        result['col_' + i + '_(' + String.fromCharCode(65 + i) + ')'] = val;
      });
      return result;
    }
  }
  return { error: 'Email not found' };
}

// ── Helper: find file by name in a folder using Drive API ──
function findFileInFolder(folderId, fileName) {
  const query = '"' + folderId + '" in parents and title = "' + fileName.replace(/"/g, '\\"') + '" and trashed = false';
  const res = Drive.Files.list({ q: query, maxResults: 1, fields: 'items(id,mimeType)' });
  if (res.items && res.items.length > 0) return res.items[0];
  return null;
}

function handleVedicCharts(idCode) {
  if (!idCode) return { charts: [] };
  const fileName = idCode + ' \u2014 Vedic Divisional Chart Data';
  const file = findFileInFolder(VEDIC_FOLDER_ID, fileName);
  if (!file) return { charts: [] };
  const ss       = SpreadsheetApp.openById(file.id);
  const nonEmpty = ss.getSheets().filter(s => s.getLastRow() > 0);
  return { charts: nonEmpty.map(s => s.getName()) };
}

function handleVedicData(idCode, chartName) {
  if (!idCode || !chartName) return { data: '' };
  const fileName = idCode + ' \u2014 Vedic Divisional Chart Data';
  const file = findFileInFolder(VEDIC_FOLDER_ID, fileName);
  if (!file) return { data: 'No data found.' };
  const sheet = SpreadsheetApp.openById(file.id).getSheetByName(chartName);
  if (!sheet) return { data: 'Chart not found.' };
  const data = sheet.getRange('A1:A' + sheet.getLastRow()).getValues()
    .map(r => r[0].toString().trim()).filter(l => l.length > 0).join('\n');
  return { data };
}

function handleHaircutToday() { return getAdviceForDate(new Date()); }

function handleHaircutDate(dateParam) {
  if (!dateParam) return { error: 'No date provided' };
  const d = new Date(dateParam);
  if (isNaN(d)) return { error: 'Invalid date' };
  return getAdviceForDate(d);
}

function getAdviceForDate(dateObj) {
  const ss      = SpreadsheetApp.openById(HAIRCUT_SHEET_ID);
  const dateStr = Utilities.formatDate(dateObj, TIMEZONE, 'M/d/yyyy');
  const year    = Utilities.formatDate(dateObj, TIMEZONE, 'yyyy');
  const sheet   = ss.getSheetByName(year);
  if (!sheet) return { date: dateStr, advice: 'No data for year ' + year };
  const values  = sheet.getDataRange().getDisplayValues();
  for (const row of values) {
    if (row[0] === dateStr) {
      return { date: dateStr, advice: row[1].toString().replace(/\n/g, '<br>') };
    }
  }
  return { date: dateStr, advice: 'No advice found for this date.' };
}

function handleGetProfilePic(idCode, tier) {
  if (!idCode) return { data: null };
  try {
    const personalName = idCode + '-Profile-Pic-R.png';
    const personalFile = findFileInFolder(PROFILE_PIX_FOLDER, personalName);
    if (personalFile) {
      const blob = DriveApp.getFileById(personalFile.id).getBlob();
      return { data: Utilities.base64Encode(blob.getBytes()), mime: blob.getContentType(), isPersonal: true };
    }
    const tierNum  = (tier >= 1 && tier <= 3) ? tier : 1;
    const tierName = 'SPGo-Member-Tier' + tierNum + '.png';
    const tierFile = findFileInFolder(PROFILE_PIX_FOLDER, tierName);
    if (tierFile) {
      const blob = DriveApp.getFileById(tierFile.id).getBlob();
      return { data: Utilities.base64Encode(blob.getBytes()), mime: blob.getContentType() };
    }
    return { data: null };
  } catch(err) {
    return { error: err.message };
  }
}

function handleSaveProfilePic(idCode, base64Data) {
  if (!idCode || !base64Data) return { error: 'Missing data' };
  try {
    const filename  = idCode + '-Profile-Pic-R.png';
    const cleanData = base64Data.replace(/^data:image\/\w+;base64,/, '');
    const bytes     = Utilities.base64Decode(cleanData);
    const blob      = Utilities.newBlob(bytes, 'image/png', filename);
    const existing = findFileInFolder(PROFILE_PIX_FOLDER, filename);
    if (existing) Drive.Files.trash(existing.id);
    const folder = DriveApp.getFolderById(PROFILE_PIX_FOLDER);
    folder.createFile(blob);
    return { success: true };
  } catch(err) {
    return { error: err.message };
  }
}

function handleDeleteProfilePic(idCode) {
  if (!idCode) return { error: 'Missing idCode' };
  try {
    const filename = idCode + '-Profile-Pic-R.png';
    const existing = findFileInFolder(PROFILE_PIX_FOLDER, filename);
    if (existing) Drive.Files.trash(existing.id);
    return { success: true };
  } catch(err) {
    return { error: err.message };
  }
}

// ============================================================
// FS CHARTS — serve chart images from Drive
// ============================================================
function handleFsChart(fileName) {
  if (!fileName) return { error: 'No filename provided' };
  try {
    const file = findFileInFolder(FS_CHARTS_FOLDER_ID, fileName);
    if (!file) return { error: 'Chart not found: ' + fileName };
    const blob = DriveApp.getFileById(file.id).getBlob();
    return {
      data: Utilities.base64Encode(blob.getBytes()),
      mime: blob.getContentType()
    };
  } catch(err) {
    return { error: err.message };
  }
}

// ============================================================
// STATS — ping (increment or timestamp) + read
// ============================================================
function handlePing(stat, mode) {
  if (!stat) return { error: 'Missing stat key' };
  const ss    = SpreadsheetApp.openById(CLIENT_DB_SHEET_ID);
  const sheet = ss.getSheetByName(STATS_SHEET_NAME);
  if (!sheet) return { error: 'Stats sheet not found' };

  const lastRow = sheet.getLastRow();
  const data    = sheet.getRange('A1:C' + lastRow).getValues();

  for (let i = 0; i < data.length; i++) {
    if (String(data[i][0]).trim() === stat) {
      const row = i + 1;
      const now = Utilities.formatDate(new Date(), TIMEZONE, 'yyyy-MM-dd HH:mm:ss');
      if (mode === 'ts') {
        sheet.getRange(row, 2).setValue(now);
        sheet.getRange(row, 3).setValue(now);
        return { ok: true, last_updated: now };
      } else {
        const current = parseInt(sheet.getRange(row, 2).getValue()) || 0;
        const newVal  = current + 1;
        sheet.getRange(row, 2).setValue(newVal);
        sheet.getRange(row, 3).setValue(now);
        return { count: newVal, last_updated: now };
      }
    }
  }
  return { error: 'Stat key not found: ' + stat };
}

function handleStats(stat) {
  const ss    = SpreadsheetApp.openById(CLIENT_DB_SHEET_ID);
  const sheet = ss.getSheetByName(STATS_SHEET_NAME);
  if (!sheet) return { error: 'Stats sheet not found' };

  const lastRow = sheet.getLastRow();
  const data    = sheet.getRange('A1:C' + lastRow).getValues();

  if (stat) {
    for (let i = 0; i < data.length; i++) {
      if (String(data[i][0]).trim() === stat) {
        return { value: data[i][1], last_updated: data[i][2] };
      }
    }
    return { error: 'Stat key not found: ' + stat };
  }

  const result = {};
  for (const row of data) {
    const key = String(row[0]).trim();
    if (!key || key.startsWith('▸') || key.startsWith('action') || key.startsWith('Keys')) continue;
    result[key] = { value: row[1], last_updated: row[2] };
  }
  return result;
}



function testValidate() {
  const sheet = SpreadsheetApp.openById('1p9B-jSx7FOgXziCBcsQ7ZFwyy6XhuwT1OcoYyEB-gl4')
                              .getSheetByName('Contacts');
  const data = sheet.getDataRange().getValues();
  Logger.log(data[1]); // logs second row
}
