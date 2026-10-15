import { useEffect, useMemo, useState } from 'react'
import { addDoc, collection, onSnapshot, orderBy, query, limit } from 'firebase/firestore'
import { Search, ShoppingCart, Plus, Minus, Trash2, CheckCircle2, RefreshCw, ReceiptText, X } from 'lucide-react'
import { db } from '../firebase.js'
import { useAuth } from '../contexts/AuthContext.jsx'
import { apiRequest } from '../services/api.js'
import { money, dateTime } from '../utils/format.js'
import { Alert, EmptyState, Field, LoadingScreen, SectionHeader } from '../components/ui.jsx'

export default function Vendas() {
  const { user } = useAuth()
  const [products, setProducts] = useState([])
  const [sales, setSales] = useState([])
  const [cart, setCart] = useState([])
  const [search, setSearch] = useState('')
  const [discount, setDiscount] = useState('0')
  const [payment, setPayment] = useState('Pix')
  const [cellphoneSale, setCellphoneSale] = useState(false)
  const [cellphoneModel, setCellphoneModel] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [cancelingId, setCancelingId] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [view, setView] = useState('pdv')
  useEffect(() => {
    if (!db || !user?.lojaId) { setLoading(false); return undefined }
    const unsubs = [
      onSnapshot(query(collection(db, 'lojas', user.lojaId, 'produtos'), orderBy('nome')), snap => { setProducts(snap.docs.map(d => ({ id: d.id, ...d.data() }))); setLoading(false) }, err => { setError(err.message); setLoading(false) }),
      onSnapshot(query(collection(db, 'lojas', user.lojaId, 'vendas'), orderBy('createdAt', 'desc'), limit(50)), snap => setSales(snap.docs.map(d => ({ id: d.id, ...d.data() }))), err => setError(err.message)),
    ]
    return () => unsubs.forEach(unsub => unsub())
  }, [user?.lojaId])
  const filtered = products.filter(p => p.ativo !== false && [p.nome, p.categoria, p.sku].some(v => String(v ?? '').toLowerCase().includes(search.toLowerCase().trim())))
  const subtotal = cart.reduce((sum, item) => sum + item.precoVenda * item.quantidade, 0)
  const desconto = Math.min(Math.max(Number(discount) || 0, 0), subtotal)
  const total = Math.max(0, subtotal - desconto)
  function addProduct(product) {
    if (Number(product.quantidade) <= 0) { setError(`Produto sem estoque: ${product.nome}`); return }
    setCart(old => {
      const existing = old.find(i => i.id === product.id)
      if (existing) return old.map(i => i.id === product.id ? { ...i, quantidade: Math.min(i.quantidade + 1, Number(product.quantidade)) } : i)
      return [...old, { id: product.id, nome: product.nome, precoVenda: Number(product.precoVenda) || 0, quantidade: 1, estoque: Number(product.quantidade) || 0 }]
    })
    setError('')
  }
  function setQuantity(id, qty) { setCart(old => old.map(item => item.id === id ? { ...item, quantidade: Math.max(1, Math.min(Number(qty) || 1, item.estoque)) } : item)) }
  async function cancelSale(sale) {
    if (cancelingId || sale.status === 'cancelada') return
    const confirmed = window.confirm(`Cancelar a venda ${sale.numeroVenda || sale.id.slice(0, 8)}? O estoque será estornado. Para vendas em dinheiro, a saída será vinculada ao caixa aberto ou ficará pendente de registro.`)
    if (!confirmed) return
    setCancelingId(sale.id); setError(''); setNotice('')
    try {
      const result = await apiRequest('/api/loja/vendas', { body: { action: 'cancelar', vendaId: sale.id, motivo: 'Cancelamento solicitado pelo administrador' } })
      setNotice(result.message || 'Venda cancelada.')
    } catch (err) { setError(err.message || 'Não foi possível cancelar a venda.') }
    finally { setCancelingId('') }
  }
  async function finishSale() {
    if (saving) return
    if (!cart.length) { setError('Adicione pelo menos um item ao carrinho.'); return }
    setSaving(true); setError(''); setNotice('')
    try {
      const result = await apiRequest('/api/loja/vendas', { body: { itens: cart.map(({ id, quantidade }) => ({ produtoId: id, quantidade })), desconto: desconto, formaPagamento: payment, vendaCelular: cellphoneSale, modeloCelular: cellphoneSale ? cellphoneModel.trim() : '', idempotencyKey: crypto.randomUUID() } })
      setCart([]); setDiscount('0'); setCellphoneSale(false); setCellphoneModel(''); setNotice(`Venda #${result.vendaId || 'registrada'} concluída.`); setView('historico')
    } catch (err) { setError(err.message || 'Não foi possível finalizar a venda.') }
    finally { setSaving(false) }
  }
  if (loading) return <LoadingScreen label="Carregando PDV..." />
  return <div className="page-stack">
    <SectionHeader eyebrow="VENDA DE BALCÃO" title="Vendas / PDV" description="Monte o carrinho, confira os totais e registre a movimentação com baixa de estoque." action={<div className="segmented-control"><button className={view === 'pdv' ? 'segment-active' : ''} onClick={() => setView('pdv')}><ShoppingCart size={15} /> PDV</button><button className={view === 'historico' ? 'segment-active' : ''} onClick={() => setView('historico')}><ReceiptText size={15} /> Histórico</button></div>} />
    {error && <Alert>{error}</Alert>}{notice && <Alert type="success">{notice}</Alert>}
    {view === 'historico' ? <section className="panel"><div className="panel-title-row"><div><h2>Vendas recentes</h2><p>Últimos registros da loja</p></div><span className="results-count">{sales.length} vendas</span></div>{sales.length ? <div className="table-wrap"><table><thead><tr><th>Venda</th><th>Data</th><th>Responsável</th><th>Pagamento</th><th>Valor</th><th>Status</th>{user?.cargo === 'admin' && <th>Ações</th>}</tr></thead><tbody>{sales.map(s => <tr key={s.id}><td><strong>#{s.numeroVenda || s.id.slice(0, 7)}</strong></td><td>{dateTime(s.createdAt)}</td><td>{s.usuarioNome || '—'}</td><td>{s.formaPagamento || '—'}</td><td className="amount-cell">{money(s.total)}</td><td><span className={`status-chip ${s.status === 'cancelada' ? 'status-low' : 'status-ok'}`}>{s.status === 'cancelada' ? 'Cancelada' : s.status || 'Concluída'}</span></td>{user?.cargo === 'admin' && <td>{s.status !== 'cancelada' ? <button className="button button-danger button-small" onClick={() => cancelSale(s)} disabled={Boolean(cancelingId)}>{cancelingId === s.id ? <RefreshCw size={14} className="spin" /> : <X size={14} />} Cancelar</button> : <span className="cell-secondary">—</span>}</td>}</tr>)}</tbody></table></div> : <EmptyState title="Nenhuma venda registrada" description="As vendas confirmadas aparecerão aqui." />}</section> : <div className="pos-layout"><section className="panel pos-products"><div className="panel-title-row"><div><h2>Produtos</h2><p>Selecione os itens para adicionar ao carrinho.</p></div><span className="results-count">{filtered.length} produtos</span></div><div className="search-field pos-search"><Search size={17} /><input placeholder="Buscar produto ou SKU..." value={search} onChange={e => setSearch(e.target.value)} /></div>{filtered.length ? <div className="pos-product-grid">{filtered.map(product => <button className="pos-product-card" key={product.id} onClick={() => addProduct(product)} disabled={Number(product.quantidade) <= 0}><div className="pos-product-icon"><Plus size={18} /></div><strong>{product.nome}</strong><small>{product.categoria || 'Produto'}</small><span>{money(product.precoVenda)}</span><em>{product.quantidade} disponíveis</em></button>)}</div> : <EmptyState title="Nenhum produto disponível" description="Cadastre produtos no estoque antes de iniciar uma venda." />}</section>
      <aside className="panel cart-panel"><div className="cart-heading"><div className="cart-icon"><ShoppingCart size={18} /></div><div><h2>Carrinho</h2><p>{cart.reduce((sum, item) => sum + item.quantidade, 0)} unidade(s)</p></div></div>{cart.length ? <div className="cart-items">{cart.map(item => <div className="cart-item" key={item.id}><div className="cart-item-info"><strong>{item.nome}</strong><small>{money(item.precoVenda)} cada</small></div><div className="cart-item-controls"><button className="icon-button mini" onClick={() => setQuantity(item.id, item.quantidade - 1)}><Minus size={13} /></button><span>{item.quantidade}</span><button className="icon-button mini" onClick={() => setQuantity(item.id, item.quantidade + 1)} disabled={item.quantidade >= item.estoque}><Plus size={13} /></button><button className="icon-button mini danger-hover" onClick={() => setCart(old => old.filter(i => i.id !== item.id))}><Trash2 size={13} /></button></div><strong className="cart-line-total">{money(item.precoVenda * item.quantidade)}</strong></div>)}</div> : <div className="cart-empty"><ShoppingCart size={26} /><strong>Seu carrinho está vazio</strong><span>Selecione um produto para começar.</span></div>}
        <div className="cart-summary"><div><span>Subtotal</span><strong>{money(subtotal)}</strong></div><Field label="Desconto (R$)"><input type="number" min="0" max={subtotal} step="0.01" value={discount} onChange={e => setDiscount(e.target.value)} disabled={!cart.length} /></Field><Field label="Forma de pagamento"><select value={payment} onChange={e => setPayment(e.target.value)}><option>Pix</option><option>Dinheiro</option><option>Cartão de débito</option><option>Cartão de crédito</option></select></Field><label className="checkbox-field"><input type="checkbox" checked={cellphoneSale} onChange={e => setCellphoneSale(e.target.checked)} /> Esta venda inclui um celular</label>{cellphoneSale && <Field label="Modelo do celular (opcional)"><input value={cellphoneModel} onChange={e => setCellphoneModel(e.target.value)} placeholder="Ex.: Redmi Note 13" /></Field>}<div className="cart-total"><span>Total</span><strong>{money(total)}</strong></div><button className="button button-primary checkout-button" onClick={finishSale} disabled={saving || !cart.length}>{saving ? <><RefreshCw size={16} className="spin" /> Processando...</> : <><CheckCircle2 size={17} /> Confirmar venda</>}</button><small className="cart-security-note">O servidor recalcula os valores e valida o estoque antes de confirmar.</small></div>
      </aside></div>}
  </div>
}
