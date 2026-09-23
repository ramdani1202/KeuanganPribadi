/* =========================================================
   CATATAN UANG — app.js
   Semua data disimpan di localStorage browser.
   Struktur penyimpanan:
   - "cu_users"        -> { username: { passHash, createdAt } }
   - "cu_data_<user>"  -> { incomeType, banks:[], ewallets:[], balances:{bank:{}, ewallet:{}, cash:0}, transactions:[] }
   - "cu_session"      -> username yang sedang login
   ========================================================= */

const LS_USERS = 'cu_users';
const LS_SESSION = 'cu_session';
const dataKey = (u) => `cu_data_${u}`;

/* ---------- Katalog logo bank & e-wallet ---------- */
const BANK_CATALOG = [
  { key:'seabank',  name:'SeaBank',  logo:'icons/banks/seabank.png' },
  { key:'bca',      name:'BCA',      logo:'icons/banks/bca.png' },
  { key:'bri',      name:'BRI',      logo:'icons/banks/bri.png' },
  { key:'bni',      name:'BNI',      logo:'icons/banks/bni.png' },
  { key:'mandiri',  name:'Mandiri',  logo:'icons/banks/mandiri.png' },
  { key:'jago',     name:'Jago',     logo:'icons/banks/jago.png' },
  { key:'neobank',  name:'Neobank',  logo:'icons/banks/neobank.png' }
];
const EWALLET_CATALOG = [
  { key:'gopay',      name:'GoPay',      logo:'icons/ewallets/gopay.png' },
  { key:'dana',       name:'DANA',       logo:'icons/ewallets/dana.png' },
  { key:'ovo',        name:'OVO',        logo:'icons/ewallets/ovo.png' },
  { key:'shopeepay',  name:'ShopeePay',  logo:'icons/ewallets/shopeepay.png' }
];
function catalogFor(kind){ return kind === 'bank' ? BANK_CATALOG : EWALLET_CATALOG; }
function catalogItem(kind, key){ return catalogFor(kind).find(c => c.key === key); }

let currentUser = null;
let currentData = null;
let obSelectedIncomeType = null;
let txType = null; // 'in' | 'out'
let txSelectedSource = null; // {type:'bank'|'ewallet'|'cash', name:string}
let historyFilterMode = 'all';

