/**
 * 診所庫存管理系統 - 前端邏輯
 */

// --- 請填入您的資訊 ---
const API_URL = 'https://script.google.com/macros/s/AKfycbz4V4ks7Pw3TB6ZCRtBd51naR0dZdGoP8h9RmzHOsJBwSrcjOz6neYi_iVM-E37OoTK5Q/exec';
// --------------------

let currentUser = null;
let logoutTimer = null;
let items = [];
let doctors = [];
let itemById = {};
let doctorById = {};
let doctorNameToId = {};

let historyPage = 1;
let historyItemById = {};
let historyRequestSeq = 0;

let dailyCheckItems = []; // 目前載入的盤點清單（含既有記錄）
let sortableInstances = []; // 品項管理頁的拖曳排序實例，重繪前需先銷毀

/**
 * 依 category 將已排序好的品項陣列分組（保留原陣列順序，不重新排序）
 */
function groupByCategory(list) {
    const groups = {};
    const order = [];
    list.forEach(item => {
        const cat = item.category || '未分類';
        if (!groups[cat]) { groups[cat] = []; order.push(cat); }
        groups[cat].push(item);
    });
    return { order, groups };
}

/**
 * 品項顯示名稱：分類 + 品項名稱（查不到品項時 fallback 回傳原始 ID 或提供的名稱）
 */
function itemDisplayName(itemId, fallbackName) {
    const item = itemById[itemId];
    if (item) {
        return item.category ? `${item.category} - ${item.itemName}` : item.itemName;
    }
    return fallbackName || itemId;
}

function formatQty(value) {
    const amount = Number(value) || 0;
    return amount.toLocaleString('zh-TW', { maximumFractionDigits: 2 });
}

function startLogoutTimer() {
    if (logoutTimer) clearTimeout(logoutTimer);
    logoutTimer = setTimeout(() => { logout(); }, 30 * 60 * 1000); // 30 分鐘
}

function logout() {
    sessionStorage.removeItem('user');
    location.reload();
}

