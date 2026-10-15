import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext.jsx'
import { isSuperAdmin } from '../utils/permissions.js'
import { LoadingScreen } from './ui.jsx'

export function ProtectedRoute({ allowedRoles, superAdminOnly = false }) {
  const { user, loading, isSuperAdmin: isSA } = useAuth()
  const location = useLocation()
  if (loading) return <LoadingScreen label="Verificando sessão..." />
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />
  if (user.status === 'suspended') return <Navigate to="/acesso-suspenso" replace />
  if (user.status === 'expired' && location.pathname !== '/planos') return <Navigate to="/planos" replace />
  if (user.status === 'sem-perfil' || (!user.lojaId && !isSA)) return <div className="center-state"><h2>Perfil não provisionado</h2><p>Esta conta existe no Firebase Authentication, mas ainda não possui um perfil autorizado no Firestore.</p><button className="button" onClick={() => window.location.assign('/login')}>Voltar ao login</button></div>
  if (superAdminOnly && !isSuperAdmin(user)) return <Navigate to="/" replace />
  if (allowedRoles && !allowedRoles.includes(user.cargo)) return <Navigate to="/sem-permissao" replace />
  return <Outlet />
}

export function PublicOnlyRoute() {
  const { user, loading, isSuperAdmin: isSA } = useAuth()
  if (loading) return <LoadingScreen label="Carregando..." />
  if (user) return <Navigate to={isSA ? '/super-admin' : '/'} replace />
  return <Outlet />
}