/* ---------- Utilities ---------- */
function simpleHash(str){
  let hash = 0;
  for(let i=0;i<str.length;i++){
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return hash.toString(36);
}
function fmtRupiah(n){
  n = Math.round(Number(n)||0);
  return 'Rp' + n.toLocaleString('id-ID');
}
function todayKey(d = new Date()){
  return d.toISOString().slice(0,10);
}
function showToast(msg){
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(window._toastTimer);
  window._toastTimer = setTimeout(()=> t.classList.remove('show'), 2200);
}
function goTo(screenId){
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(screenId).classList.add('active');
}
function uid(){ return Date.now().toString(36) + Math.random().toString(36).slice(2,7); }

/* ---------- Storage helpers ---------- */
function getUsers(){
  try{ return JSON.parse(localStorage.getItem(LS_USERS)) || {}; }catch(e){ return {}; }
}
function saveUsers(u){ localStorage.setItem(LS_USERS, JSON.stringify(u)); }

function getUserData(username){
  try{
    const raw = localStorage.getItem(dataKey(username));
    if(!raw) return null;
    return migrateWalletsIfNeeded(JSON.parse(raw));
  }catch(e){ return null; }
}
function saveUserData(username, data){
  localStorage.setItem(dataKey(username), JSON.stringify(data));
}
function defaultUserData(){
  return {
    incomeType: null,
    // banks/ewallets: [{id, key, name, logo}] -- id unik per item ditambahkan (boleh duplikat key, mis. 2x BCA)
    banks: [],
    ewallets: [],
    balances: { bank:{}, ewallet:{}, cash:0 }, // keyed by item.id
    transactions: [] // {id, type:'in'|'out', amount, name, source:{type,id,name}, date(ISO), category?}
  };
}

/* Migrasi data lama: banks/ewallets dulu berupa array string nama,
   dan balances.bank/ewallet keyed by nama. Versi baru pakai object
   {id,key,name,logo} + balances keyed by id, supaya bisa duplikat
   (mis. 2 rekening BCA) dan bisa tampilkan logo. */
function migrateWalletsIfNeeded(data){
  if(!data) return data;
  let changed = false;

  const migrateList = (list, balancesObj, kind) => {
    const newList = [];
    const newBalances = {};
    (list||[]).forEach(item => {
      if(typeof item === 'string'){
        changed = true;
        const id = uid();
        const found = catalogFor(kind).find(c => c.name.toLowerCase() === item.toLowerCase());
        newList.push({ id, key: found ? found.key : null, name: item, logo: found ? found.logo : null });
        newBalances[id] = (balancesObj && balancesObj[item]) || 0;
      } else if(item && item.id){
        newList.push(item);
        newBalances[item.id] = (balancesObj && balancesObj[item.id]) || 0;
      }
    });
    return { newList, newBalances };
  };

  if((data.banks||[]).some(b => typeof b === 'string')){
    const { newList, newBalances } = migrateList(data.banks, data.balances && data.balances.bank, 'bank');
    data.banks = newList;
    data.balances.bank = newBalances;
  }
  if((data.ewallets||[]).some(b => typeof b === 'string')){
    const { newList, newBalances } = migrateList(data.ewallets, data.balances && data.balances.ewallet, 'ewallet');
    data.ewallets = newList;
    data.balances.ewallet = newBalances;
  }

  // Transaksi lama menyimpan source.name sebagai kunci saldo; sinkronkan source.id kalau belum ada
  if(changed && Array.isArray(data.transactions)){
    data.transactions.forEach(t => {
      if(t.source && !t.source.id && t.source.type !== 'cash'){
        const list = t.source.type === 'bank' ? data.banks : data.ewallets;
        const match = list.find(w => w.name === t.source.name);
        if(match) t.source.id = match.id;
      }
    });
  }

  return data;
}

/* =========================================================
   AUTH
   ========================================================= */
function handleRegister(){
  const username = document.getElementById('reg-username').value.trim();
  const p1 = document.getElementById('reg-password').value;
  const p2 = document.getElementById('reg-password2').value;

  if(!username){ showToast('Nama akun tidak boleh kosong'); return; }
  if(p1.length < 4){ showToast('Sandi minimal 4 karakter'); return; }
  if(p1 !== p2){ showToast('Sandi tidak cocok'); return; }

  const users = getUsers();
  if(users[username]){ showToast('Nama akun sudah dipakai, pilih nama lain'); return; }

  users[username] = { passHash: simpleHash(p1), createdAt: new Date().toISOString() };
  saveUsers(users);
  saveUserData(username, defaultUserData());

  currentUser = username;
  currentData = getUserData(username);
  localStorage.setItem(LS_SESSION, username);

  // clear fields
  document.getElementById('reg-username').value = '';
  document.getElementById('reg-password').value = '';
  document.getElementById('reg-password2').value = '';

  showToast('Akun dibuat! Yuk lengkapi datamu');
  goTo('screen-ob-income');
}

function handleLogin(){
  const username = document.getElementById('login-username').value.trim();
  const pass = document.getElementById('login-password').value;

  if(!username || !pass){ showToast('Isi nama akun dan sandi'); return; }

  const users = getUsers();
  const rec = users[username];
  if(!rec){ showToast('Akun tidak ditemukan'); return; }
  if(rec.passHash !== simpleHash(pass)){ showToast('Sandi salah'); return; }

  currentUser = username;
  currentData = getUserData(username) || defaultUserData();
  localStorage.setItem(LS_SESSION, username);

  document.getElementById('login-password').value = '';

  // Kalau onboarding belum selesai (belum ada incomeType), arahkan ke onboarding
  if(!currentData.incomeType){
    goTo('screen-ob-income');
  } else {
    enterApp();
  }
}

function handleLogout(){
  localStorage.removeItem(LS_SESSION);
  currentUser = null;
  currentData = null;
  document.getElementById('login-username').value = '';
  goTo('screen-login');
}

function confirmReset(){
  if(confirm('Yakin hapus semua data akun ini? Tindakan ini tidak bisa dibatalkan.')){
    localStorage.removeItem(dataKey(currentUser));
    currentData = defaultUserData();
    saveUserData(currentUser, currentData);
    showToast('Data akun sudah direset');
    goTo('screen-ob-income');
  }
}

/* =========================================================
   ONBOARDING
   ========================================================= */
function selectIncomeType(type, el){
  obSelectedIncomeType = type;
  document.querySelectorAll('#screen-ob-income .source-opt').forEach(o=>o.classList.remove('selected'));
  el.classList.add('selected');
}

function walletRowHTML(item, i, removeFn){
  const logoHTML = item.logo
    ? `<img src="${item.logo}" class="wlogo" alt="">`
    : `<span class="wlogo wlogo-fallback">${escapeHtml((item.name||'?').charAt(0).toUpperCase())}</span>`;
  return `<div class="row-item">
      ${logoHTML}
      <span class="rname">${escapeHtml(item.name)}</span>
      <button class="rdel" onclick="${removeFn}(${i})">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
      </button>
    </div>`;
}

function renderOBBankList(){
  const wrap = document.getElementById('ob-bank-list');
  wrap.innerHTML = currentData.banks.map((b,i) => walletRowHTML(b, i, 'removeBankOB')).join('');
}
function removeBankOB(i){
  const item = currentData.banks[i];
  if(item) delete currentData.balances.bank[item.id];
  currentData.banks.splice(i,1);
  renderOBBankList();
}

function renderOBEwalletList(){
  const wrap = document.getElementById('ob-ewallet-list');
  wrap.innerHTML = currentData.ewallets.map((b,i) => walletRowHTML(b, i, 'removeEwalletOB')).join('');
}
function removeEwalletOB(i){
  const item = currentData.ewallets[i];
  if(item) delete currentData.balances.ewallet[item.id];
  currentData.ewallets.splice(i,1);
  renderOBEwalletList();
}

/* ---------- Pilih logo bank/e-wallet (dipakai di onboarding & tab Dompet) ---------- */
let pickerContext = null; // 'ob-bank' | 'ob-ewallet' | 'wallets'

function openWalletPicker(context){
  pickerContext = context;
  const kind = (context === 'ob-ewallet' || context === 'wallets-ewallet') ? 'ewallet' : 'bank';
  const title = kind === 'bank' ? 'Pilih bank' : 'Pilih e-wallet';
  const grid = catalogFor(kind).map(c => `
    <div class="source-opt" onclick="pickWalletFromCatalog('${kind}','${c.key}')">
      <img src="${c.logo}" class="sicon-logo" alt="">
      <span class="sname">${escapeHtml(c.name)}</span>
    </div>`).join('');

  const body = document.getElementById('wallet-picker-body');
  body.innerHTML = `
    <h3 class="modal-title">${title}</h3>
    <p class="modal-sub">Boleh pilih yang sama lebih dari sekali (mis. 2 rekening berbeda).</p>
    <div class="source-grid">${grid}</div>
  `;
  document.getElementById('wallet-picker-modal').classList.add('active');
}
function closeWalletPicker(){
  document.getElementById('wallet-picker-modal').classList.remove('active');
}

function pickWalletFromCatalog(kind, key){
  const cat = catalogItem(kind, key);
  if(!cat) return;
  const item = { id: uid(), key: cat.key, name: cat.name, logo: cat.logo };

  if(kind === 'bank'){
    currentData.banks.push(item);
    currentData.balances.bank[item.id] = 0;
  } else {
    currentData.ewallets.push(item);
    currentData.balances.ewallet[item.id] = 0;
  }

  closeWalletPicker();

  if(pickerContext === 'ob-bank') renderOBBankList();
  else if(pickerContext === 'ob-ewallet') renderOBEwalletList();
  else if(pickerContext === 'wallets-bank' || pickerContext === 'wallets-ewallet'){
    saveUserData(currentUser, currentData);
    refreshWallets();
    showToast((kind==='bank'?'Bank':'E-wallet') + ' ditambahkan');
  }
}

function renderOBBalanceBank(){
  const wrap = document.getElementById('ob-balance-bank-list');
  wrap.innerHTML = '';
  if(currentData.banks.length === 0){
    wrap.innerHTML = '<p class="sub">Kamu tidak menambahkan rekening bank.</p>';
    return;
  }
  currentData.banks.forEach(b => {
    const field = document.createElement('div');
    field.className = 'field';
    const logoHTML = b.logo ? `<img src="${b.logo}" class="wlogo-sm" alt="">` : '';
    field.innerHTML = `<label style="display:flex; align-items:center; gap:8px;">${logoHTML}${escapeHtml(b.name)}</label>
      <div class="amount-input-wrap" style="margin-bottom:0;">
        <span class="rp">Rp</span>
        <input type="number" inputmode="numeric" placeholder="0" data-id="${b.id}" class="ob-bank-balance-input" value="${currentData.balances.bank[b.id]||''}">
      </div>`;
    wrap.appendChild(field);
  });
}
function renderOBBalanceEwallet(){
  const wrap = document.getElementById('ob-balance-ewallet-list');
  wrap.innerHTML = '';
  if(currentData.ewallets.length === 0){
    wrap.innerHTML = '<p class="sub">Kamu tidak menambahkan e-wallet.</p>';
    return;
  }
  currentData.ewallets.forEach(b => {
    const field = document.createElement('div');
    field.className = 'field';
    const logoHTML = b.logo ? `<img src="${b.logo}" class="wlogo-sm" alt="">` : '';
    field.innerHTML = `<label style="display:flex; align-items:center; gap:8px;">${logoHTML}${escapeHtml(b.name)}</label>
      <div class="amount-input-wrap" style="margin-bottom:0;">
        <span class="rp">Rp</span>
        <input type="number" inputmode="numeric" placeholder="0" data-id="${b.id}" class="ob-ewallet-balance-input" value="${currentData.balances.ewallet[b.id]||''}">
      </div>`;
    wrap.appendChild(field);
  });
}

function collectOBBankBalances(){
  document.querySelectorAll('.ob-bank-balance-input').forEach(inp => {
    const id = inp.getAttribute('data-id');
    currentData.balances.bank[id] = Number(inp.value) || 0;
  });
}
function collectOBEwalletBalances(){
  document.querySelectorAll('.ob-ewallet-balance-input').forEach(inp => {
    const id = inp.getAttribute('data-id');
    currentData.balances.ewallet[id] = Number(inp.value) || 0;
  });
}

function finishOnboarding(){
  collectOBEwalletBalances();
  const cashVal = Number(document.getElementById('ob-cash-input').value) || 0;
  currentData.balances.cash = cashVal;
  currentData.incomeType = obSelectedIncomeType || 'gaji';
  saveUserData(currentUser, currentData);
  showToast('Data awal tersimpan!');
  enterApp();
}

/* Hook navigation transitions to prep data for next onboarding screen */
const _origGoTo = goTo;
goTo = function(screenId){
  _origGoTo(screenId);
  if(screenId === 'screen-ob-banks') renderOBBankList();
  if(screenId === 'screen-ob-ewallet') renderOBEwalletList();
  if(screenId === 'screen-ob-balance-bank'){ renderOBBalanceBank(); }
  if(screenId === 'screen-ob-balance-ewallet'){ collectOBBankBalances(); renderOBBalanceEwallet(); }
};

function escapeHtml(str){
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

/* =========================================================
   APP ENTRY / HOME
   ========================================================= */
function enterApp(){
  goTo('screen-home');
  refreshHome();
}

function switchTab(tab){
  document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));
  const map = { home:'screen-home', history:'screen-history', wallets:'screen-wallets', settings:'screen-settings' };
  goTo(map[tab]);
  // set active state on the matching tab in the now-active screen
  document.querySelectorAll(`#${map[tab]} .tab-btn`).forEach((b,i)=>{});
  const btns = document.querySelectorAll(`#${map[tab]} .tabbar .tab-btn`);
  const order = ['home','history','wallets','settings'];
  btns.forEach((b, i) => { if(order[i] === tab) b.classList.add('active'); });

  if(tab === 'home') refreshHome();
  if(tab === 'history') refreshHistory();
  if(tab === 'wallets') refreshWallets();
  if(tab === 'settings') refreshSettings();
}

