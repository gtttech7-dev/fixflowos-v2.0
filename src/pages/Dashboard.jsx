import { useEffect, useMemo, useState } from 'react'
import { collection, doc, getDoc, getDocs, limit, onSnapshot, orderBy, query } from 'firebase/firestore'
import { Activity, ArrowUpRight, ClipboardList, Clock3, Package, Smartphone, Wallet, Wrench, AlertTriangle, TrendingUp, CircleDollarSign } from 'lucide-react'
import { db } from '../firebase.js'
import { useAuth } from '../contexts/AuthContext.jsx'
import { canReadFinance, isAdmin } from '../utils/permissions.js'
import { money, dateTime, validNumeric } from '../utils/format.js'
import { subscribeOS } from '../services/os.js'
import { stoppedValueByStatus } from '../services/calculations.js'
import { SectionHeader, Alert, EmptyState, LoadingScreen } from '../components/ui.jsx'

export default function Dashboard() {
  const { user } = useAuth()
  const [orders, setOrders] = useState([])
  const [products, setProducts] = useState([])
  const [sales, setSales] = useState([])
  const [cashSessions, setCashSessions] = useState([])
  const [statusConfig, setStatusConfig] = useState([])
  const [subscription, setSubscription] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  useEffect(() => {
    if (!db || !user?.lojaId) { setLoading(false); return undefined }
    const lojaId = user.lojaId
    let ordersReady = false
    const unsubOS = subscribeOS(lojaId, data => { setOrders(data); ordersReady = true; setLoading(false) }, err => { setError(err.message); setLoading(false) })
    const unsubConfig = onSnapshot(doc(db, 'lojas', lojaId, 'configuracoes', 'geral'), snap => setStatusConfig(snap.exists() ? (snap.data().statusOS || []) : []), err => setError(err.message))
    const unsubSubscription = user.cargo === 'admin' ? onSnapshot(doc(db, 'lojas', lojaId, 'assinatura', 'atual'), snap => setSubscription(snap.exists() ? snap.data() : null), err => setError(err.message)) : () => {}
    const load = async () => {
      try {
        const [prodSnap, saleSnap, cashSnap] = await Promise.all([
          getDocs(query(collection(db, 'lojas', lojaId, 'produtos'), limit(250))),
          canReadFinance(user) ? getDocs(query(collection(db, 'lojas', lojaId, 'vendas'), orderBy('createdAt', 'desc'), limit(200))) : Promise.resolve(null),
          ['admin', 'vendedorTecnico'].includes(user.cargo) ? getDocs(query(collection(db, 'lojas', lojaId, 'caixas'), orderBy('abertoEm', 'desc'), limit(10))) : Promise.resolve(null),
        ])
        setProducts(prodSnap.docs.map(d => ({ id: d.id, ...d.data() })))
        if (saleSnap) setSales(saleSnap.docs.map(d => ({ id: d.id, ...d.data() })))
        if (cashSnap) setCashSessions(cashSnap.docs.map(d => ({ id: d.id, ...d.data() })))
      } catch (err) { setError(err.message) }
    }
    load()
    const failSafe = window.setTimeout(() => { if (!ordersReady) setLoading(false) }, 8000)
    return () => { unsubOS(); unsubConfig(); unsubSubscription(); window.clearTimeout(failSafe) }
  }, [user?.lojaId, user?.uid, user?.cargo])

  const stopped = useMemo(() => stoppedValueByStatus(orders, statusConfig), [orders, statusConfig])
  const lowStock = products.filter(p => Number(p.quantidade || 0) <= Number(p.estoqueMinimo || 0) && p.ativo !== false)
  const completedStatusNames = ['Concluída']
  const revenueStatusNames = statusConfig.length ? statusConfig.filter(s => s.considerarFaturamento === true && s.ativo !== false && completedStatusNames.includes(s.nome)).map(s => s.nome) : completedStatusNames
  const serviceRevenue = orders.filter(os => revenueStatusNames.includes(os.status) && os.status !== 'Cancelada' && validNumeric(os.valorReparo)).reduce((sum, os) => sum + Number(os.valorReparo), 0)
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const todayOrders = orders.filter(o => { const d = o.createdAt?.toDate?.() || o.dataAbertura?.toDate?.() || (o.dataAbertura ? new Date(o.dataAbertura) : null); return d && d >= today }).length
  const revenue = sales.filter(s => s.status !== 'cancelada' && s.status !== 'cancelado').reduce((sum, sale) => sum + (typeof sale.total === 'number' && Number.isFinite(sale.total) ? sale.total : 0), 0)
  const activeCash = cashSessions.find(c => c.status === 'aberto')

  if (loading && !orders.length) return <LoadingScreen label="Carregando indicadores da loja..." />
  return <div className="page-stack">
    <SectionHeader eyebrow="VISÃO GERAL" title={`Olá, ${user?.nome?.split(' ')[0] || 'bem-vindo'} 👋`} description="Acompanhe a operação da sua assistência em tempo real." action={<span className="date-chip"><Activity size={15} /> Dados do Firestore</span>} />
    {error && <Alert>{error}</Alert>}
    {(subscription?.status === 'trial' || user?.status === 'trial') && <div className="trial-banner"><div><span className="trial-tag">TESTE GRÁTIS</span><strong>Sua loja está em período de avaliação</strong><p>Consulte a assinatura para verificar a data de término do teste.</p></div><a href="/planos" className="text-link">Ver assinatura <ArrowUpRight size={15} /></a></div>}
    <div className="stats-grid">
      <article className="stat-card"><div className="stat-icon stat-purple"><ClipboardList size={19} /></div><span className="stat-label">Ordens de serviço</span><strong className="stat-value">{orders.length}</strong><span className="stat-foot">{todayOrders} abertas hoje</span></article>
      <article className="stat-card"><div className="stat-icon stat-blue"><Smartphone size={19} /></div><span className="stat-label">Aparelhos na loja</span><strong className="stat-value">{stopped.quantidade}</strong><span className="stat-foot">Em etapas não finalizadas</span></article>
      {canReadFinance(user) && <article className="stat-card"><div className="stat-icon stat-green"><CircleDollarSign size={19} /></div><span className="stat-label">Vendas registradas</span><strong className="stat-value">{money(revenue)}</strong><span className="stat-foot">Amostra dos últimos 200 registros</span></article>}
      <article className="stat-card"><div className="stat-icon stat-orange"><Package size={19} /></div><span className="stat-label">Estoque baixo</span><strong className="stat-value">{lowStock.length}</strong><span className="stat-foot">Produtos no mínimo ou abaixo</span></article>
    </div>

    {canReadFinance(user) && <section className="panel"><div className="panel-title-row"><div><h2>Resumo financeiro operacional</h2><p>Indicadores separados para não confundir faturamento de serviços com vendas do PDV.</p></div></div><div className="finance-summary-grid"><div className="finance-summary-item"><span>Faturamento de serviços (OS)</span><strong>{money(serviceRevenue)}</strong><small>OS em status configurados para faturamento, com valor numérico válido.</small></div><div className="finance-summary-item"><span>Vendas registradas (PDV)</span><strong>{money(revenue)}</strong><small>Soma das vendas não canceladas entre os últimos 200 registros carregados.</small></div></div></section>}

    {canReadFinance(user) && <section className="panel stopped-panel"><div className="panel-heading"><div><span className="eyebrow">CONTROLE OPERACIONAL</span><h2>Valor Parado em Aparelhos</h2><p>Valor estimado das OS que ainda podem estar fisicamente na assistência. Não representa faturamento nem lucro.</p></div><div className="stopped-total"><span>Valor parado</span><strong>{money(stopped.valor)}</strong><small>{stopped.quantidade} aparelhos/OS</small></div></div>
      {stopped.rows.length ? <div className="table-wrap"><table><thead><tr><th>Status</th><th>Quantidade</th><th>Valor associado</th><th>Participação</th></tr></thead><tbody>{stopped.rows.map(row => <tr key={row.status}><td><span className="status-badge"><span className="status-dot" />{row.status}</span></td><td>{row.quantidade}</td><td className="amount-cell">{money(row.valor)}</td><td><div className="progress-cell"><span><i style={{ width: `${stopped.valor > 0 ? Math.max(2, row.valor / stopped.valor * 100) : 0}%` }} /></span><small>{stopped.valor > 0 ? Math.round(row.valor / stopped.valor * 100) : 0}%</small></div></td></tr>)}</tbody></table></div> : <EmptyState title="Nenhum aparelho em aberto" description="Quando houver OS em andamento, a distribuição por status aparecerá aqui." />}
      <div className="panel-note"><AlertTriangle size={15} /> O valor é baseado no campo numérico da OS e nos status configurados. Configure os status para refletir a presença física dos aparelhos.</div>
    </section>}

    <div className="dashboard-bottom-grid"><section className="panel"><div className="panel-title-row"><div><h2>Ordens recentes</h2><p>Últimas ordens registradas</p></div><a className="text-link" href="/ordens-servico">Ver todas <ArrowUpRight size={15} /></a></div>{orders.slice(0, 5).length ? <div className="recent-list">{orders.slice(0, 5).map(os => <div className="recent-row" key={os.id}><div className="recent-device"><Smartphone size={17} /></div><div className="recent-copy"><strong>OS #{os.numeroOS} · {os.modelo || os.aparelho || 'Aparelho'}</strong><small>{os.cliente || 'Cliente não informado'} · {dateTime(os.dataAbertura || os.createdAt)}</small></div><span className={`status-chip status-${String(os.status || '').toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}>{os.status || 'Aberta'}</span></div>)}</div> : <EmptyState title="Nenhuma OS cadastrada" description="Cadastre a primeira ordem para acompanhar o andamento dos serviços." action={<a className="button button-primary" href="/ordens-servico">Criar primeira OS</a>} />}</section>
      <section className="panel"><div className="panel-title-row"><div><h2>Alertas da operação</h2><p>Itens que precisam de atenção</p></div><span className="alert-count">{lowStock.length + (activeCash ? 0 : 1)}</span></div><div className="alert-list">{lowStock.slice(0, 4).map(product => <div className="alert-row" key={product.id}><span className="alert-row-icon"><Package size={16} /></span><div><strong>{product.nome}</strong><small>{Number(product.quantidade || 0)} em estoque · mínimo {Number(product.estoqueMinimo || 0)}</small></div><span className="mini-warning">Baixo</span></div>)}{!activeCash && ['admin', 'vendedorTecnico'].includes(user?.cargo) && <div className="alert-row"><span className="alert-row-icon alert-row-orange"><Wallet size={16} /></span><div><strong>Caixa fechado</strong><small>Abra o caixa para registrar as movimentações.</small></div><a className="text-link" href="/caixa">Abrir</a></div>}{!lowStock.length && (activeCash || !['admin', 'vendedorTecnico'].includes(user?.cargo)) && <div className="success-empty"><span>✓</span><div><strong>Tudo em ordem</strong><small>Nenhum alerta de estoque no momento.</small></div></div>}</div></section></div>
  </div>
}
