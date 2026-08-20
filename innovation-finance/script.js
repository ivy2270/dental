// ══════════════════════════════════════════════════════
//  設定
// ══════════════════════════════════════════════════════

const API_URL = 'https://script.google.com/macros/s/AKfycbwmkntMjs7qSs0c2ePc0KgaBMYQwpkfmVRzeJbFtC4yh4bBH1jrA_YVZygivKSWGBFE/exec'; // TODO: 換成你的 GAS 部署網址

let authInfo = null;       // { name, pass }
let currentHistoryPage = 1;
let currentEntryType = '支出';

// ══════════════════════════════════════════════════════
//  初始化 / 登入狀態
// ══════════════════════════════════════════════════════

window.addEventListener('DOMContentLoaded', () => {
    const saved = localStorage.getItem('hexin_auth');
    if (saved) {
        try {
            authInfo = JSON.parse(saved);
            enterApp();
        } catch (e) {
            localStorage.removeItem('hexin_auth');
        }
    }

    const today = new Date();
    const weekAgo = new Date();
    weekAgo.setDate(today.getDate() - 7);
    document.getElementById('history-date-start').value = formatDateInput(weekAgo);
    document.getElementById('history-date-end').value = formatDateInput(today);
});

function formatDateInput(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

async function authenticate() {
    const name = document.getElementById('auth-name').value.trim();
    const pass = document.getElementById('auth-pass').value;
    if (!name || !pass) {
        showToast('請輸入姓名與密碼', true);
        return;
    }
    const btn = document.getElementById('auth-btn');
    btn.disabled = true;
    btn.textContent = '登入中...';

    authInfo = { name, pass };
    try {
        const res = await apiGet('init');
        if (res.error) {
            showToast(res.error, true);
            authInfo = null;
            btn.disabled = false;
            btn.textContent = '進入系統';
            return;
        }
        localStorage.setItem('hexin_auth', JSON.stringify(authInfo));
        document.getElementById('total-balance').textContent = formatMoney(res.balance);
        enterApp();
    } catch (e) {
        showToast('連線失敗：' + e.message, true);
        authInfo = null;
        btn.disabled = false;
        btn.textContent = '進入系統';
    }
}

function enterApp() {
    document.getElementById('auth-overlay').classList.add('hidden');
    document.getElementById('app').classList.remove('hidden');
    document.getElementById('user-display').textContent = '操作人：' + authInfo.name;
    loadInit();
    queryHistory();
}

function logout() {
    localStorage.removeItem('hexin_auth');
    authInfo = null;
    location.reload();
}

// ══════════════════════════════════════════════════════
//  API 呼叫
// ══════════════════════════════════════════════════════

function apiGet(action, extraParams = {}) {
    const params = new URLSearchParams({
        action,
        name_auth: authInfo.name,
        pass_auth: authInfo.pass,
        ...extraParams
    });
    return fetch(`${API_URL}?${params.toString()}`).then(r => r.json());
}

function apiPost(body) {
    return fetch(API_URL, {
        method: 'POST',
        body: JSON.stringify({
            name_auth: authInfo.name,
            pass_auth: authInfo.pass,
            operator: authInfo.name,
            ...body
        })
    }).then(r => r.json());
}

// ══════════════════════════════════════════════════════
//  總金額
// ══════════════════════════════════════════════════════

async function loadInit() {
    try {
        const res = await apiGet('init');
        if (res.error) { showToast(res.error, true); return; }
        document.getElementById('total-balance').textContent = formatMoney(res.balance);
    } catch (e) {
        showToast('讀取總金額失敗：' + e.message, true);
    }
}

async function recalculateBalance() {
    showLoading('重新計算中...');
    try {
        const res = await apiPost({ action: 'recalculateBalance' });
        hideLoading();
        if (res.error) { showToast(res.error, true); return; }
        document.getElementById('total-balance').textContent = formatMoney(res.balance);
        showToast('已重新計算總金額');
    } catch (e) {
        hideLoading();
        showToast('重新計算失敗：' + e.message, true);
    }
}

// ══════════════════════════════════════════════════════
//  新增收入 / 支出
// ══════════════════════════════════════════════════════

function openEntryForm(type) {
    currentEntryType = type;
    document.getElementById('entry-type').value = type;
    document.getElementById('entry-form-title').textContent = type === '收入' ? '新增收入' : '新增支出';
    document.getElementById('entry-form').classList.remove('hidden');

    // 表單底色跟著目前選擇的收入/支出按鈕同色系
    const entryForm = document.getElementById('entry-form');
    entryForm.classList.remove('entry-form-income', 'entry-form-expense');
    entryForm.classList.add(type === '收入' ? 'entry-form-income' : 'entry-form-expense');

    const incomeBtn = document.getElementById('btn-open-income');
    const expenseBtn = document.getElementById('btn-open-expense');
    incomeBtn.classList.toggle('active', type === '收入');
    expenseBtn.classList.toggle('active', type === '支出');

    document.getElementById('entry-item').focus();
    document.getElementById('entry-form').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function closeEntryForm() {
    const entryForm = document.getElementById('entry-form');
    entryForm.classList.add('hidden');
    entryForm.classList.remove('entry-form-income', 'entry-form-expense');
    document.getElementById('entry-item').value = '';
    document.getElementById('entry-amount').value = '';
    document.getElementById('entry-note').value = '';
    document.getElementById('btn-open-income').classList.remove('active');
    document.getElementById('btn-open-expense').classList.remove('active');
}

async function submitEntry() {
    const item = document.getElementById('entry-item').value.trim();
    const amount = document.getElementById('entry-amount').value;
    const note = document.getElementById('entry-note').value.trim();

    if (!item) { showToast('請輸入項目', true); return; }
    if (!amount || isNaN(amount) || parseFloat(amount) <= 0) { showToast('請輸入正確金額', true); return; }

    const btn = document.getElementById('btn-submit-entry');
    btn.disabled = true;
    showLoading('送出中...');

    try {
        const res = await apiPost({
            action: 'addTransaction',
            record: { type: currentEntryType, item, amount, note }
        });
        hideLoading();
        btn.disabled = false;

        if (res.error || res.success === false) {
            showToast(res.error || '送出失敗', true);
            return;
        }
        document.getElementById('total-balance').textContent = formatMoney(res.balance);
        showToast(currentEntryType + '已新增');
        closeEntryForm();
        refreshHistory();
    } catch (e) {
        hideLoading();
        btn.disabled = false;
        showToast('送出失敗：' + e.message, true);
    }
}

// ══════════════════════════════════════════════════════
//  歷史紀錄查詢
// ══════════════════════════════════════════════════════

function queryHistory() {
    currentHistoryPage = 1;
    document.getElementById('history-table-body').innerHTML = '';
    document.getElementById('history-list-mobile').innerHTML = '';
    fetchHistory(true);
}

function refreshHistory() {
    queryHistory();
}

function loadMoreHistory() {
    currentHistoryPage += 1;
    fetchHistory(false);
}

async function fetchHistory(replaceSummary) {
    const start = document.getElementById('history-date-start').value;
    const end = document.getElementById('history-date-end').value;

    showLoading('載入紀錄中...');
    try {
        const res = await apiGet('getHistory', { start, end, page: currentHistoryPage });
        hideLoading();
        if (res.error) { showToast(res.error, true); return; }

        renderHistoryRows(res.data);

        if (replaceSummary) {
            const summaryBox = document.getElementById('history-summary');
            summaryBox.classList.remove('hidden');
            document.getElementById('summary-income').textContent = '$' + formatMoney(res.summary.income);
            document.getElementById('summary-expense').textContent = '$' + formatMoney(res.summary.expense);
            document.getElementById('summary-net').textContent = '$' + formatMoney(res.summary.net);
        }

        document.getElementById('history-pagination').classList.toggle('hidden', !res.hasMore);
    } catch (e) {
        hideLoading();
        showToast('載入紀錄失敗：' + e.message, true);
    }
}

function renderHistoryRows(rows) {
    const tbody = document.getElementById('history-table-body');
    const mobileList = document.getElementById('history-list-mobile');

    rows.forEach(r => {
        const isIncome = r.amount >= 0;
        const amountClass = isIncome ? 'amount-income' : 'amount-expense';
        const sign = isIncome ? '+' : '';
        const amountText = sign + formatMoney(r.amount);

        // 桌機表格列
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="px-4 py-2 text-gray-500 whitespace-nowrap">${r.timestamp}</td>
            <td class="px-4 py-2">${r.type}</td>
            <td class="px-4 py-2">${escapeHtml(r.item)}</td>
            <td class="px-4 py-2 ${amountClass}">${amountText}</td>
            <td class="px-4 py-2 text-gray-500">${escapeHtml(r.operator)}</td>
            <td class="px-4 py-2 whitespace-nowrap">
                <button onclick='openEditModal(${JSON.stringify(r)})' class="text-blue-600 mr-2"><i class="fa-solid fa-pen"></i></button>
                <button onclick="deleteRecord('${r.id}')" class="text-red-500"><i class="fa-solid fa-trash"></i></button>
            </td>
        `;
        tbody.appendChild(tr);

        // 手機卡片
        const card = document.createElement('div');
        card.className = 'record-card p-3';
        card.innerHTML = `
            <div class="flex justify-between items-start">
                <div>
                    <div class="font-bold">${escapeHtml(r.item)}</div>
                    <div class="text-xs text-gray-500">${r.timestamp}　${escapeHtml(r.operator)}</div>
                    ${r.note ? `<div class="text-xs text-gray-400 mt-1">備註：${escapeHtml(r.note)}</div>` : ''}
                </div>
                <div class="text-right">
                    <div class="${amountClass} text-lg">${amountText}</div>
                    <div class="mt-1 space-x-2">
                        <button onclick='openEditModal(${JSON.stringify(r)})' class="text-blue-600"><i class="fa-solid fa-pen"></i></button>
                        <button onclick="deleteRecord('${r.id}')" class="text-red-500"><i class="fa-solid fa-trash"></i></button>
                    </div>
                </div>
            </div>
        `;
        mobileList.appendChild(card);
    });
}

// ══════════════════════════════════════════════════════
//  刪除
// ══════════════════════════════════════════════════════

async function deleteRecord(id) {
    if (!confirm('確定要刪除這筆紀錄嗎？')) return;
    showLoading('刪除中...');
    try {
        const res = await apiPost({ action: 'deleteTransaction', id });
        hideLoading();
        if (res.error || res.success === false) {
            showToast(res.error || '刪除失敗', true);
            return;
        }
        document.getElementById('total-balance').textContent = formatMoney(res.balance);
        showToast('已刪除');
        refreshHistory();
    } catch (e) {
        hideLoading();
        showToast('刪除失敗：' + e.message, true);
    }
}

// ══════════════════════════════════════════════════════
//  編輯
// ══════════════════════════════════════════════════════

function openEditModal(r) {
    document.getElementById('edit-id').value = r.id;
    document.getElementById('edit-date').value = r.timestamp.slice(0, 10);
    document.getElementById('edit-time-text').textContent = r.timestamp;
    document.getElementById('edit-type').value = r.type;
    document.getElementById('edit-item').value = r.item;
    document.getElementById('edit-amount').value = Math.abs(r.amount);
    document.getElementById('edit-note').value = r.note || '';
    document.getElementById('edit-modal').classList.remove('hidden');
    document.getElementById('edit-modal').classList.add('flex');
}

function closeEditModal() {
    document.getElementById('edit-modal').classList.add('hidden');
    document.getElementById('edit-modal').classList.remove('flex');
}

async function submitEdit() {
    const id = document.getElementById('edit-id').value;
    const newDate = document.getElementById('edit-date').value;
    const newType = document.getElementById('edit-type').value;
    const newItem = document.getElementById('edit-item').value.trim();
    const newAmount = document.getElementById('edit-amount').value;
    const newNote = document.getElementById('edit-note').value.trim();

    if (!newItem) { showToast('請輸入項目', true); return; }
    if (!newAmount || isNaN(newAmount) || parseFloat(newAmount) <= 0) { showToast('請輸入正確金額', true); return; }

    showLoading('儲存中...');
    try {
        const res = await apiPost({
            action: 'editTransaction',
            id, newDate, newType, newItem, newAmount, newNote
        });
        hideLoading();
        if (res.error || res.success === false) {
            showToast(res.error || '儲存失敗', true);
            return;
        }
        document.getElementById('total-balance').textContent = formatMoney(res.balance);
        showToast('已儲存修改');
        closeEditModal();
        refreshHistory();
    } catch (e) {
        hideLoading();
        showToast('儲存失敗：' + e.message, true);
    }
}

// ══════════════════════════════════════════════════════
//  共用小工具
// ══════════════════════════════════════════════════════

function formatMoney(n) {
    const num = parseFloat(n) || 0;
    return num.toLocaleString('zh-TW', { maximumFractionDigits: 0 });
}

function escapeHtml(str) {
    if (str == null) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function showToast(msg, isError = false) {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = 'toast';
    if (isError) toast.style.background = '#7A3B4D';
    toast.textContent = msg;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

function showLoading(text) {
    document.getElementById('loading-text').textContent = text || '處理中...';
    document.getElementById('loading-overlay').classList.remove('hidden');
    document.getElementById('loading-overlay').classList.add('flex');
}

function hideLoading() {
    document.getElementById('loading-overlay').classList.add('hidden');
    document.getElementById('loading-overlay').classList.remove('flex');
}
