import { useCallback, useEffect, useState } from 'react'
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore'
import { Package, Plus, Search, Pencil, Trash2, AlertTriangle, X, Save, RefreshCw, Boxes } from 'lucide-react'
import { db } from '../firebase.js'
import { useAuth } from '../contexts/AuthContext.jsx'
import { canManageStock, isAdmin } from '../utils/permissions.js'
import { money } from '../utils/format.js'
import { getCosts, saveProduct, removeProduct } from '../services/estoque.js'
import { Alert, EmptyState, Field, LoadingScreen, SectionHeader } from '../components/ui.jsx'

const emptyForm = () => ({ nome: '', categoria: 'Peças', sku: '', quantidade: '0', estoqueMinimo: '1', custo: '', precoVenda: '0', fornecedor: '' })
export default function Estoque() {
  const { user } = useAuth()
  const [products, setProducts] = useState([])
  const [costs, setCosts] = useState({})
  const [loading, setLoading] = useState(true)
  const [queryText, setQueryText] = useState('')
  const [modal, setModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const canManage = canManageStock(user)
  useEffect(() => {
    if (!db || !user?.lojaId) { setLoading(false); return undefined }
    const unsub = onSnapshot(query(collection(db, 'lojas', user.lojaId, 'produtos'), orderBy('nome')), snap => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      setProducts(list); setLoading(false)
      if (isAdmin(user)) getCosts(user.lojaId, list.map(p => p.id)).then(setCosts)
    }, err => { setError(err.message); setLoading(false) })
    return unsub
  }, [user?.lojaId, user?.cargo])
  const filtered = products.filter(p => p.ativo !== false && [p.nome, p.categoria, p.sku, p.fornecedor].some(value => String(value ?? '').toLowerCase().includes(queryText.toLowerCase().trim())))
  const openCreate = () => { setEditing(null); setForm(emptyForm()); setError(''); setModal(true) }
  const openEdit = product => { setEditing(product); setForm({ ...emptyForm(), ...product, custo: costs[product.id] ?? '' }); setError(''); setModal(true) }
  const change = (key, value) => setForm(old => ({ ...old, [key]: value }))
  async function submit(event) {
    event.preventDefault(); if (saving) return
    setSaving(true); setError(''); setNotice('')
    try {
      if (!form.nome.trim()) throw new Error('Informe o nome do produto.')
      await saveProduct(user.lojaId, form, editing?.id)
      setNotice(editing ? 'Produto atualizado.' : 'Produto cadastrado.')
      setModal(false)
    } catch (err) { setError(err.message || 'Não foi possível salvar o produto.') }
    finally { setSaving(false) }
  }
  async function handleDelete(product) {
    if (!window.confirm(`Desativar/remover o produto “${product.nome}”? Verifique se ele não possui vendas vinculadas.`)) return
    try { await removeProduct(user.lojaId, product.id); setNotice('Produto removido.'); setError('') } catch (err) { setError(err.message) }
  }
  if (loading) return <LoadingScreen label="Carregando estoque..." />
  const lowStock = products.filter(p => Number(p.quantidade || 0) <= Number(p.estoqueMinimo || 0))
  return <div className="page-stack">
    <SectionHeader eyebrow="PEÇAS E COMPONENTES" title="Estoque" description="Consulte disponibilidade de peças e acompanhe os níveis mínimos." action={canManage && <button className="button button-primary" onClick={openCreate}><Plus size={17} /> Novo produto</button>} />
    {error && <Alert>{error}</Alert>}{notice && <Alert type="success">{notice}</Alert>}
    <div className="stats-grid stock-stats"><article className="stat-card"><div className="stat-icon stat-purple"><Boxes size={19} /></div><span className="stat-label">Produtos cadastrados</span><strong className="stat-value">{products.length}</strong><span className="stat-foot">Itens no catálogo</span></article><article className="stat-card"><div className="stat-icon stat-orange"><AlertTriangle size={19} /></div><span className="stat-label">Estoque baixo</span><strong className="stat-value">{lowStock.length}</strong><span className="stat-foot">No limite ou abaixo</span></article><article className="stat-card"><div className="stat-icon stat-blue"><Package size={19} /></div><span className="stat-label">Unidades disponíveis</span><strong className="stat-value">{products.reduce((sum, p) => sum + Number(p.quantidade || 0), 0)}</strong><span className="stat-foot">Soma das quantidades cadastradas</span></article></div>
    {lowStock.length > 0 && <div className="inventory-alert"><AlertTriangle size={17} /><div><strong>{lowStock.length} produto(s) precisam de reposição</strong><p>{lowStock.slice(0, 3).map(p => `${p.nome} (${p.quantidade})`).join(' · ')}{lowStock.length > 3 ? '…' : ''}</p></div></div>}
    <section className="panel"><div className="table-toolbar"><div className="search-field"><Search size={17} /><input placeholder="Buscar peça, categoria, SKU ou fornecedor..." value={queryText} onChange={e => setQueryText(e.target.value)} /></div><span className="results-count">{filtered.length} itens</span></div>
      {filtered.length ? <div className="table-wrap"><table><thead><tr><th>Produto</th><th>Categoria / SKU</th><th>Quantidade</th><th>Preço de venda</th>{isAdmin(user) && <th>Custo</th>}<th>Status</th>{canManage && <th>Ações</th>}</tr></thead><tbody>{filtered.map(p => { const low = Number(p.quantidade || 0) <= Number(p.estoqueMinimo || 0); return <tr key={p.id}><td><div className="product-cell"><div className="product-icon"><Package size={17} /></div><div><div className="cell-primary">{p.nome}</div><div className="cell-secondary">{p.fornecedor || 'Fornecedor não informado'}</div></div></div></td><td><div className="cell-primary">{p.categoria || 'Sem categoria'}</div><div className="cell-secondary">{p.sku || 'Sem SKU'}</div></td><td><strong className={low ? 'text-warning' : ''}>{p.quantidade ?? 0}</strong><div className="cell-secondary">mínimo {p.estoqueMinimo ?? 0}</div></td><td className="amount-cell">{money(p.precoVenda)}</td>{isAdmin(user) && <td>{costs[p.id] == null ? '—' : money(costs[p.id])}</td>}<td><span className={`status-chip ${low ? 'status-low' : 'status-ok'}`}>{low ? 'Repor estoque' : 'Disponível'}</span></td>{canManage && <td><div className="table-actions"><button className="icon-button" title="Editar produto" onClick={() => openEdit(p)}><Pencil size={16} /></button><button className="icon-button danger-hover" title="Remover produto" onClick={() => handleDelete(p)}><Trash2 size={16} /></button></div></td>}</tr>})}</tbody></table></div> : <EmptyState title="Nenhum produto encontrado" description={queryText ? 'Tente buscar por outro nome ou SKU.' : canManage ? 'Cadastre as primeiras peças para acompanhar quantidades e reposição.' : 'Nenhum produto foi cadastrado para sua assistência.'} action={!queryText && canManage && <button className="button button-primary" onClick={openCreate}><Plus size={16} /> Cadastrar produto</button>} />}
    </section>
    {modal && <div className="modal-backdrop" onMouseDown={e => e.target === e.currentTarget && setModal(false)}><section className="modal" role="dialog" aria-modal="true"><div className="modal-header"><div><span className="eyebrow">CATÁLOGO</span><h2>{editing ? 'Editar produto' : 'Novo produto'}</h2><p>Cadastre quantidade e regras de reposição.</p></div><button className="icon-button" onClick={() => setModal(false)}><X size={19} /></button></div>{error && <Alert>{error}</Alert>}<form className="modal-form" onSubmit={submit}><div className="form-grid"><Field label="Nome do produto *"><input value={form.nome} onChange={e => change('nome', e.target.value)} required autoFocus /></Field><Field label="Categoria"><select value={form.categoria} onChange={e => change('categoria', e.target.value)}><option>Peças</option><option>Acessórios</option><option>Ferramentas</option><option>Insumos</option><option>Outros</option></select></Field><Field label="SKU"><input value={form.sku} onChange={e => change('sku', e.target.value)} /></Field><Field label="Fornecedor"><input value={form.fornecedor} onChange={e => change('fornecedor', e.target.value)} /></Field><Field label="Quantidade *"><input type="number" min="0" step="1" value={form.quantidade} onChange={e => change('quantidade', e.target.value)} required /></Field><Field label="Estoque mínimo"><input type="number" min="0" step="1" value={form.estoqueMinimo} onChange={e => change('estoqueMinimo', e.target.value)} /></Field><Field label="Preço de venda (R$) *"><input type="number" min="0" step="0.01" value={form.precoVenda} onChange={e => change('precoVenda', e.target.value)} required /></Field>{isAdmin(user) && <Field label="Custo de aquisição (R$)"><input type="number" min="0" step="0.01" value={form.custo} onChange={e => change('custo', e.target.value)} /><small>Visível somente ao Admin.</small></Field>}</div><div className="modal-footer"><button type="button" className="button button-secondary" onClick={() => setModal(false)}>Cancelar</button><button type="submit" className="button button-primary" disabled={saving}>{saving ? <RefreshCw className="spin" size={16} /> : <Save size={16} />}{saving ? ' Salvando...' : ' Salvar produto'}</button></div></form></section></div>}
  </div>
}
