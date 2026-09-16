// ============ APP (routing sederhana berbasis state) ============
function AppRoot() {
  const { currentUser, booted } = useApp();
  const [screen, setScreen] = React.useState('login');
  const [obData, setObData] = React.useState({});

  // Begitu session ke-restore saat boot, arahkan ke layar yang tepat
  React.useEffect(() => {
    if (!booted) return;
    if (currentUser) {
      setScreen(prev => (prev === 'login' || prev === 'register') ? 'home' : prev);
    }
  }, [booted, currentUser]);

  const handleNavigate = (target, extraData) => {
    // Reset data onboarding tiap kali (re)memulai dari langkah pertama,
    // supaya tidak ada sisa data dari sesi/akun sebelumnya.
    if (target === 'ob-income' && !extraData) {
      setObData({});
    } else if (extraData) {
      setObData(prev => ({ ...prev, ...extraData }));
    }
    setScreen(target);
  };

  if (!booted) return null;

  // Proteksi: layar selain login/register wajib sudah login
  const protectedScreens = ['ob-income', 'ob-banks', 'ob-ewallet', 'ob-balance-bank', 'ob-balance-ewallet', 'ob-cash', 'home', 'history', 'wallets', 'settings'];
  if (protectedScreens.includes(screen) && !currentUser) {
    return (
      <div id="app">
        <LoginPage onNavigate={handleNavigate} />
        <Toast />
      </div>
    );
  }

  let page = null;
  if (screen === 'login') page = <LoginPage onNavigate={handleNavigate} />;
  else if (screen === 'register') page = <RegisterPage onNavigate={handleNavigate} />;
  else if (screen === 'ob-income') page = <OnboardingPage step="income" onNavigate={handleNavigate} obData={obData} />;
  else if (screen === 'ob-banks') page = <OnboardingPage step="banks" onNavigate={handleNavigate} obData={obData} />;
  else if (screen === 'ob-ewallet') page = <OnboardingPage step="ewallet" onNavigate={handleNavigate} obData={obData} />;
  else if (screen === 'ob-balance-bank') page = <OnboardingPage step="balance-bank" onNavigate={handleNavigate} obData={obData} />;
  else if (screen === 'ob-balance-ewallet') page = <OnboardingPage step="balance-ewallet" onNavigate={handleNavigate} obData={obData} />;
  else if (screen === 'ob-cash') page = <OnboardingPage step="cash" onNavigate={handleNavigate} obData={obData} />;
  else if (screen === 'home') page = <HomePage onNavigate={handleNavigate} />;
  else if (screen === 'history') page = <HistoryPage onNavigate={handleNavigate} />;
  else if (screen === 'wallets') page = <WalletsPage onNavigate={handleNavigate} />;
  else if (screen === 'settings') page = <SettingsPage onNavigate={handleNavigate} />;

  return (
    <div id="app">
      {page}
      <Toast />
    </div>
  );
}
