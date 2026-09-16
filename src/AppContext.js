// ============ APP CONTEXT ============
const AppContext = React.createContext(null);

function AppProvider({ children }) {
  const [currentUser, setCurrentUser] = React.useState(null);
  const [data, setData] = React.useState(null);
  const [toast, setToastMsg] = React.useState(null);
  const [booted, setBooted] = React.useState(false);

  React.useEffect(() => {
    const session = getSession();
    if (session) {
      const d = getUserData(session);
      if (d) {
        setCurrentUser(session);
        setData(d);
      }
    }
    setBooted(true);
  }, []);

  const showToast = React.useCallback((msg) => {
    setToastMsg(msg);
    clearTimeout(window._toastTimer);
    window._toastTimer = setTimeout(() => setToastMsg(null), 2200);
  }, []);

  const persist = React.useCallback((newData) => {
    setData(newData);
    if (currentUser) saveUserData(currentUser, newData);
  }, [currentUser]);

  const register = React.useCallback((username, pass1, pass2) => {
    username = username.trim();
    if (!username) return { ok: false, msg: 'Nama akun tidak boleh kosong' };
    if (pass1.length < 4) return { ok: false, msg: 'Sandi minimal 4 karakter' };
    if (pass1 !== pass2) return { ok: false, msg: 'Sandi tidak cocok' };

    const users = getUsers();
    if (users[username]) return { ok: false, msg: 'Nama akun sudah dipakai, pilih nama lain' };

    users[username] = { passHash: simpleHash(pass1), createdAt: new Date().toISOString() };
    saveUsers(users);
    const fresh = defaultUserData();
    saveUserData(username, fresh);

    setCurrentUser(username);
    setData(fresh);
    setSession(username);
    return { ok: true };
  }, []);

  const login = React.useCallback((username, pass) => {
    username = username.trim();
    if (!username || !pass) return { ok: false, msg: 'Isi nama akun dan sandi' };

    const users = getUsers();
    const rec = users[username];
    if (!rec) return { ok: false, msg: 'Akun tidak ditemukan' };
    if (rec.passHash !== simpleHash(pass)) return { ok: false, msg: 'Sandi salah' };

    const d = getUserData(username) || defaultUserData();
    setCurrentUser(username);
    setData(d);
    setSession(username);
    return { ok: true, needsOnboarding: !d.incomeType };
  }, []);

  const logout = React.useCallback(() => {
    clearSession();
    setCurrentUser(null);
    setData(null);
  }, []);

  const resetAccountData = React.useCallback(() => {
    if (!currentUser) return;
    deleteUserData(currentUser);
    const fresh = defaultUserData();
    saveUserData(currentUser, fresh);
    setData(fresh);
  }, [currentUser]);

  const completeOnboarding = React.useCallback((incomeType, banks, ewallets, bankBalances, ewalletBalances, cash) => {
    const newData = {
      incomeType,
      banks,
      ewallets,
      balances: { bank: bankBalances, ewallet: ewalletBalances, cash: Number(cash) || 0 },
      transactions: []
    };
    persist(newData);
  }, [persist]);

  const totalBalance = React.useCallback(() => {
    if (!data) return 0;
    let t = data.balances.cash || 0;
    Object.values(data.balances.bank).forEach(v => t += Number(v) || 0);
    Object.values(data.balances.ewallet).forEach(v => t += Number(v) || 0);
    return t;
  }, [data]);

  const addTransaction = React.useCallback((type, source, name, amount) => {
    if (!data) return;
    const newData = JSON.parse(JSON.stringify(data));
    const sign = type === 'in' ? 1 : -1;

    if (source.type === 'cash') {
      newData.balances.cash = (newData.balances.cash || 0) + sign * amount;
    } else if (source.type === 'bank') {
      newData.balances.bank[source.name] = (newData.balances.bank[source.name] || 0) + sign * amount;
    } else if (source.type === 'ewallet') {
      newData.balances.ewallet[source.name] = (newData.balances.ewallet[source.name] || 0) + sign * amount;
    }

    newData.transactions.unshift({
      id: uid(),
      type,
      amount,
      name,
      source: { type: source.type, name: source.name },
      date: new Date().toISOString()
    });

    persist(newData);
  }, [data, persist]);

  const deleteTransaction = React.useCallback((id) => {
    if (!data) return;
    const newData = JSON.parse(JSON.stringify(data));
    const idx = newData.transactions.findIndex(t => t.id === id);
    if (idx === -1) return;
    const t = newData.transactions[idx];
    const sign = t.type === 'in' ? -1 : 1;

    if (t.source.type === 'cash') {
      newData.balances.cash = (newData.balances.cash || 0) + sign * t.amount;
    } else if (t.source.type === 'bank') {
      newData.balances.bank[t.source.name] = (newData.balances.bank[t.source.name] || 0) + sign * t.amount;
    } else if (t.source.type === 'ewallet') {
      newData.balances.ewallet[t.source.name] = (newData.balances.ewallet[t.source.name] || 0) + sign * t.amount;
    }

    newData.transactions.splice(idx, 1);
    persist(newData);
  }, [data, persist]);

  const addBank = React.useCallback((name) => {
    if (!data || !name.trim()) return;
    const newData = JSON.parse(JSON.stringify(data));
    newData.banks.push(name.trim());
    newData.balances.bank[name.trim()] = 0;
    persist(newData);
  }, [data, persist]);

  const addEwallet = React.useCallback((name) => {
    if (!data || !name.trim()) return;
    const newData = JSON.parse(JSON.stringify(data));
    newData.ewallets.push(name.trim());
    newData.balances.ewallet[name.trim()] = 0;
    persist(newData);
  }, [data, persist]);

  const value = {
    currentUser, data, booted, toast,
    showToast, register, login, logout, resetAccountData,
    completeOnboarding, totalBalance, addTransaction, deleteTransaction,
    addBank, addEwallet
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

function useApp() {
  const ctx = React.useContext(AppContext);
  if (!ctx) throw new Error('useApp harus dipakai di dalam AppProvider');
  return ctx;
}
