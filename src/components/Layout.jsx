import { useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { Activity, LayoutDashboard, ClipboardList, Package, ShoppingCart, Wallet, Users, CreditCard, Settings, ShieldCheck, Sun, Moon, LogOut, Menu, X, Smartphone, ChevronRight } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext.jsx'
import { useTheme } from '../contexts/ThemeContext.jsx'
import { isAdmin, isSuperAdmin, canReadStock } from '../utils/permissions.js'

const mainNav = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, show: user => !isSuperAdmin(user) },
  { to: '/ordens-servico', label: 'Ordens de serviço', icon: ClipboardList, show: user => !isSuperAdmin(user) },
  { to: '/estoque', label: 'Estoque', icon: Package, show: user => canReadStock(user) },
  { to: '/vendas', label: 'Vendas / PDV', icon: ShoppingCart, show: user => ['admin', 'vendedorTecnico'].includes(user?.cargo) },
  { to: '/caixa', label: 'Caixa', icon: Wallet, show: user => ['admin', 'vendedorTecnico'].includes(user?.cargo) },
  { to: '/equipe', label: 'Equipe / RH', icon: Users, show: user => isAdmin(user) },
  { to: '/planos', label: 'Assinatura', icon: CreditCard, show: user => isAdmin(user) },
  { to: '/configuracoes', label: 'Configurações', icon: Settings, show: user => isAdmin(user) },
  { to: '/super-admin', label: 'Super Admin', icon: ShieldCheck, show: user => isSuperAdmin(user) },
]
const titleMap = { '/': 'Dashboard', '/dashboard': 'Dashboard', '/ordens-servico': 'Ordens de serviço', '/estoque': 'Estoque', '/vendas': 'Vendas / PDV', '/caixa': 'Caixa', '/equipe': 'Equipe / RH', '/planos': 'Assinatura', '/configuracoes': 'Configurações', '/super-admin': 'Super Admin' }

export default function Layout() {
  const { user, logout, isSuperAdmin: isSA } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const [menuOpen, setMenuOpen] = useState(false)
  const location = useLocation()
  const visible = mainNav.filter(item => item.show(user))
  const closeMenu = () => setMenuOpen(false)
  return <div className="app-shell">
    {menuOpen && <button className="mobile-scrim" aria-label="Fechar menu" onClick={closeMenu} />}
    <aside className={`sidebar ${menuOpen ? 'sidebar-open' : ''}`}>
      <div className="brand"><div className="brand-mark"><Smartphone size={21} /></div><div><strong>FixFlowOS</strong><small>Gestão técnica inteligente</small></div><button className="icon-button sidebar-close" onClick={closeMenu} aria-label="Fechar menu"><X size={18} /></button></div>
      <div className="workspace"><div className="workspace-avatar">{(user?.nome || user?.email || 'F').slice(0, 1).toUpperCase()}</div><div className="workspace-copy"><strong>{isSA ? 'Administração global' : user?.nome || 'Minha assistência'}</strong><small>{isSA ? 'Super Admin' : user?.cargo || 'Usuário'}</small></div><ChevronRight size={16} /></div>
      <nav className="nav-list" aria-label="Navegação principal">
        <p className="nav-caption">MENU PRINCIPAL</p>
        {visible.map(({ to, label, icon: Icon }) => <NavLink to={to} key={to} end={to === '/'} onClick={closeMenu} className={({ isActive }) => `nav-link ${isActive ? 'nav-link-active' : ''}`}><Icon size={18} strokeWidth={1.8} /><span>{label}</span>{location.pathname === to && <span className="nav-dot" />}</NavLink>)}
      </nav>
      <div className="sidebar-bottom"><div className="status-line"><span className="status-pulse" /> Aplicação conectada</div><button className="nav-link logout-link" onClick={async () => { closeMenu(); await logout() }}><LogOut size={18} /><span>Sair da conta</span></button><div className="sidebar-footer"><Activity size={13} /> FixFlowOS · Gestão de assistência</div></div>
    </aside>
    <div className="main-column">
      <header className="topbar"><div className="topbar-left"><button className="icon-button menu-open" onClick={() => setMenuOpen(true)} aria-label="Abrir menu"><Menu size={20} /></button><div className="breadcrumb"><span>FixFlowOS</span><ChevronRight size={14} /><strong>{titleMap[location.pathname] || 'Sistema'}</strong></div></div><div className="topbar-actions"><button className="theme-button" onClick={toggleTheme} title={theme === 'dark' ? 'Ativar modo claro' : 'Ativar modo escuro'} aria-label="Alternar tema">{theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}<span>{theme === 'dark' ? 'Modo claro' : 'Modo escuro'}</span></button><div className="topbar-user"><div className="avatar-small">{(user?.nome || user?.email || 'U').slice(0, 1).toUpperCase()}</div><div className="topbar-user-copy"><strong>{user?.nome || user?.email}</strong><small>{user?.cargo}</small></div></div></div></header>
      <main className="page-content"><Outlet /></main>
      <footer className="app-footer"><span>© {new Date().getFullYear()} FixFlowOS</span><span>Dados isolados por assistência</span></footer>
    </div>
  </div>
}
