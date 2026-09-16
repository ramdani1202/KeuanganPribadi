// ============ LOGIN ============
function LoginPage({ onNavigate }) {
  const { login, showToast } = useApp();
  const [username, setUsername] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [checking, setChecking] = React.useState(false);

  const handleLogin = () => {
    const res = login(username, password);
    if (!res.ok) { showToast(res.msg); return; }
    setPassword('');
    onNavigate(res.needsOnboarding ? 'ob-income' : 'home');
  };

  const handleManualCheck = () => {
    setChecking(true);
    showToast('Mengecek pembaruan…');
    if (window._cuCheckUpdate) window._cuCheckUpdate();
    setTimeout(() => setChecking(false), 900);
  };

  return (
    <section className="screen active">
      <div className="top" style={{ justifyContent: 'flex-end', paddingBottom: 0 }}>
        <button className={`update-btn ${checking ? 'spinning' : ''}`} onClick={handleManualCheck} title="Cek pembaruan">
          <IconRefresh />
        </button>
      </div>
      <div className="content center-content">
        <div style={{ textAlign: 'center', marginBottom: 8 }}>
          <div style={{ marginBottom: 14 }}><IconLogo /></div>
          <h2 className="title" style={{ marginBottom: 0 }}>Catatan Uang</h2>
          <p className="sub">Masuk ke akunmu untuk lanjut mencatat</p>
        </div>
        <div className="field">
          <label>Nama akun</label>
          <input type="text" placeholder="cth. Andi" autoComplete="off" value={username} onChange={e => setUsername(e.target.value)} />
        </div>
        <div className="field">
          <label>Kata sandi</label>
          <input type="password" placeholder="••••••" value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleLogin()} />
        </div>
        <button className="btn btn-primary" onClick={handleLogin}>Masuk</button>
        <p className="link-row">Belum punya akun? <a onClick={() => onNavigate('register')}>Buat akun baru</a></p>
      </div>
    </section>
  );
}

// ============ REGISTER ============
function RegisterPage({ onNavigate }) {
  const { register, showToast } = useApp();
  const [username, setUsername] = React.useState('');
  const [p1, setP1] = React.useState('');
  const [p2, setP2] = React.useState('');

  const handleRegister = () => {
    const res = register(username, p1, p2);
    if (!res.ok) { showToast(res.msg); return; }
    showToast('Akun dibuat! Yuk lengkapi datamu');
    onNavigate('ob-income');
  };

  return (
    <section className="screen active">
      <div className="top">
        <button className="back-btn" onClick={() => onNavigate('login')}><IconBack /></button>
        <h1>Akun baru</h1>
        <div style={{ width: 38 }} />
      </div>
      <div className="content center-content">
        <h2 className="title">Buat akun</h2>
        <p className="sub">Tiap akun punya data sendiri-sendiri, terpisah total dari akun lain.</p>
        <div className="field">
          <label>Nama akun</label>
          <input type="text" placeholder="cth. Andi" autoComplete="off" value={username} onChange={e => setUsername(e.target.value)} />
        </div>
        <div className="field">
          <label>Buat kata sandi</label>
          <input type="password" placeholder="min. 4 karakter" value={p1} onChange={e => setP1(e.target.value)} />
        </div>
        <div className="field">
          <label>Ulangi kata sandi</label>
          <input type="password" placeholder="ulangi sandi" value={p2} onChange={e => setP2(e.target.value)} />
        </div>
        <button className="btn btn-primary" onClick={handleRegister}>Buat akun & lanjut</button>
      </div>
    </section>
  );
}

// ============ ONBOARDING ============
function ProgressDots({ step }) {
  return (
    <div className="progress-dots">
      {[0, 1, 2, 3, 4].map(i => <span key={i} className={i < step ? 'done' : ''} />)}
    </div>
  );
}

