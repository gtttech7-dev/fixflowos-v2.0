import { useEffect, useState } from 'react'
import { addDoc, collection, onSnapshot, orderBy, query, serverTimestamp } from 'firebase/firestore'
import { UserPlus, Users, Banknote, Plus, X, Save, RefreshCw, ShieldCheck, Clock3 } from 'lucide-react'
import { db } from '../firebase.js'
import { useAuth } from '../contexts/AuthContext.jsx'
import { apiRequest } from '../services/api.js'
import { money, dateTime } from '../utils/format.js'
import { Alert, EmptyState, Field, LoadingScreen, SectionHeader } from '../components/ui.jsx'

export default function Equipe() {
  const { user } = useAuth()
  const [employees, setEmployees] = useState([])
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [showEmployee, setShowEmployee] = useState(false)
  const [showEntry, setShowEntry] = useState(false)
  const [employee, setEmployee] = useState({ nome: '', email: '', senha: '', cargo: 'tecnico' })
  const [entry, setEntry] = useState({ funcionarioId: '', tipo: 'salario', valor: '', descricao: '', competencia: new Date().toISOString().slice(0, 7) })
  const [busy, setBusy] = useState(false)
  const [updateBusyId, setUpdateBusyId] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  useEffect(() => {
    if (!db || !user?.lojaId) { setLoading(false); return undefined }
    const unsub1 = onSnapshot(query(collection(db, 'lojas', user.lojaId, 'funcionarios'), orderBy('nome')), snap => { setEmployees(snap.docs.map(d => ({ id: d.id, ...d.data() }))); setLoading(false) }, err => { setError(err.message); setLoading(false) })
    const unsub2 = onSnapshot(query(collection(db, 'lojas', user.lojaId, 'rhFinanceiro'), orderBy('createdAt', 'desc')), snap => setEntries(snap.docs.map(d => ({ id: d.id, ...d.data() }))), err => setError(err.message))
    return () => { unsub1(); unsub2() }
  }, [user?.lojaId])
  async function createEmployee(e) {
    e.preventDefault(); if (busy) return
    setBusy(true); setError(''); setNotice('')
    try { await apiRequest('/api/loja/funcionarios', { body: { action: 'criar', ...employee } }); setNotice('Funcionário criado. Oriente a pessoa a alterar a senha após o primeiro acesso.'); setShowEmployee(false); setEmployee({ nome: '', email: '', senha: '', cargo: 'tecnico' }) }
    catch (err) { setError(err.message) } finally { setBusy(false) }
  }
  async function updateEmployee(emp, patch) {
    if (updateBusyId) return
    const next = { nome: emp.nome, cargo: patch.cargo ?? emp.cargo, status: patch.status ?? emp.status ?? 'active' }
    setUpdateBusyId(emp.id); setError(''); setNotice('')
    try {
      const result = await apiRequest('/api/loja/funcionarios', { body: { action: 'atualizar', uid: emp.uid || emp.id, ...next } })
      setNotice(result.message || 'Funcionário atualizado.')
    } catch (err) { setError(err.message || 'Não foi possível atualizar o funcionário.') }
    finally { setUpdateBusyId('') }
  }
  async function createEntry(e) {
    e.preventDefault(); if (busy) return
    setBusy(true); setError(''); setNotice('')
    try {
      if (!(Number(entry.valor) >= 0) || !entry.funcionarioId) throw new Error('Selecione um funcionário e informe um valor válido.')
      await addDoc(collection(db, 'lojas', user.lojaId, 'rhFinanceiro'), { funcionarioId: entry.funcionarioId, funcionarioNome: employees.find(x => x.id === entry.funcionarioId)?.nome || '', tipo: entry.tipo, valor: Number(entry.valor), descricao: entry.descricao.trim(), competencia: entry.competencia, responsavelUid: user.uid, responsavelNome: user.nome || user.email, createdAt: serverTimestamp() })
      setNotice('Lançamento de RH registrado.'); setShowEntry(false); setEntry({ funcionarioId: '', tipo: 'salario', valor: '', descricao: '', competencia: new Date().toISOString().slice(0, 7) })
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }
  if (loading) return <LoadingScreen label="Carregando equipe..." />
  const total = entries.filter(x => x.tipo === 'salario' || x.tipo === 'adiantamento' || x.tipo === 'vale').reduce((sum, x) => sum + (Number(x.valor) || 0), 0)
  return <div className="page-stack"><SectionHeader eyebrow="PESSOAS E LANÇAMENTOS" title="Equipe / RH" description="Gerencie os acessos da equipe e mantenha um histórico dos lançamentos relacionados a funcionários." action={<><button className="button button-secondary" onClick={() => setShowEntry(true)} disabled={!employees.length}><Plus size={16} /> Lançamento</button><button className="button button-primary" onClick={() => setShowEmployee(true)}><UserPlus size={17} /> Novo funcionário</button></>} />
    {error && <Alert>{error}</Alert>}{notice && <Alert type="success">{notice}</Alert>}
    <div className="stats-grid"><article className="stat-card"><div className="stat-icon stat-purple"><Users size={19} /></div><span className="stat-label">Pessoas cadastradas</span><strong className="stat-value">{employees.length}</strong><span className="stat-foot">Funcionários e acessos vinculados</span></article><article className="stat-card"><div className="stat-icon stat-green"><Banknote size={19} /></div><span className="stat-label">Lançamentos registrados</span><strong className="stat-value">{entries.length}</strong><span className="stat-foot">Histórico de RH</span></article><article className="stat-card"><div className="stat-icon stat-orange"><Clock3 size={19} /></div><span className="stat-label">Total dos lançamentos</span><strong className="stat-value">{money(total)}</strong><span className="stat-foot">Somatório histórico, não saldo contábil</span></article></div>
    <section className="panel"><div className="panel-title-row"><div><h2>Funcionários</h2><p>Cargos e acesso ao sistema</p></div><span className="private-tag"><ShieldCheck size={14} /> Área restrita ao Admin</span></div>{employees.length ? <div className="table-wrap"><table><thead><tr><th>Funcionário</th><th>Cargo</th><th>Status</th><th>Cadastro</th></tr></thead><tbody>{employees.map(emp => <tr key={emp.id}><td><div className="product-cell"><div className="avatar-small">{String(emp.nome || 'U')[0].toUpperCase()}</div><div><div className="cell-primary">{emp.nome}</div><div className="cell-secondary">{emp.email}</div></div></div></td><td>{emp.cargo === 'admin' || (emp.uid || emp.id) === user.uid ? (({admin:'Admin', vendedorTecnico:'Vendedor Técnico', tecnico:'Técnico'})[emp.cargo] || emp.cargo) : <select className="status-select" aria-label={`Cargo de ${emp.nome}`} value={emp.cargo} disabled={updateBusyId === emp.id || Boolean(updateBusyId)} onChange={e => updateEmployee(emp, { cargo: e.target.value })}><option value="tecnico">Técnico</option><option value="vendedorTecnico">Vendedor Técnico</option></select>}</td><td>{emp.cargo === 'admin' || (emp.uid || emp.id) === user.uid ? <span className={`status-chip ${(emp.status || 'active') === 'suspended' ? 'status-low' : 'status-ok'}`}>{(emp.status || 'active') === 'suspended' ? 'Suspenso' : 'Ativo'}</span> : <select className="status-select" aria-label={`Status de ${emp.nome}`} value={emp.status || 'active'} disabled={updateBusyId === emp.id || Boolean(updateBusyId)} onChange={e => updateEmployee(emp, { status: e.target.value })}><option value="active">Ativo</option><option value="suspended">Suspender</option></select>}</td><td>{dateTime(emp.createdAt)}{updateBusyId === emp.id && <div className="cell-secondary">Salvando...</div>}</td></tr>)}</tbody></table></div> : <EmptyState title="Nenhum funcionário cadastrado" description="Crie acessos individuais com o cargo apropriado para cada pessoa da assistência." action={<button className="button button-primary" onClick={() => setShowEmployee(true)}><UserPlus size={16} /> Adicionar funcionário</button>} />}</section>
    <section className="panel"><div className="panel-title-row"><div><h2>Lançamentos de RH</h2><p>Salários, adiantamentos, vales e outros registros</p></div></div>{entries.length ? <div className="table-wrap"><table><thead><tr><th>Funcionário</th><th>Tipo</th><th>Competência</th><th>Descrição</th><th>Responsável</th><th>Valor</th></tr></thead><tbody>{entries.map(item => <tr key={item.id}><td>{item.funcionarioNome || '—'}</td><td>{({ salario: 'Salário', adiantamento: 'Adiantamento', vale: 'Vale', outro: 'Outro' })[item.tipo] || item.tipo}</td><td>{item.competencia || '—'}</td><td>{item.descricao || '—'}</td><td>{item.responsavelNome || '—'}</td><td className="amount-cell">{money(item.valor)}</td></tr>)}</tbody></table></div> : <EmptyState title="Sem lançamentos de RH" description="Registre o primeiro lançamento para iniciar o histórico." />}</section>
    {showEmployee && <div className="modal-backdrop"><section className="modal" role="dialog" aria-modal="true"><div className="modal-header"><div><h2>Novo funcionário</h2><p>O acesso será criado pelo servidor administrativo.</p></div><button className="icon-button" onClick={() => setShowEmployee(false)}><X size={19} /></button></div>{error && <Alert>{error}</Alert>}<form className="modal-form" onSubmit={createEmployee}><div className="form-grid"><Field label="Nome completo *"><input value={employee.nome} onChange={e => setEmployee(s => ({ ...s, nome: e.target.value }))} required /></Field><Field label="E-mail de acesso *"><input type="email" value={employee.email} onChange={e => setEmployee(s => ({ ...s, email: e.target.value }))} required /></Field><Field label="Senha temporária *"><input type="password" minLength="8" autoComplete="new-password" value={employee.senha} onChange={e => setEmployee(s => ({ ...s, senha: e.target.value }))} required /><small>Use uma senha temporária segura e oriente a troca após o primeiro acesso.</small></Field><Field label="Cargo *"><select value={employee.cargo} onChange={e => setEmployee(s => ({ ...s, cargo: e.target.value }))}><option value="tecnico">Técnico</option><option value="vendedorTecnico">Vendedor Técnico</option></select></Field></div><div className="modal-footer"><button className="button button-secondary" type="button" onClick={() => setShowEmployee(false)}>Cancelar</button><button className="button button-primary" disabled={busy}>{busy ? <RefreshCw size={16} className="spin" /> : <UserPlus size={16} />} Criar acesso</button></div></form></section></div>}
    {showEntry && <div className="modal-backdrop"><section className="modal" role="dialog" aria-modal="true"><div className="modal-header"><div><h2>Novo lançamento de RH</h2><p>O registro ficará restrito à administração.</p></div><button className="icon-button" onClick={() => setShowEntry(false)}><X size={19} /></button></div><form className="modal-form" onSubmit={createEntry}><div className="form-grid"><Field label="Funcionário *"><select value={entry.funcionarioId} onChange={e => setEntry(s => ({ ...s, funcionarioId: e.target.value }))} required><option value="">Selecione...</option>{employees.map(emp => <option value={emp.id} key={emp.id}>{emp.nome}</option>)}</select></Field><Field label="Tipo de lançamento"><select value={entry.tipo} onChange={e => setEntry(s => ({ ...s, tipo: e.target.value }))}><option value="salario">Salário</option><option value="adiantamento">Adiantamento</option><option value="vale">Vale</option><option value="outro">Outro</option></select></Field><Field label="Valor (R$) *"><input type="number" min="0" step="0.01" value={entry.valor} onChange={e => setEntry(s => ({ ...s, valor: e.target.value }))} required /></Field><Field label="Competência"><input type="month" value={entry.competencia} onChange={e => setEntry(s => ({ ...s, competencia: e.target.value }))} /></Field><Field label="Descrição"><textarea rows="3" value={entry.descricao} onChange={e => setEntry(s => ({ ...s, descricao: e.target.value }))} /></Field></div><div className="modal-footer"><button className="button button-secondary" type="button" onClick={() => setShowEntry(false)}>Cancelar</button><button className="button button-primary" disabled={busy}>{busy ? <RefreshCw size={16} className="spin" /> : <Save size={16} />} Registrar</button></div></form></section></div>}
  </div>
}
