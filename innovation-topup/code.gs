/**
 * 餐費記錄系統 - Google Apps Script backend
 *
 * Log columns:
 * A ID
 * B 時間
 * C 人員
 * D 支出/儲值
 * E 項目
 * F 金額
 * G 備註 (optional, used by the frontend)
 *
 * Users:
 * A Name
 * B Balance
 * C IsActive
 */

const SS = SpreadsheetApp.getActiveSpreadsheet();
const USERS_SHEET = SS.getSheetByName('Users');
const LOG_SHEET = SS.getSheetByName('Log');
const CONFIG_SHEET = SS.getSheetByName('Config');

function doGet(e) {
  const action = e.parameter.action;
  const name = e.parameter.name_auth;
  const password = e.parameter.pass_auth;

  if (!verifyUser(name, password)) {
    return createJsonResponse({ error: 'Unauthorized: Invalid User or Password' }, 401);
  }

  try {
    if (action === 'init') {
      return createJsonResponse({
        users: getUsersData(),
        categories: ['午餐', '飲料', '晚餐', '其他', '儲值', '初始設定']
      });
    }

    if (action === 'getHistory') {
      const targetName = e.parameter.name || '全部';
      const category = e.parameter.category || '全部';
      const start = e.parameter.start;
      const end = e.parameter.end;
      const page = parseInt(e.parameter.page, 10) || 1;
      const pageSize = 100;
      return createJsonResponse(getHistoryData(targetName, category, start, end, page, pageSize));
    }

    return createJsonResponse({ error: 'Invalid action' }, 400);
  } catch (err) {
    return createJsonResponse({ error: err.toString() }, 500);
  }
}

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const action = data.action;
    const name = data.name_auth;
    const password = data.pass_auth;
    const operator = data.operator || name;

    if (!verifyUser(name, password)) {
      return createJsonResponse({ error: 'Unauthorized: Invalid User or Password' }, 401);
    }

    if (action === 'recordTransaction') {
      return createJsonResponse(recordTransactions(data.records || [], operator));
    }

    if (action === 'deposit') {
      return createJsonResponse(recordDeposit(data.record, operator));
    }


    if (action === 'deleteTransaction') {
      return createJsonResponse(deleteTransaction(data.id));
    }

    if (action === 'editTransaction') {
      return createJsonResponse(editTransaction(data.id, data.newAmount, data.newNote));
    }

    if (action === 'recalculateBalances') {
      return createJsonResponse(recalculateBalances());
    }

    return createJsonResponse({ error: 'Invalid action' }, 400);
  } catch (err) {
    return createJsonResponse({ error: err.toString() }, 500);
  }
}

function verifyUser(name, password) {
  if (!name || !password) return false;
  const config = CONFIG_SHEET.getDataRange().getValues();
  const targetKey = 'OPERATOR_' + name;
  for (let i = 0; i < config.length; i++) {
    if (config[i][0] === targetKey && config[i][1].toString() === password.toString()) {
      return true;
    }
  }
  return false;
}

function getUsersData() {
  const data = USERS_SHEET.getDataRange().getValues();
  const headers = data[0].map(h => h.toString().trim());
  const nameIdx = headers.indexOf('Name') === -1 ? 0 : headers.indexOf('Name');
  const balanceIdx = headers.indexOf('Balance') === -1 ? 1 : headers.indexOf('Balance');
  const activeHeaderIdx = headers.indexOf('IsActive');
  const activeIdx = activeHeaderIdx === -1 ? 2 : activeHeaderIdx;
  const results = [];

  for (let i = 1; i < data.length; i++) {
    const isActive = data[i][activeIdx];
    if (activeHeaderIdx === -1 || isActive === true || isActive === 'TRUE' || isActive === 'true') {
      results.push({
        name: data[i][nameIdx] || '未命名',
        balance: parseFloat(data[i][balanceIdx]) || 0
      });
    }
  }

  return results;
}

function getHistoryData(name, category, start, end, page, pageSize) {
  const data = LOG_SHEET.getDataRange().getValues();
  const filteredData = [];
  const summary = {};
  const startDate = parseDateFilter(start, false);
  const endDate = parseDateFilter(end, true);

  for (let i = data.length - 1; i >= 1; i--) {
    const rowDate = new Date(data[i][1]);
    const rowName = data[i][2];
    const rowType = data[i][3];
    const rowCategory = data[i][4];
    const rowAmount = parseFloat(data[i][5]) || 0;
    const nameMatch = name === '全部' || rowName === name;
    const categoryMatch = category === '全部' || rowCategory === category;
    const dateMatch = (!startDate || rowDate >= startDate) && (!endDate || rowDate <= endDate);

    if (nameMatch && categoryMatch && dateMatch) {
      filteredData.push({
        id: data[i][0],
        timestamp: Utilities.formatDate(rowDate, 'GMT+8', 'yyyy-MM-dd HH:mm'),
        name: rowName,
        type: rowType,
        category: rowCategory,
        amount: rowAmount,
        note: data[i][6] || ''
      });

      if (!summary[rowCategory]) summary[rowCategory] = 0;
      summary[rowCategory] += rowAmount;
    }
  }

  const startIdx = (page - 1) * pageSize;
  const endIdx = startIdx + pageSize;

  return {
    data: filteredData.slice(startIdx, endIdx),
    summary,
    total: filteredData.length,
    currentPage: page,
    hasMore: filteredData.length > endIdx
  };
}