function todayStr() {
    const d = new Date();
    return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`;
}

/**
 * 登入驗證
 */
async function authenticate() {
    const btn = document.getElementById('auth-btn');
    btn.innerHTML = '<span class="animate-pulse">進入系統中...</span>';
    btn.disabled = true;

    const name = document.getElementById('auth-name').value;
    const pass = document.getElementById('auth-pass').value;

    if (!name || !pass) {
        alert('請輸入姓名與密碼');
        btn.innerHTML = '進入系統';
        btn.disabled = false;
        return;
    }

    currentUser = { name, pass };
    const success = await initData();
    if (success) {
        sessionStorage.setItem('user', JSON.stringify(currentUser));
        document.getElementById('user-display').innerText = `使用者: ${name}`;
        document.getElementById('auth-overlay').classList.add('hidden');
        document.getElementById('app').classList.remove('hidden');
        startLogoutTimer();
    } else {
        currentUser = null;
        btn.innerHTML = '進入系統';
        btn.disabled = false;
        alert('登入失敗，請檢查姓名與密碼');
    }
}

/**
 * 顯示 Toast 通知
 */
function showToast(message) {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerText = message;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

/**
 * 初始化資料
 */
async function initData() {
    showLoading(true, '載入中...');
    try {
        const response = await fetch(`${API_URL}?action=init&name_auth=${encodeURIComponent(currentUser.name)}&pass_auth=${encodeURIComponent(currentUser.pass)}`);
        const data = await response.json();
        if (data.error) return false;

        items = data.items || [];
        doctors = data.doctors || [];

        itemById = {};
        items.forEach(i => { itemById[i.itemId] = i; });

        doctorById = {};
        doctorNameToId = {};
        doctors.forEach(d => { doctorById[d.doctorId] = d; doctorNameToId[d.doctorName] = d.doctorId; });

        renderDashboard();
        renderDoctorDatalist();
        renderCategoryDatalist();
        renderItemSelectionLists();
        renderHistoryFilters();
        renderItemsManageList();
        renderDoctorsManageList();

        return true;
    } catch (err) {
        console.error(err);
        return false;
    } finally {
        showLoading(false);
    }
}

function switchTab(tab) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
    document.getElementById(`section-${tab}`).classList.remove('hidden');

    document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active', 'bg-amber-500', 'bg-emerald-500', 'bg-rose-500', 'text-white'));
    const activeBtn = document.getElementById(`tab-${tab}`);
    if (activeBtn) {
        const activeColor = tab === 'stockin' ? 'bg-emerald-500' : (tab === 'stockout' ? 'bg-rose-500' : 'bg-amber-500');
        activeBtn.classList.add('active', activeColor, 'text-white');
    }

    document.querySelectorAll('[id^="mobile-tab-"]').forEach(el => el.classList.remove('bg-amber-100', 'bg-emerald-100', 'bg-rose-100', 'font-bold'));
    const mobileBtn = document.getElementById(`mobile-tab-${tab}`);
    if (mobileBtn) {
        const mobileColor = tab === 'stockin' ? 'bg-emerald-100' : (tab === 'stockout' ? 'bg-rose-100' : 'bg-amber-100');
        mobileBtn.classList.add(mobileColor, 'font-bold');
    }

    const mobileMenu = document.getElementById('mobile-menu');
    if (mobileMenu) mobileMenu.classList.add('hidden');

    if (tab === 'dailycheck' && !document.getElementById('dailycheck-date').value) {
        document.getElementById('dailycheck-date').value = todayStr();
    }
}

// ══════════════════════════════════════════════════════
//  總覽 (Dashboard)
// ══════════════════════════════════════════════════════

function renderDashboard() {
    const container = document.getElementById('dashboard-categories');
    container.innerHTML = '';

    const byCategory = {};
    items.filter(item => item.isActive).forEach(item => {
        const cat = item.category || '未分類';
        if (!byCategory[cat]) byCategory[cat] = [];
        byCategory[cat].push(item);
    });

    Object.keys(byCategory).sort((a, b) => a.localeCompare(b, 'zh-Hant')).forEach(cat => {
        const section = document.createElement('div');
        const cardsHtml = byCategory[cat].map(item => {
            const isLow = item.currentQty <= 0;
            return `
                <div class="bg-white p-3 rounded-lg shadow user-card ${isLow ? 'border-2 border-red-300' : ''}">
                    <div class="font-bold text-sm">${item.itemName}</div>
                    <div class="text-right mt-2 ${isLow ? 'balance-negative' : 'text-emerald-700 font-bold'}">
                        ${formatQty(item.currentQty)} <span class="text-xs text-gray-400">${item.unit || ''}</span>
                    </div>
                </div>
            `;
        }).join('');

        section.innerHTML = `
            <h3 class="text-lg font-bold text-gray-700 mb-2">${cat}</h3>
            <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">${cardsHtml}</div>
        `;
        container.appendChild(section);
    });

    if (items.length === 0) {
        container.innerHTML = '<div class="text-gray-500 text-center py-8">尚無品項，請先至「品項管理」新增品項</div>';
    }
}

async function recalculateQuantities() {
    if (!confirm('確定要從進出記錄重新計算所有品項庫存嗎？這會覆寫 Items 分頁的 CurrentQty 欄。')) return;
    showLoading(true, '重新計算庫存中...');
    try {
        const res = await fetch(API_URL, {
            method: 'POST',
            body: JSON.stringify({ action: 'recalculateQuantities', name_auth: currentUser.name, pass_auth: currentUser.pass })
        });
        const result = await res.json();
        if (result.success) {
            items = result.items || items;
            itemById = {};
            items.forEach(i => { itemById[i.itemId] = i; });
            renderDashboard();
            showToast(`庫存已重新計算，共更新 ${result.updated || 0} 個品項`);
        } else {
            showToast('重新計算失敗：' + result.error);
        }
    } catch (err) {
        showToast('網路錯誤，請稍後再試');
    } finally {
        showLoading(false);
    }
}

// ══════════════════════════════════════════════════════
//  共用：醫師 datalist / 篩選下拉
// ══════════════════════════════════════════════════════

function renderDoctorDatalist() {
    const dl = document.getElementById('doctor-datalist');
    if (!dl) return;
    dl.innerHTML = doctors.filter(d => d.isActive).map(d => `<option value="${d.doctorName}">`).join('');
}

function renderCategoryDatalist() {
    const dl = document.getElementById('category-datalist');
    if (!dl) return;
    const categories = [...new Set(items.map(i => i.category).filter(Boolean))];
    dl.innerHTML = categories.map(c => `<option value="${c}">`).join('');
}

function renderHistoryFilters() {
    const itemSelect = document.getElementById('history-item');
    const doctorSelect = document.getElementById('history-doctor');

    if (itemSelect) {
        const { order, groups } = groupByCategory(items);
        itemSelect.innerHTML = '<option value="全部">全部品項</option>' +
            order.map(cat => `
                <optgroup label="${cat}">
                    <option value="CAT:${cat}">整個分類：${cat}</option>
                    ${groups[cat].map(i => `<option value="${i.itemId}">${i.itemName}</option>`).join('')}
                </optgroup>
            `).join('');
    }
    if (doctorSelect) {
        doctorSelect.innerHTML = '<option value="全部">全部醫師</option>' +
            doctors.map(d => `<option value="${d.doctorId}">${d.doctorName}</option>`).join('');
    }
}

// ══════════════════════════════════════════════════════
//  進貨 / 領用（共用批次流程）
// ══════════════════════════════════════════════════════

function activeItemsSorted() {
    return items.filter(i => i.isActive);
}

function renderItemSelectionLists() {
    ['stockin', 'stockout'].forEach(prefix => {
        const container = document.getElementById(`${prefix}-item-list`);
        if (!container) return;

        const { order, groups } = groupByCategory(activeItemsSorted());
        container.innerHTML = order.map(cat => `
            <div class="col-span-full text-sm font-bold text-gray-500 border-b pb-1 mb-1 mt-3 first:mt-0">${cat}</div>
            ${groups[cat].map(item => `
                <label class="flex items-center space-x-2 p-2 hover:bg-gray-50 rounded cursor-pointer border">
                    <input type="checkbox" class="item-checkbox-${prefix} h-5 w-5" value="${item.itemId}">
                    <span class="text-sm">${item.itemName} <span class="text-gray-400">(${formatQty(item.currentQty)} ${item.unit || ''})</span></span>
                </label>
            `).join('')}
        `).join('');
    });
}

function selectAllItems(prefix, checked) {
    document.querySelectorAll(`.item-checkbox-${prefix}`).forEach(cb => cb.checked = checked);
}

function toStockStep2(prefix) {
    const selected = Array.from(document.querySelectorAll(`.item-checkbox-${prefix}:checked`)).map(cb => cb.value);
    if (selected.length === 0) return alert('請至少選擇一個品項');

    const listContainer = document.getElementById(`${prefix}-input-list`);
    const isStockOut = prefix === 'stockout';
    const accentText = isStockOut ? 'text-rose-800' : 'text-emerald-800';
    const accentBorder = isStockOut ? 'border-rose-300' : 'border-emerald-300';

    listContainer.innerHTML = selected.map(itemId => {
        const item = itemById[itemId];
        const doctorField = (isStockOut && item.requireDoctor) ? `
            <div class="mt-2">
                <label class="block text-xs text-gray-500 mb-1">領用醫師</label>
                <input type="text" list="doctor-datalist" class="row-doctor w-full border rounded p-2 text-sm" data-item-id="${itemId}" placeholder="輸入姓名搜尋">
            </div>
        ` : '';
        return `
            <div class="border ${accentBorder} rounded-lg p-3">
                <div class="font-bold ${accentText}">${item.itemName} <span class="text-xs text-gray-400 font-normal">目前庫存：${formatQty(item.currentQty)} ${item.unit || ''}</span></div>
                <div class="grid grid-cols-2 gap-2 mt-2">
                    <div>
                        <label class="block text-xs text-gray-500 mb-1">數量</label>
                        <input type="number" min="0" step="any" class="row-qty w-full border rounded p-2 text-sm" data-item-id="${itemId}" placeholder="數量">
                    </div>
                    <div>
                        <label class="block text-xs text-gray-500 mb-1">備註</label>
                        <input type="text" class="row-note w-full border rounded p-2 text-sm" data-item-id="${itemId}" placeholder="可不填">
                    </div>
                </div>
                ${doctorField}
            </div>
        `;
    }).join('');

    document.getElementById(`${prefix}-step-1`).classList.add('hidden');
    document.getElementById(`${prefix}-step-2`).classList.remove('hidden');
}

function toStockStep1(prefix) {
    document.getElementById(`${prefix}-step-2`).classList.add('hidden');
    document.getElementById(`${prefix}-step-1`).classList.remove('hidden');
    document.getElementById(`${prefix}-input-list`).innerHTML = '';
}

async function submitStock(prefix) {
    const type = prefix === 'stockin' ? '進貨' : '領用';
    const listContainer = document.getElementById(`${prefix}-input-list`);
    const qtyInputs = listContainer.querySelectorAll('.row-qty');

    const records = [];
    let isValid = true;

    qtyInputs.forEach(input => {
        const itemId = input.dataset.itemId;
        const qty = parseFloat(input.value);
        if (isNaN(qty) || qty <= 0) { isValid = false; return; }

        const noteInput = listContainer.querySelector(`.row-note[data-item-id="${itemId}"]`);
        const record = { itemId, qty, note: noteInput ? noteInput.value : '' };

        if (prefix === 'stockout' && itemById[itemId].requireDoctor) {
            const doctorInput = listContainer.querySelector(`.row-doctor[data-item-id="${itemId}"]`);
            const doctorName = doctorInput ? doctorInput.value.trim() : '';
            const doctorId = doctorNameToId[doctorName];
            if (!doctorId) { isValid = false; return; }
            record.doctorId = doctorId;
        }

        records.push(record);
    });

    if (!isValid || records.length === 0) {
        return alert('請確認所有數量已正確填寫（需大於 0），且需要醫師的品項已從清單選取有效醫師');
    }

    showLoading(true, '提交中...');
    try {
        const res = await fetch(API_URL, {
            method: 'POST',
            body: JSON.stringify({
                action: prefix === 'stockin' ? 'recordStockIn' : 'recordStockOut',
                name_auth: currentUser.name,
                pass_auth: currentUser.pass,
                operator: currentUser.name,
                records: records
            })
        });
        const result = await res.json();
        if (result.success) {
            showToast(`${type}提交成功！`);
            await initData();
            toStockStep1(prefix);
            switchTab('dashboard');
            startLogoutTimer();
        } else if (result.insufficient) {
            const lines = result.insufficient.map(i => `${i.itemName}：庫存 ${formatQty(i.available)}，需要 ${formatQty(i.requested)}`).join('\n');
            showToast(result.error);
            alert('以下品項庫存不足，請先登記進貨：\n' + lines);
        } else {
            showToast(`${type}提交失敗：` + result.error);
        }
    } catch (err) {
        showToast('網路錯誤，請稍後再試');
    } finally {
        showLoading(false);
    }
}

// ══════════════════════════════════════════════════════
//  每日盤點
// ══════════════════════════════════════════════════════

async function loadDailyCheck() {
    const date = document.getElementById('dailycheck-date').value;
    if (!date) return alert('請選擇日期');

    showLoading(true, '載入盤點表中...');
    try {
        const url = `${API_URL}?action=getDailyCheck&date=${date}&name_auth=${encodeURIComponent(currentUser.name)}&pass_auth=${encodeURIComponent(currentUser.pass)}`;
        const res = await fetch(url);
        const result = await res.json();
        if (result.error) { showToast('載入失敗：' + result.error); return; }

        dailyCheckItems = result.items || [];
        renderDailyCheckList();
        document.getElementById('btn-submit-dailycheck').classList.remove('hidden');
    } catch (err) {
        showToast('網路錯誤');
    } finally {
        showLoading(false);
    }
}

function renderDailyCheckList() {
    const container = document.getElementById('dailycheck-list');
    const { order, groups } = groupByCategory(dailyCheckItems);
    container.innerHTML = order.map(cat => `
        <div class="mt-4 first:mt-0">
            <div class="text-sm font-bold text-gray-500 border-b pb-1 mb-2">${cat}</div>
            <div class="space-y-2">${groups[cat].map(dailyCheckRowHtml).join('')}</div>
        </div>
    `).join('');
}

function dailyCheckRowHtml(item) {
    const checked = item.checked;
    const isCorrect = checked ? checked.isCorrect : true;
    const note = checked ? checked.note : '';
    const actualQty = checked && checked.actualQty != null ? checked.actualQty : '';
    const checkedInfo = checked ? `<div class="text-xs text-gray-400 mt-1">上次由 ${checked.checkedBy} 於 ${checked.timestamp} 更新</div>` : '';

    return `
        <div class="bg-white p-3 rounded-lg shadow dc-row" data-item-id="${item.itemId}">
            <div class="flex justify-between items-center">
                <div>
                    <div class="font-bold">${item.itemName} <span class="text-xs text-gray-400">(系統：${formatQty(item.currentQty)} ${item.unit || ''})</span></div>
                    ${checkedInfo}
                </div>
                <label class="flex items-center space-x-1">
                    <input type="checkbox" class="dc-correct h-5 w-5" ${isCorrect ? 'checked' : ''} onchange="toggleDcCorrect(this)">
                    <span class="text-sm">正確</span>
                </label>
            </div>
            <div class="dc-detail grid grid-cols-2 gap-2 mt-2 ${isCorrect ? 'hidden' : ''}">
                <div>
                    <label class="block text-xs text-gray-500 mb-1">實際盤點數量</label>
                    <input type="number" step="any" class="dc-actual w-full border rounded p-2 text-sm" value="${actualQty}">
                </div>
                <div>
                    <label class="block text-xs text-gray-500 mb-1">備註</label>
                    <input type="text" class="dc-note w-full border rounded p-2 text-sm" value="${note}">
                </div>
            </div>
        </div>
    `;
}

function toggleDcCorrect(checkbox) {
    const detail = checkbox.closest('.dc-row').querySelector('.dc-detail');
    detail.classList.toggle('hidden', checkbox.checked);
}

async function submitDailyCheck() {
    const date = document.getElementById('dailycheck-date').value;
    if (!date) return alert('請選擇日期');

    const entries = [];
    document.querySelectorAll('.dc-row').forEach(row => {
        const itemId = row.dataset.itemId;
        const isCorrect = row.querySelector('.dc-correct').checked;
        const actualQtyInput = row.querySelector('.dc-actual');
        const noteInput = row.querySelector('.dc-note');
        entries.push({
            itemId,
            isCorrect,
            actualQty: (!isCorrect && actualQtyInput.value !== '') ? parseFloat(actualQtyInput.value) : null,
            note: noteInput ? noteInput.value : ''
        });
    });

    showLoading(true, '送出盤點結果中...');
    try {
        const res = await fetch(API_URL, {
            method: 'POST',
            body: JSON.stringify({
                action: 'submitDailyCheck',
                name_auth: currentUser.name,
                pass_auth: currentUser.pass,
                operator: currentUser.name,
                date,
                entries
            })
        });
        const result = await res.json();
        if (result.success) {
            showToast(`盤點已送出（新增 ${result.created}，更新 ${result.updated}）`);
            await loadDailyCheck();
            startLogoutTimer();
        } else {
            showToast('送出失敗：' + result.error);
        }
    } catch (err) {
        showToast('網路錯誤');
    } finally {
        showLoading(false);
    }
}

// ══════════════════════════════════════════════════════
//  記錄查詢
// ══════════════════════════════════════════════════════

async function queryHistory() {
    historyPage = 1;
    await fetchHistory();
}

async function loadMoreHistory() {
    historyPage++;
    fetchHistory();
}

async function fetchHistory() {
    const requestSeq = ++historyRequestSeq;
    showLoading(true, '查詢中...');
    const itemId = document.getElementById('history-item').value || '全部';
    const type = document.getElementById('history-type').value || '全部';
    const doctorId = document.getElementById('history-doctor').value || '全部';
    const start = document.getElementById('history-date-start').value;
    const end = document.getElementById('history-date-end').value;

    try {
        const url = `${API_URL}?action=getTransactions&itemId=${encodeURIComponent(itemId)}&type=${encodeURIComponent(type)}&doctorId=${encodeURIComponent(doctorId)}&start=${start}&end=${end}&page=${historyPage}&name_auth=${encodeURIComponent(currentUser.name)}&pass_auth=${encodeURIComponent(currentUser.pass)}`;
        const res = await fetch(url);
        const result = await res.json();

        if (requestSeq !== historyRequestSeq) return;

        if (historyPage === 1) {
            document.getElementById('history-table-body').innerHTML = '';
            const mobileList = document.getElementById('history-list-mobile');
            if (mobileList) mobileList.innerHTML = '';
            Object.keys(historyItemById).forEach(id => delete historyItemById[id]);
        }

        renderHistory(result.data || []);
        renderHistorySummary(result.summary);
        const pagination = document.getElementById('history-pagination');
        if (result.hasMore) pagination.classList.remove('hidden');
        else pagination.classList.add('hidden');
    } catch (err) {
        showToast('查詢失敗');
    } finally {
        showLoading(false);
    }
}

async function refreshHistory() {
    historyPage = 1;
    document.getElementById('history-table-body').innerHTML = '';
    const mobileList = document.getElementById('history-list-mobile');
    if (mobileList) mobileList.innerHTML = '';
    await fetchHistory();
}

function renderHistory(data) {
    const tbody = document.getElementById('history-table-body');
    const mobileList = document.getElementById('history-list-mobile');

    data.forEach(item => {
        historyItemById[item.id] = item;
        const itemName = itemDisplayName(item.itemId, item.itemId);
        const doctorName = item.doctorId && doctorById[item.doctorId] ? doctorById[item.doctorId].doctorName : '';
        const typeClass = item.type === '領用' ? 'text-rose-600 font-bold' : 'text-emerald-600 font-bold';

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="px-4 py-2">${item.timestamp}</td>
            <td class="px-4 py-2">${itemName}</td>
            <td class="px-4 py-2 ${typeClass}">${item.type}</td>
            <td class="px-4 py-2">${formatQty(Math.abs(item.qty))}</td>
            <td class="px-4 py-2">${doctorName}</td>
            <td class="px-4 py-2">${item.note || ''}</td>
            <td class="px-4 py-2 text-gray-500">${item.operator || ''}</td>
            <td class="px-4 py-2 space-x-2">
                <button onclick="openEditModal('${item.id}')" class="inline-flex h-8 w-8 items-center justify-center rounded hover:bg-blue-50 text-gray-500" title="修改">
                    <i class="fa-solid fa-pen-to-square"></i>
                </button>
                <button onclick="deleteHistory('${item.id}')" class="inline-flex h-8 w-8 items-center justify-center rounded hover:bg-red-50 text-gray-500" title="刪除">
                    <i class="fa-solid fa-trash"></i>
                </button>
            </td>
        `;
        tbody.appendChild(tr);

        if (mobileList) {
            const div = document.createElement('div');
            div.className = 'p-3 space-y-1';
            div.innerHTML = `
                <div class="flex justify-between items-start">
                    <span class="font-bold text-gray-800">${itemName}</span>
                    <span class="${typeClass}">${item.type} ${formatQty(Math.abs(item.qty))}</span>
                </div>
                <div class="flex justify-between text-xs text-gray-500">
                    <span>${doctorName}${item.note ? ' · ' + item.note : ''}</span>
                    <span>${item.timestamp}</span>
                </div>
                <div class="text-xs text-gray-400">操作人: ${item.operator || ''}</div>
                <div class="flex justify-end space-x-4 pt-1 border-t mt-1 text-sm">
                    <button onclick="openEditModal('${item.id}')" class="inline-flex h-8 w-8 items-center justify-center rounded text-gray-500" title="修改">
                        <i class="fa-solid fa-pen-to-square"></i>
                    </button>
                    <button onclick="deleteHistory('${item.id}')" class="inline-flex h-8 w-8 items-center justify-center rounded text-gray-500" title="刪除">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </div>
            `;
            mobileList.appendChild(div);
        }
    });
}

