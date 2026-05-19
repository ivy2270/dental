/**
 * 禾新餐費管理系統 - 前端邏輯
 */

// --- 請填入您的資訊 ---
const API_URL = 'https://script.google.com/macros/s/AKfycbwb5dL9YhM26IcD-yimWDlIVvwiXLlgNXU1a01Pgls0bkect1IeV1M-7PFXZ-Hu3d9HlQ/exec';
// --------------------

let currentUser = null;
let logoutTimer = null;
let users = [];
let categories = [];
let historyPage = 1;
let historyItemById = {};
let historyRequestSeq = 0;

function formatMoney(value) {
    const amount = Number(value) || 0;
    return amount.toLocaleString('zh-TW', { maximumFractionDigits: 2 });
}

function startLogoutTimer() {
    if (logoutTimer) clearTimeout(logoutTimer);
    logoutTimer = setTimeout(() => {
        logout();
    }, 30 * 60 * 1000); // 30 minutes
}

function logout() {
    sessionStorage.removeItem('user');
    location.reload();
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
        if (data.error) {
            return false;
        }

        users = data.users;
        categories = data.categories;
        renderDashboard();
        renderUserSelections();
        renderCategoryOptions();
        return true;
    } catch (err) {
        console.error(err);
        return false;
    } finally {
        showLoading(false);
    }
}

/**
 * 分頁切換
 */
async function recalculateBalances() {
    if (!confirm('確定要從 Log 重新計算所有人員餘額嗎？這會覆寫 Users 分頁的 Balance 欄。')) return;

    showLoading(true, '重新計算餘額中...');
    try {
        const res = await fetch(API_URL, {
            method: 'POST',
            body: JSON.stringify({
                action: 'recalculateBalances',
                name_auth: currentUser.name,
                pass_auth: currentUser.pass
            })
        });
        const result = await res.json();

        if (result.success) {
            users = result.users || users;
            renderDashboard();
            showToast(`餘額已重新計算，共更新 ${result.updated || 0} 位人員`);
        } else {
            showToast('重新計算失敗：' + result.error);
        }
    } catch (err) {
        showToast('網路錯誤，請稍後再試');
    } finally {
        showLoading(false);
    }
}

function switchTab(tab) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
    document.getElementById(`section-${tab}`).classList.remove('hidden');
    // 電腦版按鈕狀態
    document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active', 'bg-amber-500', 'text-white'));
    const activeBtn = document.getElementById(`tab-${tab}`);
    if (activeBtn) activeBtn.classList.add('active', 'bg-amber-500', 'text-white');

    // 手機版按鈕狀態
    document.querySelectorAll('[id^="mobile-tab-"]').forEach(el => el.classList.remove('bg-amber-100', 'font-bold'));
    const mobileBtn = document.getElementById(`mobile-tab-${tab}`);
    if (mobileBtn) mobileBtn.classList.add('bg-amber-100', 'font-bold');

    // 關閉手機選單
    const mobileMenu = document.getElementById('mobile-menu');
    if (mobileMenu) mobileMenu.classList.add('hidden');
}

/**
 * 渲染儀表板
 */
function renderDashboard() {
    const container = document.getElementById('user-cards');
    const alertBox = document.getElementById('balance-alert');
    const alertNames = document.getElementById('low-balance-names');
    container.innerHTML = '';
    let lowBalance = [];
    let totalBalance = 0;

    users.forEach(user => {
        totalBalance += Number(user.balance) || 0;
        const isNegative = user.balance < 0;
        if (isNegative) lowBalance.push(`${user.name}(${formatMoney(user.balance)})`);

        const card = document.createElement('div');
        card.className = `bg-white p-4 rounded-lg shadow user-card ${isNegative ? 'border-2 border-red-300' : ''}`;
        card.innerHTML = `
            <div class="font-bold text-lg">${user.name}</div>
            <div class="text-right mt-2 ${isNegative ? 'text-red-600 font-bold' : 'text-green-600'}">
                $${formatMoney(user.balance)}
            </div>
        `;
        container.appendChild(card);
    });

    if (lowBalance.length > 0) {
        alertBox.classList.remove('hidden');
        alertNames.innerText = lowBalance.join(', ');
    } else {
        alertBox.classList.add('hidden');
    }
    document.getElementById('total-balance').innerText = formatMoney(totalBalance);
}

