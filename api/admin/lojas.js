import { authenticatedProfile, requireMethod, sendError, periodEnd } from '../_lib/firebaseAdmin.js'

const PLANS = [
  { id: 'plano1', nome: 'Plano 1', preco: 499, limiteUsuarios: 7 },
  { id: 'plano2', nome: 'Plano 2', preco: 599, limiteUsuarios: 10 },
  { id: 'plano3', nome: 'Plano 3', preco: 750, limiteUsuarios: null },
]
export default async function handler(req, res) {
  try {
    const ctx = await authenticatedProfile(req, { superAdmin: true })
    const { auth, db, FieldValue, Timestamp } = ctx
    requireMethod(req, ['GET', 'POST'])
    if (req.method === 'GET') {
      const planConfig = await db.collection('configuracoesSaaS').doc('planos').get()
      const planos = planConfig.exists && Array.isArray(planConfig.data().planos) ? planConfig.data().planos : PLANS
      const snapshot = await db.collection('lojas').orderBy('createdAt', 'desc').limit(500).get()
      const lojas = await Promise.all(snapshot.docs.map(async snap => {
        const data = snap.data()
        const subSnap = await snap.ref.collection('assinatura').doc('atual').get()
        const ownerUid = data.ownerUid || ''
        let ownerEmail = data.ownerEmail || ''
        if (!ownerEmail && ownerUid) { try { ownerEmail = (await auth.getUser(ownerUid)).email || '' } catch {} }
        let assinatura = subSnap.exists ? subSnap.data() : null
        if (assinatura && ['active', 'trial'].includes(assinatura.status) && assinatura.periodo !== 'vitalicio') {
          const end = assinatura.dataFim?.toDate ? assinatura.dataFim.toDate() : (assinatura.dataFim ? new Date(assinatura.dataFim) : null)
          if (end instanceof Date && Number.isFinite(end.getTime()) && end.getTime() <= Date.now()) assinatura = { ...assinatura, status: 'expired' }
        }
        return { lojaId: snap.id, nome: data.nome || 'Loja sem nome', status: data.status || 'active', ownerUid, ownerEmail, assinatura, createdAt: data.createdAt || null }
      }))
      return res.status(200).json({ lojas, planos })
    }
    const body = req.body || {}
    if (body.action === 'atualizar-planos') {
      if (!Array.isArray(body.planos) || body.planos.length !== 3) return res.status(400).json({ error: 'Informe os três planos base.' })
      const normalized = body.planos.map(item => {
        const base = PLANS.find(p => p.id === item.id)
        const preco = Number(item.preco)
        if (!base || !Number.isFinite(preco) || preco < 0) { const error = new Error('Preço de plano inválido.'); error.status = 400; throw error }
        return { ...base, nome: base.nome, preco }
      })
      if (new Set(normalized.map(p => p.id)).size !== 3) return res.status(400).json({ error: 'Os planos precisam ser distintos.' })
      await db.collection('configuracoesSaaS').doc('planos').set({ planos: normalized, updatedAt: FieldValue.serverTimestamp(), updatedBy: ctx.profile.uid })
      return res.status(200).json({ ok: true, planos: normalized, message: 'Preços base atualizados.' })
    }
    const planConfig = await db.collection('configuracoesSaaS').doc('planos').get()
    const configuredPlans = planConfig.exists && Array.isArray(planConfig.data().planos) ? planConfig.data().planos : PLANS
    const nomeLoja = String(body.nomeLoja || '').trim()
    const nomeDono = String(body.nomeDono || '').trim()
    const emailDono = String(body.emailDono || '').trim().toLowerCase()
    const senhaInicial = String(body.senhaInicial || '')
    const plano = configuredPlans.find(item => item.id === body.planoId)
    const preco = Number(body.preco)
    const periodo = String(body.periodo || '')
    if (!nomeLoja || !nomeDono || !emailDono || senhaInicial.length < 8 || !plano) return res.status(400).json({ error: 'Preencha loja, proprietário, e-mail, senha e plano válido.' })
    if (!Number.isFinite(preco) || preco < 0) return res.status(400).json({ error: 'Preço inválido.' })
    if (!['semanal', 'mensal', 'tresMeses', 'anual', 'vitalicio'].includes(periodo)) return res.status(400).json({ error: 'Período de assinatura inválido.' })
    const start = new Date()
    const trial = body.testeGratis === true
    const finish = trial ? new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000) : periodEnd(periodo, start)
    const owner = await auth.createUser({ email: emailDono, password: senhaInicial, displayName: nomeDono, disabled: false })
    const storeRef = db.collection('lojas').doc()
    const batch = db.batch()
    batch.set(storeRef, { nome: nomeLoja, ownerUid: owner.uid, ownerEmail: emailDono, status: 'active', assinaturaStatus: trial ? 'trial' : 'active', assinaturaPeriodo: periodo, assinaturaDataFim: finish ? Timestamp.fromDate(finish) : null, createdAt: FieldValue.serverTimestamp(), createdBy: ctx.profile.uid, updatedAt: FieldValue.serverTimestamp() })
    batch.set(db.collection('usuarios').doc(owner.uid), { uid: owner.uid, email: emailDono, nome: nomeDono, cargo: 'admin', lojaId: storeRef.id, status: 'active', superAdmin: false, createdAt: FieldValue.serverTimestamp(), createdBy: ctx.profile.uid })
    batch.set(storeRef.collection('funcionarios').doc(owner.uid), { uid: owner.uid, email: emailDono, nome: nomeDono, cargo: 'admin', status: 'active', createdAt: FieldValue.serverTimestamp() })
    batch.set(storeRef.collection('assinatura').doc('atual'), { planoId: plano.id, planoNome: plano.nome, preco, periodo, limiteUsuarios: plano.limiteUsuarios, status: trial ? 'trial' : 'active', testeGratis: trial, dataInicio: Timestamp.fromDate(start), dataFim: finish ? Timestamp.fromDate(finish) : null, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() })
    batch.set(storeRef.collection('configuracoes').doc('geral'), { contadorOS: 0, statusOS: defaultStatuses(), updatedAt: FieldValue.serverTimestamp() })
    batch.set(storeRef.collection('controle').doc('usuarios'), { quantidade: 1, updatedAt: FieldValue.serverTimestamp() })
    try { await batch.commit() } catch (error) { await auth.deleteUser(owner.uid).catch(() => {}); throw error }
    return res.status(201).json({ ok: true, lojaId: storeRef.id, ownerUid: owner.uid, message: 'Loja e proprietário criados.' })
  } catch (error) { return sendError(res, error, 'Não foi possível cadastrar a loja.') }
}

function defaultStatuses() {
  return [
    ['Aberta',true,true,false],['Em Análise',true,true,false],['Em diagnóstico',true,true,false],['Em Orçamento',true,true,false],['Aguardando aprovação',true,true,false],['Aguardando peça',true,true,false],['Em reparo',true,true,false],['Garantia',true,true,false],['Concluída',true,true,true],['Aguardando Retirada',true,true,false],['Entregue',false,false,false],['Cancelada',false,false,false]
  ].map(([nome, considerarValorParado, considerarAparelhoNaLoja, considerarFaturamento], i) => ({ nome, ordem: i + 1, ativo: true, considerarValorParado, considerarAparelhoNaLoja, considerarFaturamento }))
}