function renderHistorySummary(summary) {
    const container = document.getElementById('history-summary');
    if (!summary || summary.totalRecords === 0) {
        container.classList.add('hidden');
        return;
    }

    container.classList.remove('hidden');
    document.getElementById('history-summary-total').innerText = summary.totalRecords;
    document.getElementById('history-summary-in').innerText = formatQty(summary.totalStockIn);
    document.getElementById('history-summary-out').innerText = formatQty(summary.totalStockOut);

    const itemsContainer = document.getElementById('history-summary-items');
    itemsContainer.innerHTML = summary.items.map(it => `
        <div class="bg-gray-50 p-2 rounded text-center border">
            <div class="text-xs text-gray-500">${itemDisplayName(it.itemId, it.itemName)}</div>
            <div class="font-bold text-gray-800">進 <span class="text-stockin">${formatQty(it.stockIn)}</span> / 領 <span class="text-stockout">${formatQty(it.stockOut)}</span></div>
        </div>
    `).join('');
}

function openEditModal(id) {
    const item = historyItemById[id];
    if (!item) { showToast('找不到這筆記錄，請重新整理後再試'); return; }

    const itemName = itemDisplayName(item.itemId, item.itemId);
    document.getElementById('edit-id').value = item.id;
    document.getElementById('edit-item-type-display').innerText = `${itemName}（${item.type}）`;

    setText('edit-time-text', item.timestamp);
    const datePart = item.timestamp ? item.timestamp.substring(0, 10) : '';
    document.getElementById('edit-date').value = datePart;

    document.getElementById('edit-qty').value = Math.abs(item.qty);
    document.getElementById('edit-note').value = item.note || '';

    const doctorWrap = document.getElementById('edit-doctor-wrap');
    const canHaveDoctor = item.type === '領用' && itemById[item.itemId] && itemById[item.itemId].requireDoctor;
    if (canHaveDoctor) {
        doctorWrap.classList.remove('hidden');
        document.getElementById('edit-doctor').value = item.doctorId && doctorById[item.doctorId] ? doctorById[item.doctorId].doctorName : '';
    } else {
        doctorWrap.classList.add('hidden');
        document.getElementById('edit-doctor').value = '';
    }

    document.getElementById('edit-modal').classList.remove('hidden');
}