/**
 * 渲染人名選單
 */
function renderUserSelections() {
    const batchList = document.getElementById('batch-user-list');
    const depositSelect = document.getElementById('deposit-user');
    const historySelect = document.getElementById('history-user');

    if (batchList) batchList.innerHTML = '';
    if (depositSelect) depositSelect.innerHTML = '<option value="">請選擇人員...</option>';
    if (historySelect) historySelect.innerHTML = '<option value="全部">全部人員</option>';

    users.forEach(user => {
        if (batchList) {
            const label = document.createElement('label');
            label.className = 'flex items-center space-x-2 p-2 hover:bg-gray-50 rounded cursor-pointer';
            label.innerHTML = `
                <input type="checkbox" class="user-checkbox h-5 w-5 text-blue-600" value="${user.name}">
                <span class="text-sm">${user.name}</span>
            `;
            batchList.appendChild(label);
        }

        const opt = `<option value="${user.name}">${user.name}</option>`;
        if (depositSelect) depositSelect.innerHTML += opt;
        if (historySelect) historySelect.innerHTML += opt;
    });
}

function renderCategoryOptions() {
    const select = document.getElementById('batch-category');
    const historySelect = document.getElementById('history-category');
    select.innerHTML = '';
    historySelect.innerHTML = '<option value="全部">全部項目</option>';
    const expenseCategories = categories.filter(c => c !== '儲值' && c !== '期初設定');
    expenseCategories.forEach(c => {
        if (select) select.innerHTML += `<option value="${c}">${c}</option>`;
    });
    categories.forEach(c => {
        if (historySelect) historySelect.innerHTML += `<option value="${c}">${c}</option>`;
    });
}

// --- 批次輸入邏輯 ---

function selectAllUsers(checked) {
    document.querySelectorAll('.user-checkbox').forEach(cb => cb.checked = checked);
}