function totalBalance(){
  let t = currentData.balances.cash || 0;
  currentData.banks.forEach(b => t += Number(currentData.balances.bank[b.id])||0);
  currentData.ewallets.forEach(b => t += Number(currentData.balances.ewallet[b.id])||0);
  return t;
}

function todayTx(){
  const tk = todayKey();
  return currentData.transactions.filter(t => t.date.slice(0,10) === tk);
}

function refreshHome(){
  document.getElementById('home-total-balance').textContent = fmtRupiah(totalBalance());
  const tx = todayTx();
  const inTotal = tx.filter(t=>t.type==='in').reduce((s,t)=>s+t.amount,0);
  const outTotal = tx.filter(t=>t.type==='out').reduce((s,t)=>s+t.amount,0);
  document.getElementById('total-in').textContent = fmtRupiah(inTotal);
  document.getElementById('total-out').textContent = fmtRupiah(outTotal);
  const sum = inTotal + outTotal;
  document.getElementById('pct-in').textContent = sum ? Math.round(inTotal/sum*100) + '%' : '0%';
  document.getElementById('pct-out').textContent = sum ? Math.round(outTotal/sum*100) + '%' : '0%';
}

/* =========================================================
   TRANSACTION MODAL
   ========================================================= */
function sourceIconSVG(type){
  if(type === 'bank') return `<svg class="sicon" viewBox="0 0 24 24" fill="none"><path d="M3 10.5L12 4l9 6.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><rect x="4.5" y="10.5" width="15" height="8.5" rx="2" stroke="currentColor" stroke-width="1.8"/><path d="M2.5 20.5h19" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`;
  if(type === 'ewallet') return `<svg class="sicon" viewBox="0 0 24 24" fill="none"><rect x="2.5" y="5.5" width="19" height="14" rx="3.5" stroke="currentColor" stroke-width="1.8"/><path d="M2.5 10h19" stroke="currentColor" stroke-width="1.8"/><circle cx="16.5" cy="15" r="1.3" fill="currentColor"/></svg>`;
  return `<svg class="sicon" viewBox="0 0 24 24" fill="none"><rect x="2.5" y="6.5" width="19" height="11" rx="3" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="12" r="2.5" stroke="currentColor" stroke-width="1.8"/></svg>`;
}

