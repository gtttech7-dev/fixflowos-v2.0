import { useEffect, useState } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { BadgeCheck, CalendarClock, CreditCard, Sparkles } from 'lucide-react'
import { db } from '../firebase.js'
import { useAuth } from '../contexts/AuthContext.jsx'
import { money, dateTime } from '../utils/format.js'
import { Alert, EmptyState, LoadingScreen, SectionHeader } from '../components/ui.jsx'

export default function Planos() {
  const { user } = useAuth()
  const [subscription, setSubscription] = useState(null)
  const [store, setStore] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  useEffect(() => {
    if (!db || !user?.lojaId) { setLoading(false); return undefined }
    const unsub1 = onSnapshot(doc(db, 'lojas', user.lojaId, 'assinatura', 'atual'), snap => { setSubscription(snap.exists() ? snap.data() : null); setLoading(false) }, err => { setError(err.message); setLoading(false) })
    const unsub2 = onSnapshot(doc(db, 'lojas', user.lojaId), snap => setStore(snap.exists() ? snap.data() : null), err => setError(err.message))
    return () => { unsub1(); unsub2() }
  }, [user?.lojaId])
  if (loading) return <LoadingScreen label="Consultando assinatura..." />
  const periodLabels = { semanal: 'Semanal', mensal: 'Mensal', tresMeses: '3 Meses', anual: '1 Ano', vitalicio: 'Vitalício' }
  const statusLabels = { active: 'Ativa', trial: 'Em teste grátis', expired: 'Vencida', suspended: 'Suspensa' }

  return <div className="page-stack"><SectionHeader eyebrow="PLANO E ACESSOS" title="Assinatura" description="Consulte o plano ativo, o período contratado e o status da sua assistência." />{error && <Alert>{error}</Alert>}
    <section className="subscription-hero"><div className="subscription-hero-content"><span className="subscription-pill"><Sparkles size={14} /> FIXFLOWOS</span><h2>{subscription ? (subscription.planoNome || subscription.plano || 'Plano contratado') : 'Assinatura não configurada'}</h2><p>{subscription?.status === 'trial' ? 'Sua assistência está utilizando o período de teste gratuito.' : subscription ? 'Confira abaixo as informações registradas para sua assinatura.' : 'A administração do SaaS ainda não vinculou um plano a esta loja.'}</p></div><div className="subscription-hero-status"><span className="eyebrow">STATUS</span><strong className={`subscription-status status-${subscription?.status || 'unknown'}`}>{statusLabels[subscription?.status] || 'Não configurada'}</strong><small>{subscription?.status === 'trial' ? '1 semana de teste grátis' : 'Informação do Firestore'}</small></div></section>
    {subscription ? <div className="stats-grid subscription-stats"><article className="stat-card"><div className="stat-icon stat-purple"><CreditCard size={19} /></div><span className="stat-label">Preço configurado</span><strong className="stat-value">{subscription?.preco != null ? money(subscription.preco) : 'Não informado'}</strong><span className="stat-foot">Valor salvo pelo Super Admin</span></article><article className="stat-card"><div className="stat-icon stat-blue"><CalendarClock size={19} /></div><span className="stat-label">Período</span><strong className="stat-value stat-value-text">{periodLabels[subscription.periodo] || subscription.periodo || '—'}</strong><span className="stat-foot">Duração contratada</span></article><article className="stat-card"><div className="stat-icon stat-green"><BadgeCheck size={19} /></div><span className="stat-label">Válida até</span><strong className="stat-value stat-value-text">{subscription.periodo === 'vitalicio' ? 'Vitalício' : dateTime(subscription.dataFim || subscription.expiresAt)}</strong><span className="stat-foot">Conforme registro da assinatura</span></article></div> : <EmptyState title="Plano ainda não vinculado" description="Entre em contato com a administração do FixFlowOS para configurar plano, preço e período para a loja." />}

  </div>
}