function closeEditModal() {
    document.getElementById('edit-modal').classList.add('hidden');
}

async function submitEdit() {
    const id = document.getElementById('edit-id').value;
    const item = historyItemById[id];
    const newDate = document.getElementById('edit-date').value;
    const newQty = parseFloat(document.getElementById('edit-qty').value);
    const newNote = document.getElementById('edit-note').value;

    if (!newDate) return alert('請選擇日期');
    if (isNaN(newQty) || newQty <= 0) return alert('請輸入有效的數量（需大於 0）');

    const newData = { date: newDate, qty: newQty, note: newNote };

    const doctorWrap = document.getElementById('edit-doctor-wrap');
    if (!doctorWrap.classList.contains('hidden')) {
        const doctorName = document.getElementById('edit-doctor').value.trim();
        const doctorId = doctorNameToId[doctorName];
        if (!doctorId) return alert('請從清單選取有效的醫師');
        newData.doctorId = doctorId;
    }

    showLoading(true, '儲存修改中...');
    try {
        const res = await fetch(API_URL, {
            method: 'POST',
            body: JSON.stringify({
                action: 'editTransaction',
                name_auth: currentUser.name,
                pass_auth: currentUser.pass,
                operator: currentUser.name,
                id,
                newData
            })
        });
        const result = await res.json();
        if (result.success) {
            showToast('修改成功');
            closeEditModal();
            await refreshHistory();
            await initData();
            startLogoutTimer();
        } else {
            showToast('修改失敗：' + result.error);
        }
    } catch (err) {
        showToast('網路錯誤');
    } finally {
        showLoading(false);
    }
}

