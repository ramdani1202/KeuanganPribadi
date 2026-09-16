// ============ TAB BAR ============
function TabBar({ active, onNavigate }) {
  const tabs = [
    { key: 'home', label: 'Beranda', Icon: IconHome },
    { key: 'history', label: 'Riwayat', Icon: IconHistory },
    { key: 'wallets', label: 'Dompet', Icon: IconWallet },
    { key: 'settings', label: 'Pengaturan', Icon: IconSettings }
  ];
  return (
    <div className="tabbar">
      {tabs.map(({ key, label, Icon }) => (
        <button
          key={key}
          className={`tab-btn ${active === key ? 'active' : ''}`}
          onClick={() => onNavigate(key)}
        >
          <Icon />
          {label}
        </button>
      ))}
    </div>
  );
}

// ============ TOAST ============
function Toast() {
  const { toast } = useApp();
  return <div className={`toast ${toast ? 'show' : ''}`}>{toast}</div>;
}

// ============ TRANSACTION MODAL ============
function TxModal({ type, onClose }) {
  const { data, addTransaction, showToast } = useApp();
  const [selectedSource, setSelectedSource] = React.useState(null);
  const [name, setName] = React.useState('');
  const [amount, setAmount] = React.useState('');

  if (!type || !data) return null;

  const sources = [
    ...data.banks.map(b => ({ type: 'bank', name: b, bal: data.balances.bank[b] || 0, Icon: IconBank })),
    ...data.ewallets.map(b => ({ type: 'ewallet', name: b, bal: data.balances.ewallet[b] || 0, Icon: IconEwallet })),
    { type: 'cash', name: 'Cash', bal: data.balances.cash || 0, Icon: IconCash }
  ];

  const title = type === 'in' ? 'Catat pemasukan' : 'Catat pengeluaran';
  const sub = type === 'in' ? 'Uang masuk lewat mana?' : 'Bayar pakai apa?';

  const handleSubmit = () => {
    const amt = Number(amount);
    if (!selectedSource) { showToast('Pilih sumber dana dulu'); return; }
    if (!name.trim()) { showToast('Isi nama transaksi'); return; }
    if (!amt || amt <= 0) { showToast('Isi nominal yang benar'); return; }

    addTransaction(type, selectedSource, name.trim(), amt);
    showToast(type === 'in' ? 'Pemasukan tersimpan' : 'Dibeli — pengeluaran tercatat');
    onClose();
  };

  return (
    <div className="modal-overlay active" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-sheet">
        <div className="modal-handle" />
        <h3 className="modal-title">{title}</h3>
        <p className="modal-sub">{sub}</p>

        <div className="source-grid">
          {sources.map((s, idx) => (
            <div
              key={idx}
              className={`source-opt ${selectedSource === s ? 'selected' : ''}`}
              onClick={() => setSelectedSource(s)}
            >
              <s.Icon />
              <span className="sname">{s.name}</span>
              <span className="samt">{fmtRupiah(s.bal)}</span>
            </div>
          ))}
        </div>

        <div className="field">
          <label>{type === 'in' ? 'Nama pemasukan' : 'Nama pengeluaran'}</label>
          <input
            type="text"
            placeholder={type === 'in' ? 'cth. Gaji, Jual barang' : 'cth. Makan siang, Bensin'}
            value={name} onChange={e => setName(e.target.value)}
          />
        </div>
        <div className="amount-input-wrap">
          <span className="rp">Rp</span>
          <input type="number" placeholder="0" inputMode="numeric" value={amount} onChange={e => setAmount(e.target.value)} />
        </div>
        <button className={`btn ${type === 'in' ? 'btn-primary' : 'btn-buy'}`} onClick={handleSubmit}>
          {type === 'in' ? 'Simpan pemasukan' : 'Buy — catat pengeluaran'}
        </button>
      </div>
    </div>
  );
}