function ListEditor({ items, onAdd, onRemove, placeholder }) {
  const [val, setVal] = React.useState('');
  const add = () => {
    if (!val.trim()) return;
    onAdd(val.trim());
    setVal('');
  };
  return (
    <React.Fragment>
      <div className="stack">
        {items.map((item, i) => (
          <div className="row-item" key={i}>
            <span className="rname">{item}</span>
            <button className="rdel" onClick={() => onRemove(i)}><IconClose size={18} /></button>
          </div>
        ))}
      </div>
      <div className="add-inline">
        <input type="text" placeholder={placeholder} value={val}
          onChange={e => setVal(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && add()} />
        <button onClick={add}>+</button>
      </div>
    </React.Fragment>
  );
}

function OnboardingPage({ step, onNavigate, obData }) {
  const { completeOnboarding, showToast } = useApp();
  const [incomeType, setIncomeType] = React.useState(obData.incomeType || null);
  const [banks, setBanks] = React.useState(obData.banks || []);
  const [ewallets, setEwallets] = React.useState(obData.ewallets || []);
  const [bankBalances, setBankBalances] = React.useState(obData.bankBalances || {});
  const [ewalletBalances, setEwalletBalances] = React.useState(obData.ewalletBalances || {});
  const [cash, setCash] = React.useState(obData.cash || '');

  if (step === 'income') {
    const options = [
      { key: 'gaji', label: 'Gaji bulanan / harian' },
      { key: 'usaha', label: 'Usaha / jualan sendiri' },
      { key: 'keduanya', label: 'Keduanya' }
    ];
    return (
      <section className="screen active">
        <ProgressDots step={1} />
        <div className="content center-content">
          <h2 className="title">Sumber penghasilanmu?</h2>
          <p className="sub">Ini cuma buat catatan awal, bisa diubah kapan saja nanti.</p>
          <div className="stack" style={{ marginBottom: 20 }}>
            {options.map(opt => (
              <div key={opt.key}
                className={`source-opt ${incomeType === opt.key ? 'selected' : ''}`}
                style={{ width: '100%', flexDirection: 'row', justifyContent: 'flex-start', padding: 16 }}
                onClick={() => setIncomeType(opt.key)}>
                <span className="sname" style={{ marginLeft: 10 }}>{opt.label}</span>
              </div>
            ))}
          </div>
          <button className="btn btn-primary" onClick={() => {
            if (!incomeType) { showToast('Pilih salah satu dulu'); return; }
            onNavigate('ob-banks', { incomeType, banks, ewallets, bankBalances, ewalletBalances, cash });
          }}>Lanjut</button>
        </div>
      </section>
    );
  }

  if (step === 'banks') {
    return (
      <section className="screen active">
        <ProgressDots step={2} />
        <div className="content">
          <h2 className="title">Rekening bank</h2>
          <p className="sub">Tambahkan nama bank yang kamu pakai. Lewati kalau tidak punya rekening.</p>
          <ListEditor items={banks} onAdd={v => setBanks([...banks, v])}
            onRemove={i => setBanks(banks.filter((_, idx) => idx !== i))}
            placeholder="cth. BCA, BRI, Jenius" />
        </div>
        <div className="content" style={{ flex: 0, paddingTop: 0 }}>
          <button className="btn btn-primary" onClick={() => onNavigate('ob-ewallet', { incomeType, banks, ewallets, bankBalances, ewalletBalances, cash })}>Lanjut</button>
        </div>
      </section>
    );
  }

  if (step === 'ewallet') {
    return (
      <section className="screen active">
        <ProgressDots step={3} />
        <div className="content">
          <h2 className="title">E-wallet</h2>
          <p className="sub">Tambahkan dompet digital yang kamu pakai. Lewati kalau tidak ada.</p>
          <ListEditor items={ewallets} onAdd={v => setEwallets([...ewallets, v])}
            onRemove={i => setEwallets(ewallets.filter((_, idx) => idx !== i))}
            placeholder="cth. GoPay, OVO, Dana" />
        </div>
        <div className="content" style={{ flex: 0, paddingTop: 0 }}>
          <button className="btn btn-primary" onClick={() => onNavigate('ob-balance-bank', { incomeType, banks, ewallets, bankBalances, ewalletBalances, cash })}>Lanjut</button>
        </div>
      </section>
    );
  }

  if (step === 'balance-bank') {
    return (
      <section className="screen active">
        <ProgressDots step={4} />
        <div className="content">
          <h2 className="title">Saldo awal bank</h2>
          <p className="sub">Masukkan saldo saat ini di tiap rekening.</p>
          {banks.length === 0 && <p className="sub">Kamu tidak menambahkan rekening bank.</p>}
          {banks.map(b => (
            <div className="field" key={b}>
              <label>{b}</label>
              <div className="amount-input-wrap" style={{ marginBottom: 0 }}>
                <span className="rp">Rp</span>
                <input type="number" inputMode="numeric" placeholder="0"
                  value={bankBalances[b] || ''}
                  onChange={e => setBankBalances({ ...bankBalances, [b]: Number(e.target.value) })} />
              </div>
            </div>
          ))}
        </div>
        <div className="content" style={{ flex: 0, paddingTop: 0 }}>
          <button className="btn btn-primary" onClick={() => onNavigate('ob-balance-ewallet', { incomeType, banks, ewallets, bankBalances, ewalletBalances, cash })}>Lanjut</button>
        </div>
      </section>
    );
  }

  if (step === 'balance-ewallet') {
    return (
      <section className="screen active">
        <ProgressDots step={5} />
        <div className="content">
          <h2 className="title">Saldo awal e-wallet</h2>
          <p className="sub">Masukkan saldo saat ini di tiap dompet digital.</p>
          {ewallets.length === 0 && <p className="sub">Kamu tidak menambahkan e-wallet.</p>}
          {ewallets.map(b => (
            <div className="field" key={b}>
              <label>{b}</label>
              <div className="amount-input-wrap" style={{ marginBottom: 0 }}>
                <span className="rp">Rp</span>
                <input type="number" inputMode="numeric" placeholder="0"
                  value={ewalletBalances[b] || ''}
                  onChange={e => setEwalletBalances({ ...ewalletBalances, [b]: Number(e.target.value) })} />
              </div>
            </div>
          ))}
        </div>
        <div className="content" style={{ flex: 0, paddingTop: 0 }}>
          <button className="btn btn-primary" onClick={() => onNavigate('ob-cash', { incomeType, banks, ewallets, bankBalances, ewalletBalances, cash })}>Lanjut</button>
        </div>
      </section>
    );
  }

  if (step === 'cash') {
    return (
      <section className="screen active">
        <div className="content center-content">
          <h2 className="title">Uang tunai di tangan</h2>
          <p className="sub">Berapa uang cash yang kamu pegang sekarang?</p>
          <div className="amount-input-wrap">
            <span className="rp">Rp</span>
            <input type="number" inputMode="numeric" placeholder="0" value={cash} onChange={e => setCash(e.target.value)} />
          </div>
          <button className="btn btn-primary" onClick={() => {
            completeOnboarding(incomeType || 'gaji', banks, ewallets, bankBalances, ewalletBalances, cash);
            showToast('Data awal tersimpan!');
            onNavigate('home');
          }}>Selesai & buka beranda</button>
        </div>
      </section>
    );
  }

  return null;
}

// ============ HOME ============
function HomePage({ onNavigate }) {
  const { currentUser, data, totalBalance } = useApp();
  const [modalType, setModalType] = React.useState(null);

  const greet = React.useMemo(() => {
    const hr = new Date().getHours();
    return hr < 11 ? 'Selamat pagi,' : hr < 15 ? 'Selamat siang,' : hr < 18 ? 'Selamat sore,' : 'Selamat malam,';
  }, []);

  const { inTotal, outTotal, pctIn, pctOut } = React.useMemo(() => {
    if (!data) return { inTotal: 0, outTotal: 0, pctIn: 0, pctOut: 0 };
    const tk = todayKey();
    const tx = data.transactions.filter(t => t.date.slice(0, 10) === tk);
    const inT = tx.filter(t => t.type === 'in').reduce((s, t) => s + t.amount, 0);
    const outT = tx.filter(t => t.type === 'out').reduce((s, t) => s + t.amount, 0);
    const sum = inT + outT;
    return {
      inTotal: inT, outTotal: outT,
      pctIn: sum ? Math.round(inT / sum * 100) : 0,
      pctOut: sum ? Math.round(outT / sum * 100) : 0
    };
  }, [data]);

  if (!data) return null;

  return (
    <section className="screen active">
      <div className="home-header">
        <div className="greet">{greet}</div>
        <div className="acc">{currentUser}</div>
      </div>
      <div className="balance-strip">
        <div><div className="lbl">TOTAL SALDO</div></div>
        <div className="val">{fmtRupiah(totalBalance())}</div>
      </div>
      <div className="home-cards">
        <button className="big-card in" onClick={() => setModalType('in')}>
          <div className="card-top-row">
            <div className="card-label"><IconArrowUp /> Pemasukan</div>
            <span className="card-pct">{pctIn}%</span>
          </div>
          <div>
            <div className="card-amount">{fmtRupiah(inTotal)}</div>
            <div className="card-sub">hari ini · ketuk untuk tambah</div>
          </div>
        </button>
        <button className="big-card out" onClick={() => setModalType('out')}>
          <div className="card-top-row">
            <div className="card-label"><IconArrowDown /> Pengeluaran</div>
            <span className="card-pct">{pctOut}%</span>
          </div>
          <div>
            <div className="card-amount">{fmtRupiah(outTotal)}</div>
            <div className="card-sub">hari ini · ketuk untuk catat beli</div>
          </div>
        </button>
      </div>
      <TabBar active="home" onNavigate={onNavigate} />
      {modalType && <TxModal type={modalType} onClose={() => setModalType(null)} />}
    </section>
  );
}

// ============ HISTORY ============
function HistoryPage({ onNavigate }) {
  const { currentUser, data, deleteTransaction, totalBalance, showToast } = useApp();
  const [filter, setFilter] = React.useState('all');

  const { txs, sumIn, sumOut } = React.useMemo(() => {
    if (!data) return { txs: [], sumIn: 0, sumOut: 0 };
    let list = data.transactions.slice();
    if (filter !== 'all') list = list.filter(t => t.type === filter);
    const sIn = data.transactions.filter(t => t.type === 'in').reduce((s, t) => s + t.amount, 0);
    const sOut = data.transactions.filter(t => t.type === 'out').reduce((s, t) => s + t.amount, 0);
    return { txs: list, sumIn: sIn, sumOut: sOut };
  }, [data, filter]);

  if (!data) return null;

  const handlePrint = () => {
    printReceipt(currentUser, data, totalBalance());
    showToast('Struk PDF diunduh');
  };

  return (
    <section className="screen active">
      <div className="top"><div /><h1>Riwayat transaksi</h1><div /></div>
      <div className="summary-mini">
        <div className="box"><div className="l">MASUK</div><div className="v" style={{ color: 'var(--in)' }}>{fmtRupiah(sumIn)}</div></div>
        <div className="box"><div className="l">KELUAR</div><div className="v" style={{ color: 'var(--out)' }}>{fmtRupiah(sumOut)}</div></div>
      </div>
      <div className="hist-filter">
        <span className={`chip ${filter === 'all' ? 'selected' : ''}`} onClick={() => setFilter('all')}>Semua</span>
        <span className={`chip ${filter === 'in' ? 'selected' : ''}`} onClick={() => setFilter('in')}>Pemasukan</span>
        <span className={`chip ${filter === 'out' ? 'selected' : ''}`} onClick={() => setFilter('out')}>Pengeluaran</span>
      </div>
      <div style={{ marginTop: 8, flex: 1 }}>
        {txs.length === 0 ? (
          <div className="empty-state">
            <IconEmpty />
            <p>Belum ada transaksi tercatat</p>
          </div>
        ) : txs.map(t => {
          const d = new Date(t.date);
          const dateStr = d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
          const timeStr = d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
          return (
            <div className="hist-item" key={t.id}>
              <div className={`hist-icon ${t.type}`}>
                {t.type === 'in' ? <IconArrowUp size={20} /> : <IconArrowDown size={20} />}
              </div>
              <div className="hist-info">
                <div className="hist-name">{t.name}</div>
                <div className="hist-meta">{dateStr}, {timeStr} · {t.source.name}</div>
              </div>
              <div className={`hist-amt ${t.type}`}>{t.type === 'in' ? '+' : '-'}{fmtRupiah(t.amount)}</div>
              <button className="hist-del" onClick={() => deleteTransaction(t.id)}><IconClose size={16} /></button>
            </div>
          );
        })}
      </div>
      <div className="content" style={{ flex: 0 }}>
        <button className="btn btn-outline" onClick={handlePrint}>
          <span style={{ marginRight: 6, verticalAlign: '-3px', display: 'inline-block' }}><IconPrint /></span>
          Cetak struk PDF
        </button>
      </div>
      <TabBar active="history" onNavigate={onNavigate} />
    </section>
  );
}

// ============ WALLETS ============
function WalletsPage({ onNavigate }) {
  const { data, addBank, addEwallet, showToast } = useApp();
  const [bankInput, setBankInput] = React.useState('');
  const [ewalletInput, setEwalletInput] = React.useState('');

  if (!data) return null;

  const handleAddBank = () => {
    if (!bankInput.trim()) return;
    addBank(bankInput);
    setBankInput('');
    showToast('Bank ditambahkan');
  };
  const handleAddEwallet = () => {
    if (!ewalletInput.trim()) return;
    addEwallet(ewalletInput);
    setEwalletInput('');
    showToast('E-wallet ditambahkan');
  };

  return (
    <section className="screen active">
      <div className="top"><div /><h1>Dompet & saldo</h1><div /></div>
      <div className="content" style={{ flex: 1, overflowY: 'auto' }}>
        <p className="sub" style={{ marginBottom: 10 }}>Bank</p>
        <div className="stack" style={{ marginBottom: 22 }}>
          {data.banks.length === 0 && <p className="sub">Belum ada rekening bank.</p>}
          {data.banks.map(b => (
            <div className="row-item" key={b}>
              <span className="rname">{b}</span>
              <span style={{ fontFamily: 'var(--mono)', fontWeight: 800, marginRight: 8 }}>
                {fmtRupiah(data.balances.bank[b] || 0)}
              </span>
            </div>
          ))}
        </div>
        <div className="add-inline" style={{ marginBottom: 22 }}>
          <input type="text" placeholder="Tambah nama bank" value={bankInput}
            onChange={e => setBankInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAddBank()} />
          <button onClick={handleAddBank}>+</button>
        </div>

        <p className="sub" style={{ marginBottom: 10 }}>E-wallet</p>
        <div className="stack" style={{ marginBottom: 22 }}>
          {data.ewallets.length === 0 && <p className="sub">Belum ada e-wallet.</p>}
          {data.ewallets.map(b => (
            <div className="row-item" key={b}>
              <span className="rname">{b}</span>
              <span style={{ fontFamily: 'var(--mono)', fontWeight: 800, marginRight: 8 }}>
                {fmtRupiah(data.balances.ewallet[b] || 0)}
              </span>
            </div>
          ))}
        </div>
        <div className="add-inline" style={{ marginBottom: 22 }}>
          <input type="text" placeholder="Tambah nama e-wallet" value={ewalletInput}
            onChange={e => setEwalletInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAddEwallet()} />
          <button onClick={handleAddEwallet}>+</button>
        </div>

        <p className="sub" style={{ marginBottom: 10 }}>Uang tunai</p>
        <div className="row-item">
          <span className="rname">Cash di tangan</span>
          <span style={{ fontFamily: 'var(--mono)', fontWeight: 800 }}>{fmtRupiah(data.balances.cash || 0)}</span>
        </div>
      </div>
      <TabBar active="wallets" onNavigate={onNavigate} />
    </section>
  );
}

// ============ SETTINGS ============
const INCOME_LABELS = { gaji: 'Gaji', usaha: 'Usaha', keduanya: 'Gaji & usaha' };

function SettingsPage({ onNavigate }) {
  const { currentUser, data, logout, resetAccountData, showToast } = useApp();

  if (!data) return null;

  const handleLogout = () => {
    logout();
    onNavigate('login');
  };

  const handleReset = () => {
    if (window.confirm('Yakin hapus semua data akun ini? Tindakan ini tidak bisa dibatalkan.')) {
      resetAccountData();
      showToast('Data akun sudah direset');
      onNavigate('ob-income');
    }
  };

  return (
    <section className="screen active">
      <div className="top"><div /><h1>Pengaturan</h1><div /></div>
      <div className="content" style={{ flex: 1 }}>
        <div className="settings-list">
          <div className="settings-row"><span className="srl">Nama akun</span><span className="srv">{currentUser}</span></div>
          <div className="settings-row"><span className="srl">Jenis penghasilan</span><span className="srv">{INCOME_LABELS[data.incomeType] || '-'}</span></div>
          <div className="settings-row"><span className="srl">Total transaksi</span><span className="srv">{data.transactions.length}</span></div>
        </div>
        <div style={{ marginTop: 24 }}>
          <button className="btn btn-outline" onClick={handleLogout} style={{ marginBottom: 12 }}>Keluar akun</button>
          <button className="btn btn-danger" onClick={handleReset}>Hapus semua data akun ini</button>
        </div>
        <p className="sub" style={{ marginTop: 20, textAlign: 'center' }}>
          Data tersimpan di perangkat ini saja dan tidak akan hilang kecuali data browser dihapus.
        </p>
      </div>
      <TabBar active="settings" onNavigate={onNavigate} />
    </section>
  );
}