async function deleteHistory(id) {
    if (!confirm('確定要刪除這筆記錄嗎？\n\n刪除後將從主記錄移除，但完整內容會保留在 EditLog 工作表中可供查詢。')) return;

    showLoading(true, '刪除中...');
    try {
        const res = await fetch(API_URL, {
            method: 'POST',
            body: JSON.stringify({
                action: 'deleteTransaction',
                name_auth: currentUser.name,
                pass_auth: currentUser.pass,
                operator: currentUser.name,
                id
            })
        });
        const result = await res.json();
        if (result.success) {
            showToast('刪除成功');
            await refreshHistory();
            await initData();
            startLogoutTimer();
        } else {
            showToast('刪除失敗：' + result.error);
        }
    } catch (err) {
        showToast('網路錯誤');
    } finally {
        showLoading(false);
    }
}

// ══════════════════════════════════════════════════════
//  統計
// ══════════════════════════════════════════════════════

async function queryStats() {
    const start = document.getElementById('stats-date-start').value;
    const end = document.getElementById('stats-date-end').value;

    showLoading(true, '查詢統計中...');
    try {
        const [itemRes, doctorRes] = await Promise.all([
            fetch(`${API_URL}?action=getItemStats&start=${start}&end=${end}&name_auth=${encodeURIComponent(currentUser.name)}&pass_auth=${encodeURIComponent(currentUser.pass)}`),
            fetch(`${API_URL}?action=getDoctorStats&start=${start}&end=${end}&name_auth=${encodeURIComponent(currentUser.name)}&pass_auth=${encodeURIComponent(currentUser.pass)}`)
        ]);
        const itemResult = await itemRes.json();
        const doctorResult = await doctorRes.json();

        renderItemStats(itemResult.items || []);
        renderDoctorStats(doctorResult.doctors || []);
    } catch (err) {
        showToast('查詢失敗');
    } finally {
        showLoading(false);
    }
}