function parseDateFilter(value, isEndOfDay) {
  if (!value) return null;

  const parts = value.split('-').map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) {
    const parsed = new Date(value);
    if (isNaN(parsed.getTime())) return null;
    if (isEndOfDay) parsed.setHours(23, 59, 59, 999);
    else parsed.setHours(0, 0, 0, 0);
    return parsed;
  }

  return isEndOfDay
    ? new Date(parts[0], parts[1] - 1, parts[2], 23, 59, 59, 999)
    : new Date(parts[0], parts[1] - 1, parts[2], 0, 0, 0, 0);
}

function recordTransactions(records, operator) {
  const timestamp = new Date();
  const rows = records
    .map(r => {
      const amount = parseFloat(r.amount);
      if (!r.name || isNaN(amount)) return null;

      return [
        Utilities.getUuid(),
        timestamp,
        r.name,
        '支出',
        r.category,
        -Math.abs(amount),
        r.note || '',
        operator || ''
      ];
    })
    .filter(Boolean);

  if (rows.length === 0) {
    return { success: false, error: '沒有可寫入的資料' };
  }

  LOG_SHEET.getRange(LOG_SHEET.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
  rows.forEach(row => updateUserBalance(row[2], row[5]));

  return { success: true, count: rows.length };
}

function recordDeposit(r, operator) {
  if (!r || !r.name) {
    return { success: false, error: '缺少人員' };
  }

  const amount = parseFloat(r.amount);
  if (isNaN(amount) || amount === 0) {
    return { success: false, error: '金額不正確或為0' };
  }

  const type = r.type || (amount > 0 ? '儲值' : '支出');
  const category = r.category || (amount > 0 ? '儲值' : '其他');

  LOG_SHEET.appendRow([
    Utilities.getUuid(),
    new Date(),
    r.name,
    type,
    category,
    amount,
    r.note || '',
    operator || ''
  ]);

  updateUserBalance(r.name, amount);
  return { success: true };
}


function deleteTransaction(id) {
  const data = LOG_SHEET.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === id) {
      const name = data[i][2];
      const amount = parseFloat(data[i][5]) || 0;
      updateUserBalance(name, -amount);
      LOG_SHEET.deleteRow(i + 1);
      return { success: true };
    }
  }

  return { success: false, error: '找不到這筆記錄' };
}

function editTransaction(id, newAmount, newNote) {
  const data = LOG_SHEET.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === id) {
      const name = data[i][2];
      const type = data[i][3];
      const oldAmount = parseFloat(data[i][5]) || 0;
      const amountInput = parseFloat(newAmount);

      if (isNaN(amountInput)) {
        return { success: false, error: '金額不正確' };
      }

      const normalizedAmount = (type === '支出' || oldAmount < 0)
        ? -Math.abs(amountInput)
        : Math.abs(amountInput);
      const diff = normalizedAmount - oldAmount;

      updateUserBalance(name, diff);
      LOG_SHEET.getRange(i + 1, 6).setValue(normalizedAmount);
      LOG_SHEET.getRange(i + 1, 7).setValue(newNote || '');
      return { success: true };
    }
  }

  return { success: false, error: '找不到這筆記錄' };
}

function updateUserBalance(name, delta) {
  const data = USERS_SHEET.getDataRange().getValues();
  const headers = data[0].map(h => h.toString().trim());
  const nameIdx = headers.indexOf('Name') === -1 ? 0 : headers.indexOf('Name');
  const balanceIdx = headers.indexOf('Balance') === -1 ? 1 : headers.indexOf('Balance');

  for (let i = 1; i < data.length; i++) {
    if (data[i][nameIdx] === name) {
      const current = parseFloat(data[i][balanceIdx]) || 0;
      USERS_SHEET.getRange(i + 1, balanceIdx + 1).setValue(current + (parseFloat(delta) || 0));
      return true;
    }
  }

  throw new Error('找不到人員：' + name);
}

function recalculateBalances() {
  const userData = USERS_SHEET.getDataRange().getValues();
  const logData = LOG_SHEET.getDataRange().getValues();
  const userHeaders = userData[0].map(h => h.toString().trim());
  const userNameIdx = userHeaders.indexOf('Name') === -1 ? 0 : userHeaders.indexOf('Name');
  const userBalanceIdx = userHeaders.indexOf('Balance') === -1 ? 1 : userHeaders.indexOf('Balance');
  const balanceByName = {};

  for (let i = 1; i < logData.length; i++) {
    const name = logData[i][2];
    const amount = parseFloat(logData[i][5]) || 0;
    if (!name) continue;
    if (!balanceByName[name]) balanceByName[name] = 0;
    balanceByName[name] += amount;
  }

  const values = [];
  for (let i = 1; i < userData.length; i++) {
    const name = userData[i][userNameIdx];
    values.push([balanceByName[name] || 0]);
  }

  if (values.length > 0) {
    USERS_SHEET.getRange(2, userBalanceIdx + 1, values.length, 1).setValues(values);
  }

  return {
    success: true,
    updated: values.length,
    users: getUsersData()
  };
}

function createJsonResponse(data, status = 200) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