function openTxModal(type){
  txType = type;
  txSelectedSource = null;
  const body = document.getElementById('tx-modal-body');

  // Build source list
  let sources = [];
  currentData.banks.forEach(b => sources.push({type:'bank', id:b.id, name:b.name, logo:b.logo, bal: currentData.balances.bank[b.id]||0}));
  currentData.ewallets.forEach(b => sources.push({type:'ewallet', id:b.id, name:b.name, logo:b.logo, bal: currentData.balances.ewallet[b.id]||0}));
  sources.push({type:'cash', name:'Cash', bal: currentData.balances.cash||0});

  const title = type === 'in' ? 'Catat pemasukan' : 'Catat pengeluaran';
  const sub = type === 'in' ? 'Uang masuk lewat mana?' : 'Bayar pakai apa?';

  let sourceGridHTML = '<div class="source-grid" id="tx-source-grid">';
  sources.forEach((s, idx) => {
    const iconHTML = s.logo ? `<img src="${s.logo}" class="sicon-logo" alt="">` : sourceIconSVG(s.type);
    sourceGridHTML += `<div class="source-opt" data-idx="${idx}" onclick="selectTxSource(${idx})">
      ${iconHTML}
      <span class="sname">${escapeHtml(s.name)}</span>
      <span class="samt">${fmtRupiah(s.bal)}</span>
    </div>`;
  });
  sourceGridHTML += '</div>';

  window._txSources = sources;

  body.innerHTML = `
    <h3 class="modal-title">${title}</h3>
    <p class="modal-sub">${sub}</p>
    ${sourceGridHTML}
    <div class="field">
      <label>${type === 'in' ? 'Nama pemasukan' : 'Nama pengeluaran'}</label>
      <input type="text" id="tx-name" placeholder="${type === 'in' ? 'cth. Gaji, Jual barang' : 'cth. Makan siang, Bensin'}">
    </div>
    <div class="amount-input-wrap">
      <span class="rp">Rp</span>
      <input type="number" id="tx-amount" placeholder="0" inputmode="numeric">
    </div>
    <button class="btn ${type==='in' ? 'btn-primary' : 'btn-buy'}" onclick="submitTx()">
      ${type === 'in' ? 'Simpan pemasukan' : 'Buy — catat pengeluaran'}
    </button>
  `;
  document.getElementById('tx-modal').classList.add('active');
}

