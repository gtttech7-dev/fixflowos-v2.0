import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Activity, ArrowRight, Eye, EyeOff, Smartphone, ShieldCheck, Zap } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext.jsx'
import { firebaseConfigured } from '../firebase.js'
import { Alert } from '../components/ui.jsx'

export default function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  async function handleSubmit(event) {
    event.preventDefault()
    if (loading) return
    setLoading(true); setError('')
    try {
      await login(email, password)
      navigate(location.state?.from?.pathname || '/', { replace: true })
    } catch (err) {
      const message = ({ 'auth/invalid-credential': 'E-mail ou senha incorretos.', 'auth/user-not-found': 'E-mail ou senha incorretos.', 'auth/wrong-password': 'E-mail ou senha incorretos.', 'auth/too-many-requests': 'Muitas tentativas. Aguarde e tente novamente.' })[err.code] || err.message || 'Não foi possível entrar. Tente novamente.'
      setError(message)
    } finally { setLoading(false) }
  }
  return <div className="login-page">
    <div className="login-backdrop login-backdrop-one" /><div className="login-backdrop login-backdrop-two" />
    <div className="login-layout"><section className="login-hero"><div className="brand brand-large"><div className="brand-mark"><Smartphone size={23} /></div><div><strong>FixFlowOS</strong><small>Gestão técnica inteligente</small></div></div><div className="hero-copy"><span className="eyebrow"><span className="status-pulse" /> PLATAFORMA PARA ASSISTÊNCIAS</span><h1>Seu negócio técnico, <em>sob controle.</em></h1><p>Organize serviços, acompanhe aparelhos, controle o estoque e tenha uma visão clara da operação em um só lugar.</p><div className="hero-points"><div><span className="feature-icon"><Activity size={17} /></span><div><strong>Operação em tempo real</strong><small>OS, estoque e caixa em um fluxo conectado.</small></div></div><div><span className="feature-icon"><ShieldCheck size={17} /></span><div><strong>Dados por assistência</strong><small>Separação de dados e permissões por cargo.</small></div></div><div><span className="feature-icon"><Zap size={17} /></span><div><strong>Feito para a bancada</strong><small>Fluxos pensados para celulares e tablets.</small></div></div></div></div><div className="login-hero-footer">FIXFLOWOS <span>·</span> GESTÃO OPERACIONAL</div></section>
      <section className="login-panel"><div className="login-card"><div className="login-heading"><div className="login-symbol"><Smartphone size={22} /></div><span className="eyebrow">BEM-VINDO DE VOLTA</span><h2>Acesse sua conta</h2><p>Entre para continuar gerenciando sua assistência.</p></div>
        {!firebaseConfigured && <Alert>Configure as variáveis VITE_FIREBASE_* no arquivo .env para ativar o login.</Alert>}
        {error && <Alert>{error}</Alert>}
        <form className="login-form" onSubmit={handleSubmit}>
          <label className="field"><span>E-mail</span><input type="email" autoComplete="username" placeholder="voce@suaassistencia.com" value={email} onChange={e => setEmail(e.target.value)} required /></label>
          <label className="field"><span>Senha</span><div className="password-input"><input type={showPassword ? 'text' : 'password'} autoComplete="current-password" placeholder="Digite sua senha" value={password} onChange={e => setPassword(e.target.value)} required /><button type="button" className="password-toggle" onClick={() => setShowPassword(v => !v)} aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></div></label>
          <button className="button button-primary login-submit" type="submit" disabled={loading || !firebaseConfigured}>{loading ? <><span className="button-loader" /> Entrando...</> : <>Entrar na plataforma <ArrowRight size={17} /></>}</button>
        </form><div className="login-secure"><ShieldCheck size={15} /> Conexão autenticada pelo Firebase</div><div className="login-footnote">Acesso exclusivo para usuários provisionados pela administração.</div>
      </div></section></div>
  </div>
}
