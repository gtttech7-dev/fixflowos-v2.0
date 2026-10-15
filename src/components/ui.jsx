import { LoaderCircle, AlertCircle, CheckCircle2 } from 'lucide-react'

export function LoadingScreen({ label = 'Carregando...' }) {
  return <div className="loading-screen"><LoaderCircle className="spin" size={28} /><span>{label}</span></div>
}
export function Alert({ type = 'error', children }) {
  const Icon = type === 'success' ? CheckCircle2 : AlertCircle
  return <div className={`alert alert-${type}`} role="status"><Icon size={18} /> <span>{children}</span></div>
}
export function EmptyState({ title, description, action }) {
  return <div className="empty-state"><div className="empty-icon">◇</div><h3>{title}</h3><p>{description}</p>{action}</div>
}
export function Field({ label, children, hint }) {
  return <label className="field"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>
}
export function SectionHeader({ eyebrow, title, description, action }) {
  return <div className="section-header"><div>{eyebrow && <span className="eyebrow">{eyebrow}</span>}<h1>{title}</h1>{description && <p>{description}</p>}</div>{action && <div className="section-action">{action}</div>}</div>
}
