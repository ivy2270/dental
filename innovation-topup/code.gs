/**
 * 禾新餐費管理系統 - 後端 GAS 程式碼
 */

const SS = SpreadsheetApp.getActiveSpreadsheet();
const USERS_SHEET = SS.getSheetByName('Users');
const LOG_SHEET = SS.getSheetByName('Log');
const CONFIG_SHEET = SS.getSheetByName('Config');

/**
 * 處理 GET 請求
 */
function doGet(e) {
  const action = e.parameter.action;
  const apiKey = e.parameter.key;

  // 驗證 API KEY (GET 也需要驗證)
  if (!verifyApiKey(apiKey)) {
    return createJsonResponse({ error: 'Unauthorized: Invalid API Key' }, 401);
  }
  
  try {
    if (action === 'init') {
      return createJsonResponse({
        users: getUsersData(),
        categories: ['午餐', '飲料', '晚餐', '其他', '儲值']
      });
    }
    
    if (action === 'getHistory') {
      const name = e.parameter.name;
      const start = e.parameter.start;
      const end = e.parameter.end;
      const page = parseInt(e.parameter.page) || 1;
      const pageSize = 100;
      return createJsonResponse(getHistoryData(name, start, end, page, pageSize));
    }

    return createJsonResponse({ error: 'Invalid action' }, 400);
  } catch (err) {
    return createJsonResponse({ error: err.toString() }, 500);
  }
}

/**
 * 處理 POST 請求
 */
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const action = data.action;
    const apiKey = data.key;

    // 驗證 API KEY
    if (!verifyApiKey(apiKey)) {
      return createJsonResponse({ error: 'Unauthorized: Invalid API Key' }, 401);
    }

    if (action === 'recordTransaction') {
      return createJsonResponse(recordTransactions(data.records));
    }

    if (action === 'deposit') {
      return createJsonResponse(recordDeposit(data.record));
    }

    return createJsonResponse({ error: 'Invalid action' }, 400);
  } catch (err) {
    return createJsonResponse({ error: err.toString() }, 500);
  }
}

/**
 * 驗證 API KEY
 */
function verifyApiKey(key) {
  const config = CONFIG_SHEET.getDataRange().getValues();
  for (let i = 1; i < config.length; i++) {
    if (config[i][0] === 'API_KEY' && config[i][1] === key) {
      return true;
    }
  }
  return false;
}

/**
 * 獲取所有使用者與餘額
 */
function getUsersData() {
  const data = USERS_SHEET.getDataRange().getValues();
  const headers = data[0].map(h => h.toString().trim()); // 去除空白
  const results = [];
  
  const nameIdx = headers.indexOf('Name');
  const balanceIdx = headers.indexOf('Balance');
  const activeIdx = headers.indexOf('IsActive');

  // 如果找不到標題，回報錯誤以便除錯
  if (nameIdx === -1 || balanceIdx === -1 || activeIdx === -1) {
    throw new Error('找不到必要的欄位標題 (Name, Balance, IsActive)，請檢查工作表第一列。');
  }
  
  for (let i = 1; i < data.length; i++) {
    const isActive = data[i][activeIdx];
    // 支援布林值或是字串 "TRUE"
    if (isActive === true || isActive === "TRUE") {
      results.push({
        name: data[i][nameIdx] || '未命名',
        balance: parseFloat(data[i][balanceIdx]) || 0
      });
    }
  }
  return results;
}

/**
 * 獲取歷史紀錄 (分頁+日期篩選版)
 */
function getHistoryData(name, start, end, page, pageSize) {
  const data = LOG_SHEET.getDataRange().getValues();
  const filteredData = [];
  
  // 將日期字串轉換為 Date 物件以便比較
  const startDate = start ? new Date(start) : null;
  const endDate = end ? new Date(end) : null;
  if (endDate) endDate.setHours(23, 59, 59, 999); // 包含結束當日

  for (let i = data.length - 1; i >= 1; i--) {
    const rowDate = new Date(data[i][0]);
    const nameMatch = (name === '全部' || data[i][1] === name);
    const dateMatch = (!startDate || rowDate >= startDate) && (!endDate || rowDate <= endDate);

    if (nameMatch && dateMatch) {
      filteredData.push({
        timestamp: Utilities.formatDate(rowDate, "GMT+8", "yyyy-MM-dd HH:mm"),
        name: data[i][1],
        type: data[i][2],
        category: data[i][3],
        amount: data[i][4],
        note: data[i][5]
      });
    }
  }

  // 實作分頁
  const startIdx = (page - 1) * pageSize;
  const endIdx = startIdx + pageSize;
  const paginatedData = filteredData.slice(startIdx, endIdx);

  return {
    data: paginatedData,
    total: filteredData.length,
    currentPage: page,
    hasMore: filteredData.length > endIdx
  };
}

/**
 * 紀錄多筆支出
 */
function recordTransactions(records) {
  const timestamp = new Date();
  records.forEach(r => {
    LOG_SHEET.appendRow([
      timestamp,
      r.name,
      '支出',
      r.category,
      -Math.abs(r.amount), // 強制負數
      r.note || ''
    ]);
    updateUserBalance(r.name, -Math.abs(r.amount));
  });
  return { success: true, count: records.length };
}

/**
 * 紀錄單筆儲值
 */
function recordDeposit(r) {
  const timestamp = new Date();
  LOG_SHEET.appendRow([
    timestamp,
    r.name,
    '儲值',
    '儲值',
    Math.abs(r.amount), // 強制正數
    r.note || ''
  ]);
  updateUserBalance(r.name, Math.abs(r.amount));
  return { success: true };
}

/**
 * 更新使用者餘額
 */
function updateUserBalance(name, diff) {
  const data = USERS_SHEET.getDataRange().getValues();
  const headers = data[0].map(h => h.toString().trim());
  const nameIdx = headers.indexOf('Name');
  const balanceIdx = headers.indexOf('Balance');

  for (let i = 1; i < data.length; i++) {
    if (data[i][nameIdx] === name) {
      const currentBalance = parseFloat(data[i][balanceIdx]) || 0;
      USERS_SHEET.getRange(i + 1, balanceIdx + 1).setValue(currentBalance + diff);
      break;
    }
  }
}

/**
 * 建立 JSON 回傳格式
 */
function createJsonResponse(data, status = 200) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