function selectTxSource(idx){
  txSelectedSource = window._txSources[idx];
  document.querySelectorAll('#tx-source-grid .source-opt').forEach(el=>el.classList.remove('selected'));
  document.querySelector(`#tx-source-grid .source-opt[data-idx="${idx}"]`).classList.add('selected');
}

function closeTxModal(){
  document.getElementById('tx-modal').classList.remove('active');
}
document.getElementById('tx-modal').addEventListener('click', (e)=>{
  if(e.target.id === 'tx-modal') closeTxModal();
});
document.getElementById('wallet-picker-modal').addEventListener('click', (e)=>{
  if(e.target.id === 'wallet-picker-modal') closeWalletPicker();
});

function submitTx(){
  const name = document.getElementById('tx-name').value.trim();
  const amount = Number(document.getElementById('tx-amount').value);

  if(!txSelectedSource){ showToast('Pilih sumber dana dulu'); return; }
  if(!name){ showToast('Isi nama transaksi'); return; }
  if(!amount || amount <= 0){ showToast('Isi nominal yang benar'); return; }

  // Update balance
  if(txSelectedSource.type === 'cash'){
    currentData.balances.cash += (txType === 'in' ? amount : -amount);
  } else if(txSelectedSource.type === 'bank'){
    currentData.balances.bank[txSelectedSource.id] += (txType === 'in' ? amount : -amount);
  } else if(txSelectedSource.type === 'ewallet'){
    currentData.balances.ewallet[txSelectedSource.id] += (txType === 'in' ? amount : -amount);
  }

  currentData.transactions.unshift({
    id: uid(),
    type: txType,
    amount: amount,
    name: name,
    source: { type: txSelectedSource.type, id: txSelectedSource.id, name: txSelectedSource.name },
    date: new Date().toISOString()
  });

  saveUserData(currentUser, currentData);
  closeTxModal();
  showToast(txType === 'in' ? 'Pemasukan tersimpan' : 'Dibeli — pengeluaran tercatat');
  refreshHome();
}

/* =========================================================
   HISTORY
   ========================================================= */
function filterHistory(mode, el){
  historyFilterMode = mode;
  document.querySelectorAll('.hist-filter .chip').forEach(c=>c.classList.remove('selected'));
  el.classList.add('selected');
  refreshHistory();
}

