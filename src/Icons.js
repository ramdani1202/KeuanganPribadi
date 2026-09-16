// ============ ICONS ============
function IconArrowUp({ size = 18 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <path d="M12 19V5M6 11l6-6 6 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>;
}
function IconArrowDown({ size = 18 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <path d="M12 5v14M6 13l6 6 6-6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>;
}
function IconBack() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
    <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>;
}
function IconClose({ size = 18 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
  </svg>;
}
function IconHome() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
    <path d="M3 11l9-8 9 8M5 10v10h14V10" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/>
  </svg>;
}
function IconHistory() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
    <path d="M3 3v6h6M3 9a9 9 0 1 1 2.6 6.4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M12 8v5l3 2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
  </svg>;
}
function IconWallet() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
    <rect x="3" y="6" width="18" height="13" rx="2" stroke="currentColor" strokeWidth="1.8"/>
    <path d="M16 12h3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
    <path d="M3 9h18" stroke="currentColor" strokeWidth="1.8"/>
  </svg>;
}
function IconSettings() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
    <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8"/>
    <path d="M19.4 15a1.7 1.7 0 00.3 1.9l.1.1a2 2 0 11-2.9 2.9l-.1-.1a1.7 1.7 0 00-1.9-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1-1.6 1.7 1.7 0 00-1.9.3l-.1.1a2 2 0 11-2.9-2.9l.1-.1a1.7 1.7 0 00.3-1.9 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1 1.7 1.7 0 00-.3-1.9l-.1-.1a2 2 0 112.9-2.9l.1.1a1.7 1.7 0 001.9.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.9-.3l.1-.1a2 2 0 112.9 2.9l-.1.1a1.7 1.7 0 00-.3 1.9V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z" stroke="currentColor" strokeWidth="1.5"/>
  </svg>;
}
function IconBank() {
  return <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
    <path d="M3 10l9-6 9 6" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/>
    <rect x="4" y="10" width="16" height="9" stroke="currentColor" strokeWidth="1.8"/>
    <path d="M2 20h20" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
  </svg>;
}
function IconEwallet() {
  return <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
    <rect x="3" y="6" width="18" height="13" rx="2" stroke="currentColor" strokeWidth="1.8"/>
    <path d="M16 12.5h2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
    <path d="M3 9h18" stroke="currentColor" strokeWidth="1.8"/>
  </svg>;
}
function IconCash() {
  return <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
    <rect x="2" y="6" width="20" height="12" rx="2" stroke="currentColor" strokeWidth="1.8"/>
    <circle cx="12" cy="12" r="2.5" stroke="currentColor" strokeWidth="1.8"/>
  </svg>;
}
function IconPrint() {
  return <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
    <path d="M6 9V3h12v6M6 18h12v3H6v-3zM6 14h12M4 9h16a2 2 0 012 2v5h-4M2 16v-5a2 2 0 012-2" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/>
  </svg>;
}
function IconRefresh({ size = 18 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <path d="M3 12a9 9 0 0115.4-6.4M21 12a9 9 0 01-15.4 6.4" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    <path d="M17 3v5h-5M7 21v-5h5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>;
}
function IconLogo() {
  return <svg width="52" height="52" viewBox="0 0 24 24" fill="none">
    <rect x="3" y="7" width="18" height="13" rx="2.5" fill="#2B2620"/>
    <path d="M7 7V6a5 5 0 0110 0v1" stroke="#2B2620" strokeWidth="2" fill="none"/>
    <circle cx="12" cy="13" r="1.8" fill="#F5EFE3"/>
    <rect x="11.2" y="14.2" width="1.6" height="3" rx="0.8" fill="#F5EFE3"/>
  </svg>;
}
function IconEmpty() {
  return <svg width="56" height="56" viewBox="0 0 24 24" fill="none">
    <path d="M3 3v6h6M3 9a9 9 0 1 1 2.6 6.4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>;
}
