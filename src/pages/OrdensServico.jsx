import { useEffect, useMemo, useState } from 'react'
import { collection, doc, limit, onSnapshot, orderBy, query } from 'firebase/firestore'
import { Search, Plus, Printer, Pencil, Smartphone, X, Save, RefreshCw, Filter, CheckCircle2, Eye, EyeOff } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext.jsx'
import { db } from '../firebase.js'
import { subscribeOS, createOS, updateOS, revealOSPassword } from '../services/os.js'
import { money, phoneMask, digits, parseBRL, passwordPatternValid, dateTime } from '../utils/format.js'
import { canManageOS, isAdmin } from '../utils/permissions.js'
import { Alert, EmptyState, Field, LoadingScreen, SectionHeader } from '../components/ui.jsx'

const STATUSES = ['Aberta', 'Em Análise', 'Em diagnóstico', 'Em Orçamento', 'Aguardando aprovação', 'Aguardando peça', 'Em reparo', 'Garantia', 'Concluída', 'Aguardando Retirada', 'Entregue', 'Cancelada']
const blankForm = () => ({ cliente: '', telefone: '', marca: '', modelo: '', imei: '', defeito: '', diagnostico: '', tipoSenha: 'Não informado', senha: '', pecas: '', insumosUtilizados: '', valorReparo: '', status: 'Aberta', tecnicoResponsavel: '', observacoes: '', aceiteTermo: false })