function toBatchStep2() {
    const selected = Array.from(document.querySelectorAll('.user-checkbox:checked')).map(cb => cb.value);
    if (selected.length === 0) return alert('請至少選擇一個人');

    const table = document.getElementById('batch-input-table');
    const cards = document.getElementById('batch-input-cards');
    table.innerHTML = '';
    cards.innerHTML = '';

    selected.forEach(name => {
        // 電腦版表格行
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="px-4 py-2">${name}</td>
            <td class="px-4 py-2">
                <input type="number" class="row-amount w-full border rounded p-1" data-name="${name}" placeholder="金額">
            </td>
            <td class="px-4 py-2">
                <input type="text" class="row-note w-full border rounded p-1" data-name="${name}" placeholder="備註">
            </td>
        `;
        table.appendChild(tr);

        // 手機版卡片
        const card = document.createElement('div');
        card.className = "bg-gray-50 p-4 rounded-lg border space-y-2";
        card.innerHTML = `
            <div class="font-bold text-amber-800">${name}</div>
            <div class="grid grid-cols-2 gap-2">
                <div>
                    <label class="block text-xs text-gray-500 mb-1">金額</label>
                    <input type="number" class="row-amount-mobile w-full border rounded p-2" data-name="${name}" placeholder="金額">
                </div>
                <div>
                    <label class="block text-xs text-gray-500 mb-1">備註</label>
                    <input type="text" class="row-note-mobile w-full border rounded p-2" data-name="${name}" placeholder="備註">
                </div>
            </div>
        `;
        cards.appendChild(card);
    });

    // 同步手機與電腦版的輸入
    setupBatchInputSync();

    document.getElementById('batch-step-1').classList.add('hidden');
    document.getElementById('batch-step-2').classList.remove('hidden');
}

function toBatchStep1() {
    document.getElementById('batch-step-2').classList.add('hidden');
    document.getElementById('batch-step-1').classList.remove('hidden');
    document.getElementById('batch-amount-all').value = '';
    document.getElementById('batch-total-sum').innerText = '0';
    document.getElementById('batch-input-table').innerHTML = '';
    document.getElementById('batch-input-cards').innerHTML = '';
}

function setupBatchInputSync() {
    const updateSum = () => {
        let sum = 0;
        document.querySelectorAll('.row-amount').forEach(input => {
            const val = parseFloat(input.value);
            if (!isNaN(val)) sum += val;
        });
        document.getElementById('batch-total-sum').innerText = formatMoney(sum);
    };

    // 當電腦版輸入時，同步到手機版
    document.querySelectorAll('.row-amount').forEach(input => {
        input.addEventListener('input', (e) => {
            const mobileInput = document.querySelector(`.row-amount-mobile[data-name="${e.target.dataset.name}"]`);
            if (mobileInput) mobileInput.value = e.target.value;
            updateSum();
        });
    });
    document.querySelectorAll('.row-note').forEach(input => {
        input.addEventListener('input', (e) => {
            const mobileInput = document.querySelector(`.row-note-mobile[data-name="${e.target.dataset.name}"]`);
            if (mobileInput) mobileInput.value = e.target.value;
        });
    });
    // 當手機版輸入時，同步到電腦版
    document.querySelectorAll('.row-amount-mobile').forEach(input => {
        input.addEventListener('input', (e) => {
            const desktopInput = document.querySelector(`.row-amount[data-name="${e.target.dataset.name}"]`);
            if (desktopInput) desktopInput.value = e.target.value;
            updateSum();
        });
    });
    document.querySelectorAll('.row-note-mobile').forEach(input => {
        input.addEventListener('input', (e) => {
            const desktopInput = document.querySelector(`.row-note[data-name="${e.target.dataset.name}"]`);
            if (desktopInput) desktopInput.value = e.target.value;
        });
    });
}

function applyAllAmount() {
    const amount = document.getElementById('batch-amount-all').value;
    document.querySelectorAll('.row-amount, .row-amount-mobile').forEach(input => input.value = amount);
    // 更新總和
    let sum = 0;
    const count = document.querySelectorAll('.row-amount').length;
    const val = parseFloat(amount);
    if (!isNaN(val)) {
        sum = val * count;
    }
    document.getElementById('batch-total-sum').innerText = formatMoney(sum);
}

async function submitBatch() {
    const category = document.getElementById('batch-category').value;
    const records = [];
    let isValid = true;

    document.querySelectorAll('.row-amount').forEach(input => {
        const val = parseFloat(input.value);
        if (isNaN(val)) isValid = false;
        records.push({
            name: input.dataset.name,
            amount: val,
            category: category,
            note: document.querySelector(`.row-note[data-name="${input.dataset.name}"]`).value
        });
    });

    if (!isValid) return alert('請確保所有金額皆已填寫且為數字');

    showLoading(true, '提交紀錄中...');
    try {
        const res = await fetch(API_URL, {
            method: 'POST',
            body: JSON.stringify({
                action: 'recordTransaction',
                name_auth: currentUser.name,
                pass_auth: currentUser.pass,
                operator: currentUser.name,
                records: records
            })
        });
        const result = await res.json();
        if (result.success) {
            showToast("提交成功！");
            await initData();
            toBatchStep1();
            switchTab("dashboard");
            startLogoutTimer(); // 活動時重設計時器
        } else {
            showToast("提交失敗：" + result.error);
        }
    } catch (err) {
        showToast("網路錯誤，請稍後再試");
    } finally {
        showLoading(false);
    }
}

// --- 儲值/初始金額設定邏輯 ---

async function submitDeposit() {
    const name = document.getElementById('deposit-user').value;
    const amount = parseFloat(document.getElementById('deposit-amount').value);
    const category = document.getElementById('deposit-category').value || '儲值';
    const note = document.getElementById('deposit-note').value;

    if (!name || isNaN(amount) || amount === 0) return alert('請填寫正確的人員與金額（不能為0）');

    showLoading(true, '處理中...');
    try {
        const res = await fetch(API_URL, {
            method: 'POST',
            body: JSON.stringify({
                action: 'deposit',
                name_auth: currentUser.name,
                pass_auth: currentUser.pass,
                operator: currentUser.name,
                record: { name, amount, category, note }
            })
        });
        const result = await res.json();
        if (result.success) {
            showToast("處理成功！");
            document.getElementById('deposit-amount').value = '';
            document.getElementById('deposit-note').value = '';
            await initData();
            switchTab('dashboard');
            startLogoutTimer(); // 活動時重設計時器
        } else {
            showToast("處理失敗：" + result.error);
        }
    } catch (err) {
        showToast("網路錯誤");
    } finally {
        showLoading(false);
    }
}
// --- 查詢邏輯 ---

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
    const user = document.getElementById('history-user').value || '全部';
    const category = document.getElementById('history-category').value || '全部';
    const start = document.getElementById('history-date-start').value;
    const end = document.getElementById('history-date-end').value;

    try {
        const url = `${API_URL}?action=getHistory&name=${encodeURIComponent(user)}&category=${encodeURIComponent(category)}&start=${start}&end=${end}&name_auth=${encodeURIComponent(currentUser.name)}&pass_auth=${encodeURIComponent(currentUser.pass)}&page=${historyPage}`;
        const res = await fetch(url);
        const result = await res.json();

        if (requestSeq !== historyRequestSeq) return;

        if (historyPage === 1) {
            document.getElementById('history-table-body').innerHTML = '';
            const mobileList = document.getElementById('history-list-mobile');
            if (mobileList) mobileList.innerHTML = '';
            Object.keys(historyItemById).forEach(id => delete historyItemById[id]);
        }

        renderHistory(result.data);
        renderHistorySummary(result.summary); // 假設 API 會回傳摘要
        const pagination = document.getElementById('history-pagination');
        if (result.hasMore) {
            pagination.classList.remove('hidden');
        } else {
            pagination.classList.add('hidden');
        }
    } catch (err) {
        showToast('查詢失敗');
    } finally {
        showLoading(false);
    }
}

async function refreshBalances() {
    try {
        const response = await fetch(`${API_URL}?action=init&name_auth=${encodeURIComponent(currentUser.name)}&pass_auth=${encodeURIComponent(currentUser.pass)}`);
        const data = await response.json();
        if (!data.error) {
            users = data.users;
            renderDashboard();
        }
    } catch (err) {
        console.error(err);
    }
}

async function refreshHistory() {
    historyPage = 1;
    document.getElementById('history-table-body').innerHTML = '';
    const mobileList = document.getElementById('history-list-mobile');
    if (mobileList) mobileList.innerHTML = '';
    await refreshBalances();
    await fetchHistory();
}

function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.innerText = value || '';
}

function renderHistorySummary(summary) {
    const container = document.getElementById('history-summary');
    const items = document.getElementById('history-summary-items');
    if (!summary || Object.keys(summary).length === 0) {
        container.classList.add('hidden');
        return;
    }

    container.classList.remove('hidden');
    items.innerHTML = '';
    for (const [cat, total] of Object.entries(summary)) {
        items.innerHTML += `
            <div class="bg-gray-50 p-2 rounded text-center border">
                <div class="text-xs text-gray-500">${cat}</div>
                <div class="font-bold text-gray-800">$${formatMoney(total)}</div>
            </div>
        `;
    }
}

function renderHistory(data) {
    const tbody = document.getElementById('history-table-body');
    const mobileList = document.getElementById('history-list-mobile');

    data.forEach(item => {
        const amountClass = item.amount < 0 ? 'text-red-500' : 'text-green-600 font-bold';
        const amount = Number(item.amount) || 0;
        historyItemById[item.id] = item;
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="px-4 py-2">${item.timestamp}</td>
            <td class="px-4 py-2">${item.name}</td>
            <td class="px-4 py-2">${item.type}</td>
            <td class="px-4 py-2">${item.category} ${item.note ? `(${item.note})` : ''}</td>
            <td class="px-4 py-2 ${amountClass}">${formatMoney(amount)}</td>
            <td class="px-4 py-2 text-gray-500">${item.operator || ''}</td>
            <td class="px-4 py-2 space-x-2">
                <button onclick="openEditModal('${item.id}')" class="inline-flex h-8 w-8 items-center justify-center rounded hover:bg-blue-50 text-gray-500" title="修改" aria-label="修改">
                    <i class="fa-solid fa-pen-to-square"></i>
                </button>
                <button onclick="deleteHistory('${item.id}')" class="inline-flex h-8 w-8 items-center justify-center rounded hover:bg-red-50 text-gray-500" title="刪除" aria-label="刪除">
                    <i class="fa-solid fa-trash"></i>
                </button>
            </td>
        `;
        tbody.appendChild(tr);

        // 手機版列表
        if (mobileList) {
            const div = document.createElement('div');
            div.className = "p-3 space-y-1";
            div.innerHTML = `
                <div class="flex justify-between items-start">
                    <span class="font-bold text-gray-800">${item.name}</span>
                    <span class="${amountClass}">$${formatMoney(amount)}</span>
                </div>
                <div class="flex justify-between text-xs text-gray-500">
                    <span>${item.category} ${item.note ? `(${item.note})` : ''}</span>
                    <span>${item.timestamp}</span>
                </div>
                <div class="text-xs text-gray-400">操作人: ${item.operator || ''}</div>
                <div class="flex justify-end space-x-4 pt-1 border-t mt-1 text-sm">
                    <button onclick="openEditModal('${item.id}')" class="inline-flex h-8 w-8 items-center justify-center rounded text-gray-500" title="修改" aria-label="修改">
                        <i class="fa-solid fa-pen-to-square"></i>
                    </button>
                    <button onclick="deleteHistory('${item.id}')" class="inline-flex h-8 w-8 items-center justify-center rounded text-gray-500" title="刪除" aria-label="刪除">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </div>
            `;
            mobileList.appendChild(div);
        }
    });
}