function txIconSVG(type){
  if(type === 'in') return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M12 19V5M6 11l6-6 6 6" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M6 13l6 6 6-6" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

function refreshHistory(){
  const list = document.getElementById('history-list');
  let txs = currentData.transactions.slice();
  if(historyFilterMode !== 'all') txs = txs.filter(t => t.type === historyFilterMode);

  const sumIn = currentData.transactions.filter(t=>t.type==='in').reduce((s,t)=>s+t.amount,0);
  const sumOut = currentData.transactions.filter(t=>t.type==='out').reduce((s,t)=>s+t.amount,0);
  document.getElementById('hist-sum-in').textContent = fmtRupiah(sumIn);
  document.getElementById('hist-sum-out').textContent = fmtRupiah(sumOut);

  if(txs.length === 0){
    list.innerHTML = `<div class="empty-state">
      <svg width="56" height="56" viewBox="0 0 24 24" fill="none"><path d="M3 3v6h6M3 9a9 9 0 1 1 2.6 6.4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
      <p>Belum ada transaksi tercatat</p>
    </div>`;
    return;
  }

  list.innerHTML = txs.map(t => {
    const d = new Date(t.date);
    const dateStr = d.toLocaleDateString('id-ID', { day:'numeric', month:'short', year:'numeric' });
    const timeStr = d.toLocaleTimeString('id-ID', { hour:'2-digit', minute:'2-digit' });
    return `<div class="hist-item">
      <div class="hist-icon ${t.type}">${txIconSVG(t.type)}</div>
      <div class="hist-info">
        <div class="hist-name">${escapeHtml(t.name)}</div>
        <div class="hist-meta">${dateStr}, ${timeStr} · ${escapeHtml(t.source.name)}</div>
      </div>
      <div class="hist-amt ${t.type}">${t.type==='in'?'+':'-'}${fmtRupiah(t.amount)}</div>
      <button class="hist-del" onclick="deleteTx('${t.id}')">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
      </button>
    </div>`;
  }).join('');
}

function deleteTx(id){
  const idx = currentData.transactions.findIndex(t=>t.id===id);
  if(idx === -1) return;
  const t = currentData.transactions[idx];
  // revert balance
  const sign = t.type === 'in' ? -1 : 1;
  if(t.source.type === 'cash'){ currentData.balances.cash += sign * t.amount; }
  else if(t.source.type === 'bank' && t.source.id){ currentData.balances.bank[t.source.id] = (currentData.balances.bank[t.source.id]||0) + sign*t.amount; }
  else if(t.source.type === 'ewallet' && t.source.id){ currentData.balances.ewallet[t.source.id] = (currentData.balances.ewallet[t.source.id]||0) + sign*t.amount; }

  currentData.transactions.splice(idx,1);
  saveUserData(currentUser, currentData);
  refreshHistory();
  refreshHome();
  showToast('Transaksi dihapus');
}

/* =========================================================
   WALLETS TAB
   ========================================================= */
function refreshWallets(){
  const bankWrap = document.getElementById('wallet-bank-list');
  bankWrap.innerHTML = '';
  if(currentData.banks.length === 0){
    bankWrap.innerHTML = '<p class="sub">Belum ada rekening bank.</p>';
  }
  currentData.banks.forEach((b) => {
    const logoHTML = b.logo ? `<img src="${b.logo}" class="wlogo" alt="">` : `<span class="wlogo wlogo-fallback">${escapeHtml((b.name||'?').charAt(0).toUpperCase())}</span>`;
    const row = document.createElement('div');
    row.className = 'row-item';
    row.innerHTML = `${logoHTML}<span class="rname">${escapeHtml(b.name)}</span>
      <span style="font-family:var(--mono); font-weight:800; margin-right:8px;">${fmtRupiah(currentData.balances.bank[b.id]||0)}</span>
      <button class="rdel" onclick="confirmDeleteWallet('bank','${b.id}')" title="Hapus">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0l-1 14a2 2 0 01-2 2H7a2 2 0 01-2-2L4 6h16z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>`;
    bankWrap.appendChild(row);
  });

  const ewWrap = document.getElementById('wallet-ewallet-list');
  ewWrap.innerHTML = '';
  if(currentData.ewallets.length === 0){
    ewWrap.innerHTML = '<p class="sub">Belum ada e-wallet.</p>';
  }
  currentData.ewallets.forEach((b) => {
    const logoHTML = b.logo ? `<img src="${b.logo}" class="wlogo" alt="">` : `<span class="wlogo wlogo-fallback">${escapeHtml((b.name||'?').charAt(0).toUpperCase())}</span>`;
    const row = document.createElement('div');
    row.className = 'row-item';
    row.innerHTML = `${logoHTML}<span class="rname">${escapeHtml(b.name)}</span>
      <span style="font-family:var(--mono); font-weight:800; margin-right:8px;">${fmtRupiah(currentData.balances.ewallet[b.id]||0)}</span>
      <button class="rdel" onclick="confirmDeleteWallet('ewallet','${b.id}')" title="Hapus">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0l-1 14a2 2 0 01-2 2H7a2 2 0 01-2-2L4 6h16z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>`;
    ewWrap.appendChild(row);
  });

  document.getElementById('wallet-cash-display').textContent = fmtRupiah(currentData.balances.cash||0);
}

/* Hapus bank/e-wallet. Kalau masih ada transaksi yang tercatat lewat
   sumber ini, transaksi itu tetap disimpan di riwayat (histori tidak
   dihapus) tapi kehilangan tautan ke walletnya -- source.name tetap
   tampil apa adanya di riwayat lama, hanya wallet & saldonya yang hilang. */
function confirmDeleteWallet(kind, id){
  const list = kind === 'bank' ? currentData.banks : currentData.ewallets;
  const item = list.find(w => w.id === id);
  if(!item) return;

  const balances = kind === 'bank' ? currentData.balances.bank : currentData.balances.ewallet;
  const bal = balances[id] || 0;
  const balWarn = bal !== 0 ? ` Saldo saat ini ${fmtRupiah(bal)} akan ikut hilang dari total.` : '';

  if(!confirm(`Hapus ${item.name}?${balWarn} Riwayat transaksi lama tetap tersimpan.`)) return;

  const idx = list.findIndex(w => w.id === id);
  if(idx > -1) list.splice(idx, 1);
  delete balances[id];

  saveUserData(currentUser, currentData);
  refreshWallets();
  refreshHome();
  showToast(`${item.name} dihapus`);
}

/* Tombol + di tab Dompet: tanya bank atau e-wallet dulu, lalu buka picker logo */
function openAddWalletModal(){
  const body = document.getElementById('wallet-picker-body');
  body.innerHTML = `
    <h3 class="modal-title">Tambah dompet</h3>
    <p class="modal-sub">Mau tambah apa?</p>
    <div class="sub-select" style="margin-bottom:4px;">
      <div class="chip" onclick="openWalletPicker('wallets-bank')">Bank</div>
      <div class="chip" onclick="openWalletPicker('wallets-ewallet')">E-wallet</div>
    </div>
  `;
  document.getElementById('wallet-picker-modal').classList.add('active');
}

/* =========================================================
   SETTINGS TAB
   ========================================================= */
function refreshSettings(){
  document.getElementById('set-username').textContent = currentUser;
  const labels = { gaji:'Gaji', usaha:'Usaha', keduanya:'Gaji & usaha' };
  document.getElementById('set-incometype').textContent = labels[currentData.incomeType] || '-';
  document.getElementById('set-txcount').textContent = currentData.transactions.length;
}

/* =========================================================
   PDF RECEIPT
   ========================================================= */
function printReceipt(){
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit:'mm', format:[80, 200 + currentData.transactions.length*6] });

  let y = 10;
  doc.setFont('courier', 'bold');
  doc.setFontSize(12);
  doc.text('KEUANGANPRIBADI', 40, y, { align:'center' }); y += 5;
  doc.setFontSize(8);
  doc.setFont('courier','normal');
  doc.text(`Akun: ${currentUser}`, 40, y, { align:'center' }); y += 4;
  doc.text(new Date().toLocaleString('id-ID'), 40, y, { align:'center' }); y += 4;
  doc.text('--------------------------------', 40, y, { align:'center' }); y += 5;

  const txs = currentData.transactions.slice().reverse();
  let sumIn = 0, sumOut = 0;

  txs.forEach(t => {
    if(t.type==='in') sumIn += t.amount; else sumOut += t.amount;
    const d = new Date(t.date);
    const dateStr = d.toLocaleDateString('id-ID', {day:'2-digit',month:'2-digit',year:'2-digit'}) + ' ' + d.toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit'});
    doc.setFontSize(7.5);
    doc.text(dateStr + '  ' + (t.source.name||''), 5, y); y += 3.6;
    doc.setFontSize(8.5);
    const sign = t.type === 'in' ? '+' : '-';
    const nameLine = t.name.length > 20 ? t.name.slice(0,20)+'..' : t.name;
    doc.text(nameLine, 5, y);
    doc.text(sign + t.amount.toLocaleString('id-ID'), 75, y, { align:'right' });
    y += 5;
  });

  doc.text('--------------------------------', 40, y, { align:'center' }); y += 5;
  doc.setFont('courier','bold');
  doc.setFontSize(9);
  doc.text('TOTAL MASUK', 5, y); doc.text(sumIn.toLocaleString('id-ID'), 75, y, {align:'right'}); y += 5;
  doc.text('TOTAL KELUAR', 5, y); doc.text(sumOut.toLocaleString('id-ID'), 75, y, {align:'right'}); y += 5;
  doc.text('SALDO AKHIR', 5, y); doc.text(totalBalance().toLocaleString('id-ID'), 75, y, {align:'right'}); y += 8;

  doc.setFont('courier','normal');
  doc.setFontSize(7.5);
  doc.text('Terima kasih sudah mencatat', 40, y, {align:'center'}); y += 4;
  doc.text('keuanganmu dengan rapi :)', 40, y, {align:'center'});

  doc.save(`struk-${currentUser}-${todayKey()}.pdf`);
  showToast('Struk PDF diunduh');
}

