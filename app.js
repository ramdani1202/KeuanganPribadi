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
    return JSON.parse(raw);
  }catch(e){ return null; }
}
function saveUserData(username, data){
  localStorage.setItem(dataKey(username), JSON.stringify(data));
}
function defaultUserData(){
  return {
    incomeType: null,
    banks: [],
    ewallets: [],
    balances: { bank:{}, ewallet:{}, cash:0 },
    transactions: [] // {id, type:'in'|'out', amount, name, source:{type,name}, date(ISO), category?}
  };
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

function renderOBBankList(){
  const wrap = document.getElementById('ob-bank-list');
  wrap.innerHTML = '';
  currentData.banks.forEach((b, i) => {
    const row = document.createElement('div');
    row.className = 'row-item';
    row.innerHTML = `<span class="rname">${escapeHtml(b)}</span>
      <button class="rdel" onclick="removeBankOB(${i})">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
      </button>`;
    wrap.appendChild(row);
  });
}
function addBankOB(){
  const input = document.getElementById('ob-bank-input');
  const val = input.value.trim();
  if(!val) return;
  currentData.banks.push(val);
  input.value = '';
  renderOBBankList();
}
function removeBankOB(i){
  currentData.banks.splice(i,1);
  renderOBBankList();
}

function renderOBEwalletList(){
  const wrap = document.getElementById('ob-ewallet-list');
  wrap.innerHTML = '';
  currentData.ewallets.forEach((b, i) => {
    const row = document.createElement('div');
    row.className = 'row-item';
    row.innerHTML = `<span class="rname">${escapeHtml(b)}</span>
      <button class="rdel" onclick="removeEwalletOB(${i})">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
      </button>`;
    wrap.appendChild(row);
  });
}
function addEwalletOB(){
  const input = document.getElementById('ob-ewallet-input');
  const val = input.value.trim();
  if(!val) return;
  currentData.ewallets.push(val);
  input.value = '';
  renderOBEwalletList();
}
function removeEwalletOB(i){
  currentData.ewallets.splice(i,1);
  renderOBEwalletList();
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
    field.innerHTML = `<label>${escapeHtml(b)}</label>
      <div class="amount-input-wrap" style="margin-bottom:0;">
        <span class="rp">Rp</span>
        <input type="number" inputmode="numeric" placeholder="0" data-bank="${escapeHtml(b)}" class="ob-bank-balance-input" value="${currentData.balances.bank[b]||''}">
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
    field.innerHTML = `<label>${escapeHtml(b)}</label>
      <div class="amount-input-wrap" style="margin-bottom:0;">
        <span class="rp">Rp</span>
        <input type="number" inputmode="numeric" placeholder="0" data-ewallet="${escapeHtml(b)}" class="ob-ewallet-balance-input" value="${currentData.balances.ewallet[b]||''}">
      </div>`;
    wrap.appendChild(field);
  });
}

function collectOBBankBalances(){
  document.querySelectorAll('.ob-bank-balance-input').forEach(inp => {
    const bank = inp.getAttribute('data-bank');
    currentData.balances.bank[bank] = Number(inp.value) || 0;
  });
}
function collectOBEwalletBalances(){
  document.querySelectorAll('.ob-ewallet-balance-input').forEach(inp => {
    const ew = inp.getAttribute('data-ewallet');
    currentData.balances.ewallet[ew] = Number(inp.value) || 0;
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
  document.getElementById('home-username').textContent = currentUser;
  const hr = new Date().getHours();
  document.getElementById('home-greet').textContent = hr < 11 ? 'Selamat pagi,' : hr < 15 ? 'Selamat siang,' : hr < 18 ? 'Selamat sore,' : 'Selamat malam,';
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
  Object.values(currentData.balances.bank).forEach(v => t += Number(v)||0);
  Object.values(currentData.balances.ewallet).forEach(v => t += Number(v)||0);
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
  if(type === 'bank') return `<svg class="sicon" viewBox="0 0 24 24" fill="none"><path d="M3 10l9-6 9 6" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><rect x="4" y="10" width="16" height="9" stroke="currentColor" stroke-width="1.8"/><path d="M2 20h20" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`;
  if(type === 'ewallet') return `<svg class="sicon" viewBox="0 0 24 24" fill="none"><rect x="3" y="6" width="18" height="13" rx="2" stroke="currentColor" stroke-width="1.8"/><path d="M16 12.5h2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M3 9h18" stroke="currentColor" stroke-width="1.8"/></svg>`;
  return `<svg class="sicon" viewBox="0 0 24 24" fill="none"><rect x="2" y="6" width="20" height="12" rx="2" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="12" r="2.5" stroke="currentColor" stroke-width="1.8"/></svg>`;
}

function openTxModal(type){
  txType = type;
  txSelectedSource = null;
  const body = document.getElementById('tx-modal-body');

  // Build source list
  let sources = [];
  currentData.banks.forEach(b => sources.push({type:'bank', name:b, bal: currentData.balances.bank[b]||0}));
  currentData.ewallets.forEach(b => sources.push({type:'ewallet', name:b, bal: currentData.balances.ewallet[b]||0}));
  sources.push({type:'cash', name:'Cash', bal: currentData.balances.cash||0});

  const title = type === 'in' ? 'Catat pemasukan' : 'Catat pengeluaran';
  const sub = type === 'in' ? 'Uang masuk lewat mana?' : 'Bayar pakai apa?';

  let sourceGridHTML = '<div class="source-grid" id="tx-source-grid">';
  sources.forEach((s, idx) => {
    sourceGridHTML += `<div class="source-opt" data-idx="${idx}" onclick="selectTxSource(${idx})">
      ${sourceIconSVG(s.type)}
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
    currentData.balances.bank[txSelectedSource.name] += (txType === 'in' ? amount : -amount);
  } else if(txSelectedSource.type === 'ewallet'){
    currentData.balances.ewallet[txSelectedSource.name] += (txType === 'in' ? amount : -amount);
  }

  currentData.transactions.unshift({
    id: uid(),
    type: txType,
    amount: amount,
    name: name,
    source: { type: txSelectedSource.type, name: txSelectedSource.name },
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
  else if(t.source.type === 'bank'){ currentData.balances.bank[t.source.name] = (currentData.balances.bank[t.source.name]||0) + sign*t.amount; }
  else if(t.source.type === 'ewallet'){ currentData.balances.ewallet[t.source.name] = (currentData.balances.ewallet[t.source.name]||0) + sign*t.amount; }

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
  currentData.banks.forEach((b,i) => {
    const row = document.createElement('div');
    row.className = 'row-item';
    row.innerHTML = `<span class="rname">${escapeHtml(b)}</span>
      <span style="font-family:var(--mono); font-weight:800; margin-right:8px;">${fmtRupiah(currentData.balances.bank[b]||0)}</span>`;
    bankWrap.appendChild(row);
  });

  const ewWrap = document.getElementById('wallet-ewallet-list');
  ewWrap.innerHTML = '';
  if(currentData.ewallets.length === 0){
    ewWrap.innerHTML = '<p class="sub">Belum ada e-wallet.</p>';
  }
  currentData.ewallets.forEach((b,i) => {
    const row = document.createElement('div');
    row.className = 'row-item';
    row.innerHTML = `<span class="rname">${escapeHtml(b)}</span>
      <span style="font-family:var(--mono); font-weight:800; margin-right:8px;">${fmtRupiah(currentData.balances.ewallet[b]||0)}</span>`;
    ewWrap.appendChild(row);
  });

  document.getElementById('wallet-cash-display').textContent = fmtRupiah(currentData.balances.cash||0);
}

function addBankLive(){
  const input = document.getElementById('wallet-bank-input');
  const val = input.value.trim();
  if(!val) return;
  currentData.banks.push(val);
  currentData.balances.bank[val] = 0;
  saveUserData(currentUser, currentData);
  input.value = '';
  refreshWallets();
  showToast('Bank ditambahkan');
}
function addEwalletLive(){
  const input = document.getElementById('wallet-ewallet-input');
  const val = input.value.trim();
  if(!val) return;
  currentData.ewallets.push(val);
  currentData.balances.ewallet[val] = 0;
  saveUserData(currentUser, currentData);
  input.value = '';
  refreshWallets();
  showToast('E-wallet ditambahkan');
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
  doc.text('CATATAN UANG', 40, y, { align:'center' }); y += 5;
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
   mendeteksinya sendiri, download di background, lalu reload
   otomatis — tanpa user perlu clear cache/data Chrome manual.
   ========================================================= */
const APP_DISPLAY_VERSION = 'v3';
let swRegistration = null;
let updateReloadTriggered = false;

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
  if(versionLabel) versionLabel.textContent = 'Versi aplikasi ' + APP_DISPLAY_VERSION;

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').then((reg) => {
      swRegistration = reg;

      // Kalau ada worker baru yang sudah "waiting" (selesai di-download
      // tapi belum aktif), langsung aktifkan.
      if(reg.waiting){
        activateNewServiceWorker(reg.waiting);
      }

      // Saat SW baru ketemu & sedang di-install (state berubah)
      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing;
        if(!newWorker) return;
        setUpdateBtnState('checking');
        newWorker.addEventListener('statechange', () => {
          if(newWorker.state === 'installed' && navigator.serviceWorker.controller){
            // Versi baru siap dipakai -> langsung aktifkan & reload
            setUpdateBtnState('available');
            activateNewServiceWorker(newWorker);
          }
        });
      });
    }).catch(()=>{});

    // Begitu controller berganti (SW baru sudah ambil alih), reload
    // sekali supaya semua file (html/js) yang tampil adalah versi baru.
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if(updateReloadTriggered) return;
      updateReloadTriggered = true;
      showUpdateToast('Pembaruan siap, memuat ulang…');
      setTimeout(() => window.location.reload(), 500);
    });
  });

  // Cek update tiap kali app dibuka lagi / tab kembali aktif / balik dari background
  document.addEventListener('visibilitychange', () => {
    if(document.visibilityState === 'visible') checkForUpdate();
  });
  window.addEventListener('focus', checkForUpdate);
  window.addEventListener('pageshow', checkForUpdate);

  // Cek sekali saat pertama kali load
  checkForUpdate();
}

function activateNewServiceWorker(worker){
  showUpdateToast('Memperbarui aplikasi…');
  worker.postMessage('SKIP_WAITING');
}

function checkForUpdate(){
  if(!swRegistration) return;
  setUpdateBtnState('checking');
  swRegistration.update().catch(()=>{}).finally(() => {
    // Kasih jeda kecil biar animasi spin terlihat natural, lalu balik normal
    // kalau memang tidak ada versi baru (updatefound tidak akan terpanggil).
    setTimeout(() => {
      if(!document.getElementById('update-check-btn').classList.contains('has-update')){
        setUpdateBtnState('idle');
      }
    }, 900);
  });
}

function manualCheckUpdate(){
  if(!('serviceWorker' in navigator)){ showToast('Perangkat tidak mendukung auto-update'); return; }
  showToast('Mengecek pembaruan…');
  checkForUpdate();
}

/* =========================================================
   INIT
   ========================================================= */
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