function renderItemStats(list) {
    const tbody = document.getElementById('stats-item-table-body');
    if (list.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="px-4 py-4 text-center text-gray-400">查無資料</td></tr>`;
        return;
    }

    const { order, groups } = groupByCategory(list);
    tbody.innerHTML = order.map(cat => `
        <tr><td colspan="5" class="bg-gray-50 px-4 py-1 font-bold text-gray-600 text-xs">${cat}</td></tr>
        ${groups[cat].map(i => `
            <tr>
                <td class="px-4 py-2">${i.itemName}</td>
                <td class="px-4 py-2 text-gray-400 text-xs">${i.unit || ''}</td>
                <td class="px-4 py-2 text-right text-emerald-600">${formatQty(i.stockIn)}</td>
                <td class="px-4 py-2 text-right text-rose-600">${formatQty(i.stockOut)}</td>
                <td class="px-4 py-2 text-right font-bold">${formatQty(i.netChange)}</td>
            </tr>
        `).join('')}
    `).join('');
}

function renderDoctorStats(list) {
    const container = document.getElementById('stats-doctor-list');
    if (list.length === 0) {
        container.innerHTML = '<div class="text-gray-400 text-center py-4 bg-white rounded-lg shadow">查無資料</div>';
        return;
    }
    container.innerHTML = list.map(d => `
        <div class="bg-white p-3 rounded-lg shadow">
            <div class="font-bold text-gray-800 flex justify-between">
                <span>${d.doctorName}</span>
                <span class="text-rose-600">共 ${formatQty(d.totalQty)}</span>
            </div>
            <div class="mt-2 text-sm text-gray-600 space-y-1">
                ${d.items.map(it => `<div class="flex justify-between"><span>${itemDisplayName(it.itemId, it.itemName)}</span><span>${formatQty(it.qty)}</span></div>`).join('')}
            </div>
        </div>
    `).join('');
}

// ══════════════════════════════════════════════════════
//  品項管理
// ══════════════════════════════════════════════════════

function renderItemsManageList() {
    const container = document.getElementById('items-manage-list');
    if (!container) return;

    sortableInstances.forEach(inst => inst.destroy());
    sortableInstances = [];

    const { order, groups } = groupByCategory(items);

    container.innerHTML = `<div id="items-manage-categories">${order.map(cat => `
        <div class="mb-4" data-category="${cat}">
            <h3 class="text-sm font-bold text-gray-500 border-b pb-1 mb-2 flex items-center gap-2">
                <i class="fa-solid fa-grip-lines drag-handle category-drag-handle text-gray-300" title="拖曳排序分類"></i>
                <span>${cat}</span>
            </h3>
            <div class="items-sort-group space-y-2" data-category="${cat}">
                ${groups[cat].map(item => `
                    <div class="bg-white p-3 rounded-lg shadow flex items-center gap-2 ${!item.isActive ? 'opacity-50' : ''}" data-item-id="${item.itemId}">
                        <i class="fa-solid fa-grip-vertical drag-handle text-gray-300 px-1" title="拖曳排序"></i>
                        <div class="flex-1">
                            <div class="font-bold">${item.itemName} <span class="text-xs text-gray-400">${item.unit || ''}</span></div>
                            <div class="text-xs text-gray-500">
                                ${item.requireDoctor ? '<span class="text-rose-600">領用需選醫師</span>' : '<span>領用免填醫師</span>'}
                                ${!item.isActive ? ' · 已停用' : ''}
                            </div>
                        </div>
                        <div class="space-x-2">
                            <button onclick="openEditItemModal('${item.itemId}')" class="inline-flex h-8 w-8 items-center justify-center rounded hover:bg-blue-50 text-gray-500" title="修改">
                                <i class="fa-solid fa-pen-to-square"></i>
                            </button>
                            <button onclick="toggleItemActive('${item.itemId}', ${!item.isActive})" class="inline-flex h-8 w-8 items-center justify-center rounded hover:bg-gray-100 text-gray-500" title="${item.isActive ? '停用' : '啟用'}">
                                <i class="fa-solid ${item.isActive ? 'fa-eye-slash' : 'fa-eye'}"></i>
                            </button>
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>
    `).join('')}</div>`;

    const categoriesContainer = document.getElementById('items-manage-categories');
    const categoriesSortable = Sortable.create(categoriesContainer, {
        handle: '.category-drag-handle',
        animation: 150,
        onEnd: function () {
            const categories = Array.from(categoriesContainer.children).map(el => el.dataset.category);
            persistCategoryOrder(categories);
        }
    });
    sortableInstances.push(categoriesSortable);

    document.querySelectorAll('.items-sort-group').forEach(group => {
        const inst = Sortable.create(group, {
            handle: '.drag-handle:not(.category-drag-handle)',
            animation: 150,
            onEnd: function () {
                const ids = Array.from(group.children).map(el => el.dataset.itemId);
                persistItemOrder(ids);
            }
        });
        sortableInstances.push(inst);
    });
}

async function persistCategoryOrder(categories) {
    try {
        const res = await fetch(API_URL, {
            method: 'POST',
            body: JSON.stringify({
                action: 'reorderCategories',
                name_auth: currentUser.name,
                pass_auth: currentUser.pass,
                operator: currentUser.name,
                categories
            })
        });
        const result = await res.json();
        if (result.success) {
            await initData();
        } else {
            showToast('分類排序儲存失敗：' + result.error);
            await initData();
        }
    } catch (err) {
        showToast('網路錯誤，分類排序可能未儲存');
        await initData();
    }
}

async function persistItemOrder(categoryItemIds) {
    try {
        const res = await fetch(API_URL, {
            method: 'POST',
            body: JSON.stringify({
                action: 'reorderItems',
                name_auth: currentUser.name,
                pass_auth: currentUser.pass,
                operator: currentUser.name,
                categoryItemIds
            })
        });
        const result = await res.json();
        if (result.success) {
            await initData();
        } else {
            showToast('排序儲存失敗：' + result.error);
            await initData(); // 還原成伺服器上的實際順序
        }
    } catch (err) {
        showToast('網路錯誤，排序可能未儲存');
        await initData();
    }
}

async function addItem() {
    const itemName = document.getElementById('new-item-name').value.trim();
    const category = document.getElementById('new-item-category').value.trim();
    const unit = document.getElementById('new-item-unit').value.trim();
    const requireDoctor = document.getElementById('new-item-require-doctor').checked;

    if (!itemName) return alert('請輸入品項名稱');

    showLoading(true, '新增中...');
    try {
        const res = await fetch(API_URL, {
            method: 'POST',
            body: JSON.stringify({
                action: 'addItem',
                name_auth: currentUser.name,
                pass_auth: currentUser.pass,
                operator: currentUser.name,
                item: { itemName, category, unit, requireDoctor }
            })
        });
        const result = await res.json();
        if (result.success) {
            showToast('新增成功');
            document.getElementById('new-item-name').value = '';
            document.getElementById('new-item-category').value = '';
            document.getElementById('new-item-unit').value = '';
            document.getElementById('new-item-require-doctor').checked = false;
            await initData();
        } else {
            showToast('新增失敗：' + result.error);
        }
    } catch (err) {
        showToast('網路錯誤');
    } finally {
        showLoading(false);
    }
}

function openEditItemModal(itemId) {
    const item = itemById[itemId];
    if (!item) return;
    document.getElementById('edit-item-id').value = item.itemId;
    document.getElementById('edit-item-name').value = item.itemName;
    document.getElementById('edit-item-category').value = item.category || '';
    document.getElementById('edit-item-unit').value = item.unit || '';
    document.getElementById('edit-item-require-doctor').checked = item.requireDoctor;
    document.getElementById('edit-item-modal').classList.remove('hidden');
}

function closeEditItemModal() {
    document.getElementById('edit-item-modal').classList.add('hidden');
}

async function submitEditItem() {
    const itemId = document.getElementById('edit-item-id').value;
    const itemName = document.getElementById('edit-item-name').value.trim();
    const category = document.getElementById('edit-item-category').value.trim();
    const unit = document.getElementById('edit-item-unit').value.trim();
    const requireDoctor = document.getElementById('edit-item-require-doctor').checked;

    if (!itemName) return alert('請輸入品項名稱');

    showLoading(true, '儲存中...');
    try {
        const res = await fetch(API_URL, {
            method: 'POST',
            body: JSON.stringify({
                action: 'editItem',
                name_auth: currentUser.name,
                pass_auth: currentUser.pass,
                operator: currentUser.name,
                itemId,
                newData: { itemName, category, unit, requireDoctor }
            })
        });
        const result = await res.json();
        if (result.success) {
            showToast('修改成功');
            closeEditItemModal();
            await initData();
        } else {
            showToast('修改失敗：' + result.error);
        }
    } catch (err) {
        showToast('網路錯誤');
    } finally {
        showLoading(false);
    }
}

async function toggleItemActive(itemId, isActive) {
    showLoading(true, '處理中...');
    try {
        const res = await fetch(API_URL, {
            method: 'POST',
            body: JSON.stringify({
                action: 'toggleItemActive',
                name_auth: currentUser.name,
                pass_auth: currentUser.pass,
                operator: currentUser.name,
                itemId,
                isActive
            })
        });
        const result = await res.json();
        if (result.success) {
            showToast(isActive ? '已啟用' : '已停用');
            await initData();
        } else {
            showToast('操作失敗：' + result.error);
        }
    } catch (err) {
        showToast('網路錯誤');
    } finally {
        showLoading(false);
    }
}

// ══════════════════════════════════════════════════════
//  醫師管理
// ══════════════════════════════════════════════════════

function renderDoctorsManageList() {
    const container = document.getElementById('doctors-manage-list');
    if (!container) return;
    container.innerHTML = doctors.map(d => `
        <div class="bg-white p-3 rounded-lg shadow flex justify-between items-center ${!d.isActive ? 'opacity-50' : ''}">
            <div class="font-bold">${d.doctorName} ${!d.isActive ? '<span class="text-xs text-gray-400 font-normal">（已停用）</span>' : ''}</div>
            <button onclick="toggleDoctorActive('${d.doctorId}', ${!d.isActive})" class="inline-flex h-8 w-8 items-center justify-center rounded hover:bg-gray-100 text-gray-500" title="${d.isActive ? '停用' : '啟用'}">
                <i class="fa-solid ${d.isActive ? 'fa-eye-slash' : 'fa-eye'}"></i>
            </button>
        </div>
    `).join('');
}

async function addDoctor() {
    const doctorName = document.getElementById('new-doctor-name').value.trim();
    if (!doctorName) return alert('請輸入醫師姓名');

    showLoading(true, '新增中...');
    try {
        const res = await fetch(API_URL, {
            method: 'POST',
            body: JSON.stringify({
                action: 'addDoctor',
                name_auth: currentUser.name,
                pass_auth: currentUser.pass,
                operator: currentUser.name,
                doctorName
            })
        });
        const result = await res.json();
        if (result.success) {
            showToast('新增成功');
            document.getElementById('new-doctor-name').value = '';
            await initData();
        } else {
            showToast('新增失敗：' + result.error);
        }
    } catch (err) {
        showToast('網路錯誤');
    } finally {
        showLoading(false);
    }
}

async function toggleDoctorActive(doctorId, isActive) {
    showLoading(true, '處理中...');
    try {
        const res = await fetch(API_URL, {
            method: 'POST',
            body: JSON.stringify({
                action: 'toggleDoctorActive',
                name_auth: currentUser.name,
                pass_auth: currentUser.pass,
                operator: currentUser.name,
                doctorId,
                isActive
            })
        });
        const result = await res.json();
        if (result.success) {
            showToast(isActive ? '已啟用' : '已停用');
            await initData();
        } else {
            showToast('操作失敗：' + result.error);
        }
    } catch (err) {
        showToast('網路錯誤');
    } finally {
        showLoading(false);
    }
}

// --- 輔助工具 ---

function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.innerText = value || '';
}

function showLoading(show, text = '處理中...') {
    const loader = document.getElementById('loading-overlay');
    const loaderText = document.getElementById('loading-text');
    if (show) {
        loaderText.innerText = text;
        loader.classList.remove('hidden');
    } else {
        loader.classList.add('hidden');
    }
}

// 啟動
window.onload = async function () {
    const savedUser = sessionStorage.getItem('user');
    if (savedUser) {
        currentUser = JSON.parse(savedUser);
        const success = await initData();
        if (success) {
            document.getElementById('user-display').innerText = `使用者: ${currentUser.name}`;
            document.getElementById('auth-overlay').classList.add('hidden');
            document.getElementById('app').classList.remove('hidden');
            startLogoutTimer();
        } else {
            sessionStorage.removeItem('user');
        }
    }

    document.getElementById('dailycheck-date').value = todayStr();
    const today = todayStr();
    document.getElementById('history-date-start').value = today;
    document.getElementById('history-date-end').value = today;
    document.getElementById('stats-date-start').value = today;
    document.getElementById('stats-date-end').value = today;

    const toggle = document.getElementById('menu-toggle');
    const menu = document.getElementById('mobile-menu');
    if (toggle && menu) {
        toggle.addEventListener('click', () => { menu.classList.toggle('hidden'); });
    }

    document.addEventListener('click', (e) => {
        if (menu && !menu.contains(e.target) && !toggle.contains(e.target)) {
            menu.classList.add('hidden');
        }
    });

    ['mousedown', 'keydown', 'touchstart'].forEach(type => {
        document.addEventListener(type, () => {
            if (currentUser) startLogoutTimer();
        });
    });
};