/* =========================================================
   AUTO-UPDATE (Service Worker)
   Tujuan: begitu ada versi baru ter-deploy di GitHub Pages, app
   mendeteksinya sendiri tanpa kamu perlu naikkan nomor versi apa
   pun secara manual — dan tanpa user perlu clear cache Chrome.

   Cara kerja sekarang: sw.js pakai strategi network-first untuk
   semua file inti (index.html, app.js, manifest.json) dengan
   cache:'no-store', jadi begitu user online, file yang dipakai
   SELALU versi terbaru langsung dari server — bukan dari cache.
   Cache di sw.js cuma dipakai sebagai fallback offline.
   Jadi kamu tinggal upload ulang file ke GitHub Pages, dan versi
   baru langsung kepakai di request berikutnya. Tidak perlu ubah
   apa pun di sw.js setiap deploy.
   ========================================================= */
let swRegistration = null;

function setUpdateBtnState(mode){
  const btn = document.getElementById('update-check-btn');
  if(!btn) return;
  btn.classList.remove('spinning','has-update');
  if(mode === 'checking') btn.classList.add('spinning');
  if(mode === 'available') btn.classList.add('has-update');
}

function showUpdateToast(text){
  const el = document.getElementById('update-toast');
  const txt = document.getElementById('update-toast-text');
  if(!el) return;
  txt.textContent = text;
  el.classList.add('show');
}
function hideUpdateToast(){
  const el = document.getElementById('update-toast');
  if(el) el.classList.remove('show');
}