function openEditModal(id) {
    const item = historyItemById[id];
    if (!item) {
        showToast('找不到這筆紀錄，請重新整理後再試');
        return;
    }

    const amount = Number(item.amount) || 0;

    document.getElementById('edit-id').value = item.id;
    setText('edit-time-text', item.timestamp);
    setText('edit-name-text', item.name);
    setText('edit-type-text', item.type);
    setText('edit-category-text', item.category);
    document.getElementById('edit-amount').value = Math.abs(amount);
    document.getElementById('edit-note').value = item.note || '';
    document.getElementById('edit-modal').classList.remove('hidden');
}

function closeEditModal() {
    document.getElementById('edit-modal').classList.add('hidden');
}

async function submitEdit() {
    const id = document.getElementById('edit-id').value;
    const newAmount = parseFloat(document.getElementById('edit-amount').value);
    const newNote = document.getElementById('edit-note').value;

    if (isNaN(newAmount)) return alert('請輸入數字');

    showLoading(true, '儲存修改中...');
    try {
        const res = await fetch(API_URL, {
            method: 'POST',
            body: JSON.stringify({
                action: 'editTransaction',
                name_auth: currentUser.name,
                pass_auth: currentUser.pass,
                id: id,
                newAmount: newAmount,
                newNote: newNote
            })
        });
        const result = await res.json();
        if (result.success) {
            showToast('修改成功');
            closeEditModal();
            await refreshHistory();
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
    if (!confirm('確定要刪除這筆紀錄嗎？這會自動恢復該員餘額。')) return;

    showLoading(true, '刪除中...');
    try {
        const res = await fetch(API_URL, {
            method: 'POST',
            body: JSON.stringify({
                action: 'deleteTransaction',
                name_auth: currentUser.name,
                pass_auth: currentUser.pass,
                id: id
            })
        });
        const result = await res.json();
        if (result.success) {
            showToast('刪除成功');
            await refreshHistory();
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

// --- 輔助工具 ---

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
window.onload = async function() {
    // 檢查 Session
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

    const today = new Date();
    const year = today.getFullYear();
    const month = (today.getMonth() + 1).toString().padStart(2, '0');
    const day = today.getDate().toString().padStart(2, '0');
    const localToday = `${year}-${month}-${day}`;
    document.getElementById('history-date-start').value = localToday;
    document.getElementById('history-date-end').value = localToday;
    // 漢堡選單邏輯
    const toggle = document.getElementById('menu-toggle');
    const menu = document.getElementById('mobile-menu');
    if (toggle && menu) {
        toggle.addEventListener('click', () => {
            menu.classList.toggle('hidden');
        });
    }

    // 點擊選單外部關閉選單
    document.addEventListener('click', (e) => {
        if (menu && !menu.contains(e.target) && !toggle.contains(e.target)) {
            menu.classList.add('hidden');
        }
    });

    // 監聽活動以重設登出計時器
    ['mousedown', 'keydown', 'touchstart'].forEach(type => {
        document.addEventListener(type, () => {
            if (currentUser) startLogoutTimer();
        });
    });
};