function printOS(os, storeName, label = false) {
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${label ? 'Etiqueta' : 'Via do Cliente'} - OS ${os.numeroOS}</title><style>
  *{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#111;margin:0;padding:${label ? '10mm' : '16mm'};font-size:${label ? '12px' : '13px'}}.header{display:flex;justify-content:space-between;align-items:start;border-bottom:2px solid #111;padding-bottom:12px;margin-bottom:16px}.brand{font-weight:800;font-size:20px}.number{font-size:${label ? '30px' : '24px'};font-weight:800}.label{font-size:10px;text-transform:uppercase;color:#555;letter-spacing:1px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:14px 0}.field{border:1px solid #bbb;padding:9px;border-radius:4px}.full{grid-column:1/-1}.value{font-weight:600;margin-top:5px;white-space:pre-wrap;overflow-wrap:anywhere}.footer{margin-top:26px;padding-top:12px;border-top:1px solid #aaa;color:#444;font-size:10px}.signatures{display:grid;grid-template-columns:1fr 1fr;gap:30px;margin-top:45px}.signatures div{text-align:center;border-top:1px solid #444;padding-top:6px}@media print{button{display:none}body{padding:0}}</style></head><body>
  <div class="header"><div><div class="brand">${escapeHtml(storeName || 'Assistência Técnica')}</div><div class="label">FixFlowOS · ordem de serviço</div></div><div style="text-align:right"><div class="label">Número da OS</div><div class="number">#${escapeHtml(os.numeroOS)}</div><div>${escapeHtml(os.status || 'Aberta')}</div></div></div>
  <div class="grid"><div class="field"><div class="label">Cliente</div><div class="value">${escapeHtml(os.cliente || '—')}</div></div><div class="field"><div class="label">Telefone</div><div class="value">${escapeHtml(phoneMask(os.telefone || '')) || '—'}</div></div><div class="field"><div class="label">Aparelho</div><div class="value">${escapeHtml([os.marca, os.modelo].filter(Boolean).join(' ') || '—')}</div></div><div class="field"><div class="label">IMEI</div><div class="value">${escapeHtml(os.imei || '—')}</div></div><div class="field full"><div class="label">Defeito relatado</div><div class="value">${escapeHtml(os.defeito || '—')}</div></div><div class="field full"><div class="label">Diagnóstico</div><div class="value">${escapeHtml(os.diagnostico || 'A definir')}</div></div><div class="field"><div class="label">Valor do reparo</div><div class="value">${money(os.valorReparo)}</div></div><div class="field"><div class="label">Técnico responsável</div><div class="value">${escapeHtml(os.tecnicoResponsavel || '—')}</div></div><div class="field full"><div class="label">Peças de reposição</div><div class="value">${escapeHtml(os.pecas || '—')}</div></div><div class="field full"><div class="label">Insumos utilizados</div><div class="value">${escapeHtml(os.insumosUtilizados || '—')}</div></div><div class="field full"><div class="label">Observações</div><div class="value">${escapeHtml(os.observacoes || '—')}</div></div></div>
  ${label ? '' : '<p>Declaro estar ciente das condições do serviço e autorizo o tratamento dos dados necessários para execução da ordem de serviço, conforme o termo informado pela assistência.</p><div class="signatures"><div>Assinatura do cliente</div><div>Assinatura da assistência</div></div>'}<div class="footer">Emitido em ${new Date().toLocaleString('pt-BR')} · Mantenha este documento para consulta da ordem de serviço.</div><script>window.onload=()=>window.print()<\/script></body></html>`
  const win = window.open('', '_blank', 'width=900,height=700')
  if (!win) { alert('Permita pop-ups para imprimir a OS.'); return }
  win.document.open(); win.document.write(html); win.document.close()
}
function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]) }

export default function OrdensServico() {
  const { user } = useAuth()
  const [orders, setOrders] = useState([])
  const [auditEntries, setAuditEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('Todas')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(blankForm)
  const [saving, setSaving] = useState(false)
  const [revealingPassword, setRevealingPassword] = useState(false)
  const [showOSPassword, setShowOSPassword] = useState(false)
  const [storeName, setStoreName] = useState('')
  const [statusOptions, setStatusOptions] = useState(STATUSES)

  useEffect(() => {
    if (!user?.lojaId || !db) { setLoading(false); return undefined }
    const unsub = subscribeOS(user.lojaId, data => { setOrders(data); setLoading(false) }, err => { setError(err.message); setLoading(false) })
    const unsubAudit = onSnapshot(query(collection(db, 'lojas', user.lojaId, 'auditoriaOS'), orderBy('createdAt', 'desc'), limit(100)), snap => setAuditEntries(snap.docs.map(d => ({ id: d.id, ...d.data() }))), err => setError(err.message))
    return () => { unsub(); unsubAudit() }
  }, [user?.lojaId])
  useEffect(() => {
    if (!user?.lojaId || !db) return
    import('firebase/firestore').then(({ getDoc }) => getDoc(doc(db, 'lojas', user.lojaId))).then(snap => { if (snap.exists()) setStoreName(snap.data().nome || '') }).catch(() => {})
    const unsub = onSnapshot(doc(db, 'lojas', user.lojaId, 'configuracoes', 'geral'), snap => {
      const configured = snap.exists() && Array.isArray(snap.data().statusOS) ? snap.data().statusOS.filter(status => status.ativo !== false).sort((a, b) => Number(a.ordem || 0) - Number(b.ordem || 0)).map(status => status.nome).filter(Boolean) : []
      setStatusOptions(configured.length ? configured : STATUSES)
    }, err => setError(err.message))
    return unsub
  }, [user?.lojaId])
  const filtered = useMemo(() => orders.filter(os => {
    const term = search.toLowerCase().trim()
    const matches = !term || [os.numeroOS, os.cliente, os.telefone, os.modelo, os.imei].some(value => String(value ?? '').toLowerCase().includes(term))
    return matches && (filterStatus === 'Todas' || os.status === filterStatus)
  }), [orders, search, filterStatus])
  const openNew = () => { setEditing(null); setShowOSPassword(false); setForm({ ...blankForm(), status: statusOptions[0] || 'Aberta' }); setError(''); setNotice(''); setModalOpen(true) }
  const openEdit = os => { setEditing(os); setShowOSPassword(false); setForm({ ...blankForm(), ...os, valorReparo: os.valorReparo == null ? '' : String(os.valorReparo), telefone: phoneMask(os.telefone || '') }); setError(''); setNotice(''); setModalOpen(true) }
  const change = (key, value) => setForm(old => ({ ...old, [key]: value }))
  async function submit(event) {
    event.preventDefault(); if (saving) return
    setSaving(true); setError(''); setNotice('')
    try {
      if (!form.cliente.trim()) throw new Error('Informe o nome do cliente.')
      if (form.tipoSenha === 'Padrão (1 a 9)' && form.senha && !passwordPatternValid(form.senha)) throw new Error('A senha padrão só pode usar os números de 1 a 9. O número 0 é proibido.')
      const payload = { ...form, telefone: digits(form.telefone), valorReparo: parseBRL(form.valorReparo), senha: form.tipoSenha === 'Padrão (1 a 9)' ? form.senha : form.senha, tecnicoResponsavel: form.tecnicoResponsavel || (user.cargo === 'tecnico' ? user.nome : ''), lojaId: user.lojaId }
      if (!editing) payload.dataAbertura = new Date().toISOString()
      if (editing) {
        const { id, ...allUpdates } = payload
        const updates = allUpdates
        await updateOS(user.lojaId, editing.id, editing.status, updates, user)
        setNotice('Ordem de serviço atualizada.')
      } else {
        await createOS(payload)
        setNotice('Ordem de serviço criada com sucesso.')
      }
      setModalOpen(false)
    } catch (err) { setError(err.message || 'Não foi possível salvar a OS.') }
    finally { setSaving(false) }
  }
  if (loading) return <LoadingScreen label="Carregando ordens de serviço..." />
  return <div className="page-stack">
    <SectionHeader eyebrow="ATENDIMENTO E BANCADA" title="Ordens de serviço" description="Registre entradas, acompanhe diagnósticos e mantenha o histórico de cada aparelho." action={<button className="button button-primary" onClick={openNew}><Plus size={17} /> Nova OS</button>} />
    {error && !modalOpen && <Alert>{error}</Alert>}{notice && !modalOpen && <Alert type="success">{notice}</Alert>}
    <section className="panel"><div className="table-toolbar"><div className="search-field"><Search size={17} /><input placeholder="Buscar por OS, cliente, telefone, modelo ou IMEI..." value={search} onChange={e => setSearch(e.target.value)} /></div><div className="filter-field"><Filter size={16} /><select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}><option>Todas</option>{Array.from(new Set([form.status, ...statusOptions])).map(status => <option key={status}>{status}</option>)}</select></div></div>
      {filtered.length ? <div className="table-wrap"><table><thead><tr><th>OS</th><th>Cliente / aparelho</th><th>Status</th><th>Valor</th><th>Aberta em</th><th>Ações</th></tr></thead><tbody>{filtered.map(os => <tr key={os.id}><td><span className="os-number">#{os.numeroOS}</span></td><td><div className="cell-primary">{os.cliente || 'Sem nome'}</div><div className="cell-secondary">{[os.marca, os.modelo].filter(Boolean).join(' ') || 'Aparelho não informado'} · {os.telefone ? phoneMask(os.telefone) : 'Sem telefone'}</div></td><td><select className="status-select" value={os.status || 'Aberta'} aria-label={`Alterar status OS ${os.numeroOS}`} disabled={!canManageOS(user)} onChange={async e => { try { await updateOS(user.lojaId, os.id, os.status, { status: e.target.value }, user); setNotice(`Status da OS #${os.numeroOS} atualizado.`); setError('') } catch (err) { setError(err.message) } }}>{Array.from(new Set([os.status || 'Aberta', ...statusOptions])).map(status => <option key={status} value={status}>{status}</option>)}</select></td><td className="amount-cell">{money(os.valorReparo)}</td><td>{dateTime(os.dataAbertura || os.createdAt)}</td><td><div className="table-actions"><button className="icon-button" title="Editar OS" onClick={() => openEdit(os)}><Pencil size={16} /></button><button className="icon-button" title="Imprimir via do cliente" onClick={() => printOS(os, storeName)}><Printer size={16} /></button><button className="icon-button" title="Imprimir etiqueta" onClick={() => printOS(os, storeName, true)}><Smartphone size={16} /></button></div></td></tr>)}</tbody></table></div> : <EmptyState title="Nenhuma ordem encontrada" description={search || filterStatus !== 'Todas' ? 'Altere os filtros para ver outras ordens.' : 'Comece cadastrando o primeiro aparelho recebido pela assistência.'} action={!search && filterStatus === 'Todas' && <button className="button button-primary" onClick={openNew}><Plus size={16} /> Criar ordem de serviço</button>} />}
    </section>
    <section className="panel"><div className="panel-title-row"><div><h2>Histórico de alterações das OS</h2><p>Últimos 100 eventos, com responsável e campos alterados.</p></div><span className="results-count">{auditEntries.length} registros</span></div>{auditEntries.length ? <div className="table-wrap"><table><thead><tr><th>Data</th><th>OS</th><th>Ação</th><th>Responsável</th><th>Alterações</th></tr></thead><tbody>{auditEntries.map(entry => <tr key={entry.id}><td>{dateTime(entry.createdAt || entry.criadoEm)}</td><td>#{entry.numeroOS ?? '—'}</td><td>{entry.acao === 'criacao' ? 'Criação' : 'Edição'}</td><td>{entry.usuarioNome || 'Usuário'}</td><td>{Object.entries(entry.alteracoes || {}).map(([field, values]) => `${field}: ${values?.anterior == null ? '—' : String(values.anterior)} → ${values?.novo == null ? '—' : String(values.novo)}`).join(' · ') || '—'}</td></tr>)}</tbody></table></div> : <EmptyState title="Nenhuma alteração registrada" description="As próximas criações e edições de OS aparecerão aqui." />}</section>
        {modalOpen && <div className="modal-backdrop" role="presentation" onMouseDown={e => e.target === e.currentTarget && setModalOpen(false)}><section className="modal modal-wide" role="dialog" aria-modal="true" aria-labelledby="os-modal-title"><div className="modal-header"><div><span className="eyebrow">CADASTRO TÉCNICO</span><h2 id="os-modal-title">{editing ? `Editar OS #${editing.numeroOS}` : 'Nova ordem de serviço'}</h2><p>Preencha os dados do cliente e do aparelho.</p></div><button className="icon-button" onClick={() => setModalOpen(false)} aria-label="Fechar"><X size={20} /></button></div>
      {error && <Alert>{error}</Alert>}
      <form className="modal-form" onSubmit={submit}><div className="form-grid"><Field label="Nome do cliente *"><input value={form.cliente} onChange={e => change('cliente', e.target.value)} required autoFocus /></Field><Field label="Telefone"><input value={form.telefone} onChange={e => change('telefone', phoneMask(e.target.value))} inputMode="tel" placeholder="(64) 99999-9999" /></Field><Field label="Marca"><input value={form.marca} onChange={e => change('marca', e.target.value)} placeholder="Samsung, Apple, Xiaomi..." /></Field><Field label="Modelo"><input value={form.modelo} onChange={e => change('modelo', e.target.value)} placeholder="Ex.: Galaxy A54" /></Field><Field label="IMEI"><input value={form.imei} onChange={e => change('imei', digits(e.target.value).slice(0, 16))} /></Field><Field label="Status"><select value={form.status} onChange={e => change('status', e.target.value)}>{Array.from(new Set([form.status, ...statusOptions])).map(status => <option key={status}>{status}</option>)}</select></Field><Field label="Defeito relatado"><textarea rows="2" value={form.defeito} onChange={e => change('defeito', e.target.value)} placeholder="Descreva o problema informado pelo cliente" /></Field><Field label="Diagnóstico técnico"><textarea rows="2" value={form.diagnostico} onChange={e => change('diagnostico', e.target.value)} placeholder="Resultado da análise técnica" /></Field><Field label="Tipo de senha"><select value={form.tipoSenha} onChange={e => change('tipoSenha', e.target.value)}><option>Não informado</option><option>Sem senha</option><option>Padrão (1 a 9)</option><option>PIN numérico</option><option>Senha alfanumérica</option></select></Field><Field label="Senha (dado sensível)"><input value={form.senha} onChange={e => change('senha', form.tipoSenha === 'Padrão (1 a 9)' ? e.target.value.replace(/[^1-9]/g, '') : e.target.value)} type={showOSPassword ? 'text' : 'password'} autoComplete="off" placeholder={editing ? 'Deixe vazio para manter a senha salva' : 'Evite registrar se não for necessário'} />{form.tipoSenha === 'Padrão (1 a 9)' && <small>Somente números de 1 a 9. O número 0 é proibido.</small>}{editing && <button type="button" className="text-link" disabled={revealingPassword} onClick={async () => { if (showOSPassword) { setShowOSPassword(false); change('senha', ''); return } setRevealingPassword(true); setError(''); try { const result = await revealOSPassword(editing.id); change('senha', result.senha || ''); setShowOSPassword(Boolean(result.senha)); if (!result.senha) setNotice('Esta OS não possui senha armazenada.') } catch (err) { setError(err.message) } finally { setRevealingPassword(false) } }}>{revealingPassword ? 'Consultando...' : showOSPassword ? <><EyeOff size={13} /> Ocultar senha</> : <><Eye size={13} /> Consultar senha armazenada</>}</button>}</Field><Field label="Peças de reposição"><textarea rows="2" value={form.pecas} onChange={e => change('pecas', e.target.value)} placeholder="Peças cobradas/vinculadas ao estoque" /></Field><Field label="Insumos utilizados"><textarea rows="2" value={form.insumosUtilizados} onChange={e => change('insumosUtilizados', e.target.value)} placeholder="Estanho, fluxo, cola B7000, fita Kapton..." /></Field><Field label="Valor do reparo (R$)"><input value={form.valorReparo} onChange={e => change('valorReparo', e.target.value.replace(/[^0-9.,]/g, ''))} inputMode="decimal" placeholder="0,00" /></Field><Field label="Técnico responsável"><input value={form.tecnicoResponsavel} onChange={e => change('tecnicoResponsavel', e.target.value)} /></Field><Field label="Observações" ><textarea rows="2" value={form.observacoes} onChange={e => change('observacoes', e.target.value)} /></Field><div className="field checkbox-field"><label><input type="checkbox" checked={Boolean(form.aceiteTermo)} onChange={e => change('aceiteTermo', e.target.checked)} /> Confirmo que o cliente foi informado sobre o termo de responsabilidade e tratamento de dados.</label><small>Registre apenas os dados necessários para o atendimento e siga a política de privacidade da assistência.</small></div></div>
        <div className="modal-footer"><span className="muted-note">{editing ? 'As alterações serão salvas no Firestore.' : 'O número sequencial será gerado pelo servidor.'}</span><button type="button" className="button button-secondary" onClick={() => setModalOpen(false)}>Cancelar</button><button type="submit" className="button button-primary" disabled={saving}>{saving ? <><RefreshCw className="spin" size={16} /> Salvando...</> : <><Save size={16} /> {editing ? 'Salvar alterações' : 'Criar OS'}</>}</button></div>
      </form></section></div>}
  </div>
}