function initServiceWorker(){
  if(!('serviceWorker' in navigator)) return;

  const versionLabel = document.getElementById('app-version-label');
  if(versionLabel) versionLabel.textContent = 'Auto-update aktif';

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').then((reg) => {
      swRegistration = reg;
    }).catch(()=>{});
  });
}

// Tombol ↻ manual: karena file inti (index.html/app.js) sudah
// network-first, cara paling pasti untuk "cek update sekarang" adalah
// muat ulang halaman langsung dari server.
function manualCheckUpdate(){
  setUpdateBtnState('checking');
  showToast('Mengecek pembaruan…');
  setTimeout(() => {
    window.location.reload();
  }, 400);
}

/* =========================================================
   BACKUP MANUAL (Export / Import)
   Data disimpan di localStorage browser, jadi akan ikut hilang
   kalau app di-uninstall dari HP. Fitur ini memungkinkan user
   men-download seluruh datanya jadi file .json, dan memulihkannya
   lagi nanti (misal setelah reinstall / ganti HP).
   ========================================================= */
function exportBackup(){
  if(!currentUser || !currentData){ showToast('Belum ada akun yang login'); return; }

  const users = getUsers();
  const userRecord = users[currentUser];

  const backup = {
    app: 'KeuanganPribadi',
    backupVersion: 1,
    exportedAt: new Date().toISOString(),
    username: currentUser,
    userRecord: userRecord,
    data: currentData
  };

  const json = JSON.stringify(backup, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `backup-keuanganpribadi-${currentUser}-${todayKey()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  showToast('Backup berhasil diunduh');
}

function triggerImportBackup(){
  document.getElementById('import-file-input').click();
}

function handleImportFile(event){
  const file = event.target.files[0];
  if(!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    let backup;
    try{
      backup = JSON.parse(e.target.result);
    }catch(err){
      showToast('File backup tidak valid');
      event.target.value = '';
      return;
    }

    if(!backup || !backup.username || !backup.data){
      showToast('File backup tidak valid');
      event.target.value = '';
      return;
    }

    const targetUsername = backup.username;
    const users = getUsers();
    const alreadyExists = !!users[targetUsername];

    const doImport = () => {
      if(backup.userRecord){
        users[targetUsername] = backup.userRecord;
        saveUsers(users);
      }
      saveUserData(targetUsername, backup.data);
      showToast(`Backup akun "${targetUsername}" berhasil dipulihkan`);
      event.target.value = '';

      // Kalau akun yang dipulihkan adalah akun yang sedang login, refresh tampilan
      if(currentUser === targetUsername){
        currentData = getUserData(targetUsername);
        refreshHome();
      }
    };

    if(alreadyExists){
      const ok = confirm(`Akun "${targetUsername}" sudah ada di perangkat ini. Timpa dengan data dari file backup?`);
      if(!ok){ event.target.value = ''; return; }
    }
    doImport();
  };
  reader.onerror = () => {
    showToast('Gagal membaca file backup');
    event.target.value = '';
  };
  reader.readAsText(file);
}


(function init(){
  initServiceWorker();
  const session = localStorage.getItem(LS_SESSION);
  if(session){
    const data = getUserData(session);
    if(data){
      currentUser = session;
      currentData = data;
      if(!currentData.incomeType){
        goTo('screen-ob-income');
      } else {
        enterApp();
      }
      return;
    }
  }
  goTo('screen-login');
})();
