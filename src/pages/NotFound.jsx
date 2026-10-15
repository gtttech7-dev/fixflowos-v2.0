import { Link } from 'react-router-dom'
import { ArrowLeft, Home, Search, Smartphone } from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext.jsx'

export default function NotFound() {
  const { theme } = useTheme()
  return <main className="not-found-page" data-theme={theme}><div className="not-found-orb orb-one" /><div className="not-found-orb orb-two" /><div className="not-found-card"><div className="not-found-mark"><Smartphone size={25} /></div><span className="eyebrow">FIXFLOWOS · NAVEGAÇÃO</span><div className="not-found-number">404</div><h1>Página não encontrada</h1><p>O endereço que você tentou acessar não existe ou foi movido. Confira o link ou volte para o início do sistema.</p><div className="not-found-actions"><Link to="/" className="button button-primary"><Home size={17} /> Voltar para o início</Link><button className="button button-secondary" onClick={() => window.history.back()}><ArrowLeft size={17} /> Voltar à página anterior</button></div><div className="not-found-footer"><Search size={14} /> Verifique se o endereço foi digitado corretamente.</div></div></main>
}
