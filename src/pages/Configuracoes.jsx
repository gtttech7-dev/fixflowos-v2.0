import { useEffect, useState } from 'react'
import { doc, onSnapshot, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { Save, Plus, Trash2, Settings, Store, SlidersHorizontal, RefreshCw, Check } from 'lucide-react'
import { db } from '../firebase.js'
import { useAuth } from '../contexts/AuthContext.jsx'
import { Alert, Field, LoadingScreen, SectionHeader } from '../components/ui.jsx'

const DEFAULT_STATUSES = [
  { nome: 'Aberta', ordem: 1, ativo: true, considerarValorParado: true, considerarFaturamento: false, considerarAparelhoNaLoja: true },
  { nome: 'Em Análise', ordem: 2, ativo: true, considerarValorParado: true, considerarFaturamento: false, considerarAparelhoNaLoja: true },
  { nome: 'Em diagnóstico', ordem: 3, ativo: true, considerarValorParado: true, considerarFaturamento: false, considerarAparelhoNaLoja: true },
  { nome: 'Em Orçamento', ordem: 4, ativo: true, considerarValorParado: true, considerarFaturamento: false, considerarAparelhoNaLoja: true },
  { nome: 'Aguardando aprovação', ordem: 5, ativo: true, considerarValorParado: true, considerarFaturamento: false, considerarAparelhoNaLoja: true },
  { nome: 'Aguardando peça', ordem: 6, ativo: true, considerarValorParado: true, considerarFaturamento: false, considerarAparelhoNaLoja: true },
  { nome: 'Em reparo', ordem: 7, ativo: true, considerarValorParado: true, considerarFaturamento: false, considerarAparelhoNaLoja: true },
  { nome: 'Garantia', ordem: 8, ativo: true, considerarValorParado: true, considerarFaturamento: false, considerarAparelhoNaLoja: true },
  { nome: 'Concluída', ordem: 9, ativo: true, considerarValorParado: true, considerarFaturamento: true, considerarAparelhoNaLoja: true },
  { nome: 'Aguardando Retirada', ordem: 10, ativo: true, considerarValorParado: true, considerarFaturamento: false, considerarAparelhoNaLoja: true },
  { nome: 'Entregue', ordem: 11, ativo: true, considerarValorParado: false, considerarFaturamento: false, considerarAparelhoNaLoja: false },
  { nome: 'Cancelada', ordem: 12, ativo: true, considerarValorParado: false, considerarFaturamento: false, considerarAparelhoNaLoja: false },
]
export default function Configuracoes() {
  const { user } = useAuth()
  const [store, setStore] = useState({ nome: '', telefone: '', endereco: '', documento: '', observacaoImpressao: '' })
  const [general, setGeneral] = useState(null)
  const [statuses, setStatuses] = useState(DEFAULT_STATUSES)
  const [loading, setLoading] = useState(true)
  const [savingStore, setSavingStore] = useState(false)
  const [savingStatuses, setSavingStatuses] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  useEffect(() => {
    if (!db || !user?.lojaId) { setLoading(false); return undefined }
    const a = onSnapshot(doc(db, 'lojas', user.lojaId), snap => { if (snap.exists()) setStore(old => ({ ...old, ...snap.data() })); setLoading(false) }, err => { setError(err.message); setLoading(false) })
    const b = onSnapshot(doc(db, 'lojas', user.lojaId, 'configuracoes', 'geral'), snap => { const data = snap.exists() ? snap.data() : null; setGeneral(data); setStatuses(data?.statusOS?.length ? data.statusOS : DEFAULT_STATUSES) }, err => setError(err.message))
    return () => { a(); b() }
  }, [user?.lojaId])
  async function saveStore(e) {
    e.preventDefault(); setSavingStore(true); setError(''); setNotice('')
    try { await updateDoc(doc(db, 'lojas', user.lojaId), { nome: store.nome.trim(), telefone: store.telefone.trim(), endereco: store.endereco.trim(), documento: store.documento.trim(), observacaoImpressao: store.observacaoImpressao.trim(), updatedAt: serverTimestamp() }); setNotice('Dados comerciais atualizados.') }
    catch (err) { setError(err.message || 'Falha ao salvar dados da loja.') } finally { setSavingStore(false) }
  }
  async function saveStatuses(e) {
    e.preventDefault(); setSavingStatuses(true); setError(''); setNotice('')
    try {
      const normalized = statuses.map((s, index) => ({ nome: s.nome.trim(), ordem: index + 1, ativo: Boolean(s.ativo), considerarValorParado: Boolean(s.considerarValorParado), considerarFaturamento: Boolean(s.considerarFaturamento), considerarAparelhoNaLoja: Boolean(s.considerarAparelhoNaLoja) }))
      if (normalized.some(s => !s.nome) || new Set(normalized.map(s => s.nome.toLowerCase())).size !== normalized.length) throw new Error('Os nomes dos status são obrigatórios e não podem se repetir.')
      await setDoc(doc(db, 'lojas', user.lojaId, 'configuracoes', 'geral'), { statusOS: normalized, updatedAt: serverTimestamp() }, { merge: true })
      setNotice('Configuração de status salva. O contador de OS não foi alterado.')
    } catch (err) { setError(err.message || 'Falha ao salvar status.') } finally { setSavingStatuses(false) }
  }
  function statusChange(index, key, value) { setStatuses(old => old.map((status, i) => i === index ? { ...status, [key]: value } : status)) }
  function addStatus() { setStatuses(old => [...old, { nome: '', ordem: old.length + 1, ativo: true, considerarValorParado: true, considerarFaturamento: false, considerarAparelhoNaLoja: true }]) }
  function removeStatus(index) { const status = statuses[index]; if (['Entregue', 'Cancelada'].includes(status.nome)) { setError(`O status “${status.nome}” deve permanecer configurado para evitar cálculos inconsistentes.`); return } setStatuses(old => old.filter((_, i) => i !== index)) }
  if (loading) return <LoadingScreen label="Carregando configurações..." />
  return <div className="page-stack"><SectionHeader eyebrow="PERSONALIZAÇÃO DA ASSISTÊNCIA" title="Configurações" description="Atualize os dados usados nos documentos e defina como cada status afeta os indicadores operacionais." />{error && <Alert>{error}</Alert>}{notice && <Alert type="success">{notice}</Alert>}
    <section className="panel"><div className="panel-title-row"><div className="panel-title-with-icon"><span className="panel-heading-icon"><Store size={19} /></span><div><h2>Dados comerciais</h2><p>Essas informações podem aparecer na via do cliente e na etiqueta.</p></div></div></div><form className="modal-form" onSubmit={saveStore}><div className="form-grid"><Field label="Nome da assistência *"><input value={store.nome || ''} onChange={e => setStore(s => ({ ...s, nome: e.target.value }))} required /></Field><Field label="Telefone comercial"><input value={store.telefone || ''} onChange={e => setStore(s => ({ ...s, telefone: e.target.value }))} /></Field><Field label="Endereço"><input value={store.endereco || ''} onChange={e => setStore(s => ({ ...s, endereco: e.target.value }))} /></Field><Field label="CNPJ / documento (opcional)"><input value={store.documento || ''} onChange={e => setStore(s => ({ ...s, documento: e.target.value }))} /></Field><Field label="Observação para impressão"><textarea rows="2" value={store.observacaoImpressao || ''} onChange={e => setStore(s => ({ ...s, observacaoImpressao: e.target.value }))} /></Field></div><div className="modal-footer"><span className="muted-note">ID da loja: {user.lojaId}</span><button type="submit" className="button button-primary" disabled={savingStore}>{savingStore ? <RefreshCw size={16} className="spin" /> : <Save size={16} />} Salvar dados</button></div></form></section>
    <section className="panel"><div className="panel-title-row"><div className="panel-title-with-icon"><span className="panel-heading-icon"><SlidersHorizontal size={19} /></span><div><h2>Configuração dos status de OS</h2><p>Defina quais etapas contam como aparelhos na assistência e quais contribuem para o faturamento de serviços concluídos.</p></div></div><button className="button button-secondary" onClick={addStatus}><Plus size={16} /> Adicionar status</button></div><form onSubmit={saveStatuses}><div className="status-config-list"><div className="status-config-head"><span>Status</span><span>Ativo</span><span>Valor parado</span><span>Na loja</span><span>Faturamento</span><span /></div>{statuses.map((status, index) => <div className="status-config-row" key={index}><input className="status-name-input" aria-label="Nome do status" value={status.nome} onChange={e => statusChange(index, 'nome', e.target.value)} required /><label title="Mostrar esse status no fluxo"><input type="checkbox" checked={status.ativo} onChange={e => statusChange(index, 'ativo', e.target.checked)} /></label><label title="Somar valor da OS ao total parado"><input type="checkbox" checked={status.considerarValorParado} onChange={e => statusChange(index, 'considerarValorParado', e.target.checked)} /></label><label title="Contar como aparelho dentro da assistência"><input type="checkbox" checked={status.considerarAparelhoNaLoja} onChange={e => statusChange(index, 'considerarAparelhoNaLoja', e.target.checked)} /></label><label title="Considerar em indicadores de faturamento"><input type="checkbox" checked={status.considerarFaturamento} onChange={e => statusChange(index, 'considerarFaturamento', e.target.checked)} /></label><button type="button" className="icon-button danger-hover" onClick={() => removeStatus(index)} aria-label="Remover status"><Trash2 size={15} /></button></div>)}</div><div className="config-explainer"><Check size={16} /><span>O indicador “Valor Parado em Aparelhos” utiliza os status marcados em <strong>Valor parado</strong> e <strong>Na loja</strong>. Entregue e Cancelada ficam desmarcados por padrão.</span></div><div className="modal-footer"><span className="muted-note">O contador sequencial de OS é protegido e não pode ser editado nesta tela.</span><button type="submit" className="button button-primary" disabled={savingStatuses}>{savingStatuses ? <RefreshCw size={16} className="spin" /> : <Save size={16} />} Salvar status</button></div></form></section>
  </div>
}
