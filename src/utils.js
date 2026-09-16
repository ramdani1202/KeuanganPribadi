// ============ UTILITIES ============
function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return hash.toString(36);
}

function fmtRupiah(n) {
  n = Math.round(Number(n) || 0);
  return 'Rp' + n.toLocaleString('id-ID');
}

function todayKey(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function defaultUserData() {
  return {
    incomeType: null,
    banks: [],
    ewallets: [],
    balances: { bank: {}, ewallet: {}, cash: 0 },
    transactions: []
  };
}

// ============ STORAGE ============
const LS_USERS = 'cu_users';
const LS_SESSION = 'cu_session';
const dataKey = (u) => `cu_data_${u}`;

function getUsers() {
  try { return JSON.parse(localStorage.getItem(LS_USERS)) || {}; }
  catch { return {}; }
}
function saveUsers(u) { localStorage.setItem(LS_USERS, JSON.stringify(u)); }

function getUserData(username) {
  try {
    const raw = localStorage.getItem(dataKey(username));
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
function saveUserData(username, data) {
  localStorage.setItem(dataKey(username), JSON.stringify(data));
}
function getSession() { return localStorage.getItem(LS_SESSION); }
function setSession(username) { localStorage.setItem(LS_SESSION, username); }
function clearSession() { localStorage.removeItem(LS_SESSION); }
function deleteUserData(username) { localStorage.removeItem(dataKey(username)); }

// ============ PDF RECEIPT ============
function printReceipt(currentUser, data, totalBal) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: [80, 200 + data.transactions.length * 6] });

  let y = 10;
  doc.setFont('courier', 'bold');
  doc.setFontSize(12);
  doc.text('CATATAN UANG', 40, y, { align: 'center' }); y += 5;
  doc.setFontSize(8);
  doc.setFont('courier', 'normal');
  doc.text(`Akun: ${currentUser}`, 40, y, { align: 'center' }); y += 4;
  doc.text(new Date().toLocaleString('id-ID'), 40, y, { align: 'center' }); y += 4;
  doc.text('--------------------------------', 40, y, { align: 'center' }); y += 5;

  const txs = data.transactions.slice().reverse();
  let sumIn = 0, sumOut = 0;

  txs.forEach(t => {
    if (t.type === 'in') sumIn += t.amount; else sumOut += t.amount;
    const d = new Date(t.date);
    const dateStr = d.toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: '2-digit' }) +
      ' ' + d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
    doc.setFontSize(7.5);
    doc.text(dateStr + '  ' + (t.source.name || ''), 5, y); y += 3.6;
    doc.setFontSize(8.5);
    const sign = t.type === 'in' ? '+' : '-';
    const nameLine = t.name.length > 20 ? t.name.slice(0, 20) + '..' : t.name;
    doc.text(nameLine, 5, y);
    doc.text(sign + t.amount.toLocaleString('id-ID'), 75, y, { align: 'right' });
    y += 5;
  });

  doc.text('--------------------------------', 40, y, { align: 'center' }); y += 5;
  doc.setFont('courier', 'bold');
  doc.setFontSize(9);
  doc.text('TOTAL MASUK', 5, y); doc.text(sumIn.toLocaleString('id-ID'), 75, y, { align: 'right' }); y += 5;
  doc.text('TOTAL KELUAR', 5, y); doc.text(sumOut.toLocaleString('id-ID'), 75, y, { align: 'right' }); y += 5;
  doc.text('SALDO AKHIR', 5, y); doc.text(totalBal.toLocaleString('id-ID'), 75, y, { align: 'right' }); y += 8;

  doc.setFont('courier', 'normal');
  doc.setFontSize(7.5);
  doc.text('Terima kasih sudah mencatat', 40, y, { align: 'center' }); y += 4;
  doc.text('keuanganmu dengan rapi :)', 40, y, { align: 'center' });

  doc.save(`struk-${currentUser}-${todayKey()}.pdf`);
}
