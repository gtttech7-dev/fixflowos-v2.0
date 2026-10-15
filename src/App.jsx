import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout.jsx'
import { ProtectedRoute, PublicOnlyRoute } from './components/ProtectedRoute.jsx'
import Login from './pages/Login.jsx'
import Dashboard from './pages/Dashboard.jsx'
import OrdensServico from './pages/OrdensServico.jsx'
import Estoque from './pages/Estoque.jsx'
import Vendas from './pages/Vendas.jsx'
import Caixa from './pages/Caixa.jsx'
import Equipe from './pages/Equipe.jsx'
import Planos from './pages/Planos.jsx'
import Configuracoes from './pages/Configuracoes.jsx'
import SuperAdmin from './pages/SuperAdmin.jsx'
import NotFound from './pages/NotFound.jsx'
import { useAuth } from './contexts/AuthContext.jsx'
import { LoadingScreen } from './components/ui.jsx'

function HomeRedirect() {
  const { user, loading, isSuperAdmin } = useAuth()
  if (loading) return <LoadingScreen />
  if (!user) return <Navigate to="/login" replace />
  return <Navigate to={isSuperAdmin ? '/super-admin' : '/dashboard' + ''} replace />
}
function Suspended() { return <div className="center-state"><div className="brand-mark"><ShieldIcon /></div><h1>Acesso suspenso</h1><p>A conta está suspensa. Entre em contato com o administrador do FixFlowOS para verificar a assinatura ou o acesso.</p></div> }
function NoPermission() { return <div className="center-state"><h1>Acesso não autorizado</h1><p>Seu cargo não possui permissão para acessar este módulo.</p><a className="button" href="/">Voltar ao início</a></div> }
function ShieldIcon() { return <span>✓</span> }
export default function App() {
  return <Routes>
    <Route element={<PublicOnlyRoute />}><Route path="/login" element={<Login />} /></Route>
    <Route path="/acesso-suspenso" element={<Suspended />} />
    <Route path="/sem-permissao" element={<NoPermission />} />
    <Route element={<ProtectedRoute />}>
      <Route element={<Layout />}>
        <Route index element={<HomeRedirect />} />
        <Route element={<ProtectedRoute allowedRoles={['admin', 'vendedorTecnico', 'tecnico']} />}>
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="ordens-servico" element={<OrdensServico />} />
          <Route path="estoque" element={<Estoque />} />
        </Route>
        <Route element={<ProtectedRoute allowedRoles={['admin', 'vendedorTecnico']} />}>
          <Route path="vendas" element={<Vendas />} />
          <Route path="caixa" element={<Caixa />} />
        </Route>
        <Route element={<ProtectedRoute allowedRoles={['admin']} />}>
          <Route path="equipe" element={<Equipe />} />
          <Route path="planos" element={<Planos />} />
          <Route path="configuracoes" element={<Configuracoes />} />
        </Route>
      </Route>
    </Route>
    <Route element={<ProtectedRoute superAdminOnly />}><Route element={<Layout />}><Route path="super-admin" element={<SuperAdmin />} /></Route></Route>
    <Route path="*" element={<NotFound />} />
  </Routes>
}
