import { authenticatedProfile, requireMethod, sendError, periodEnd } from '../_lib/firebaseAdmin.js'

export default async function handler(req, res) {
  try {
    requireMethod(req, ['POST'])
    const { profile, db, FieldValue, Timestamp } = await authenticatedProfile(req, { superAdmin: true })
    const body = req.body || {}
    const lojaId = String(body.lojaId || '')
    if (!lojaId) return res.status(400).json({ error: 'Informe a loja.' })
    const storeRef = db.collection('lojas').doc(lojaId)
    const subscriptionRef = storeRef.collection('assinatura').doc('atual')
    const [storeSnap, subscriptionSnap] = await Promise.all([storeRef.get(), subscriptionRef.get()])
    if (!storeSnap.exists || !subscriptionSnap.exists) return res.status(404).json({ error: 'Loja ou assinatura não encontrada.' })
    const existing = subscriptionSnap.data()
    const action = String(body.action || '')
    if (action === 'status') {
      const status = String(body.status || '')
      if (!['active', 'suspended', 'expired'].includes(status)) return res.status(400).json({ error: 'Status inválido.' })
      let nextEnd = existing.dataFim || null
      let nextStart = existing.dataInicio || null
      if (status === 'active' && existing.periodo !== 'vitalicio' && (!nextEnd || !nextEnd.toDate || nextEnd.toDate().getTime() <= Date.now())) {
        const start = new Date()
        const end = periodEnd(existing.periodo, start)
        nextStart = Timestamp.fromDate(start)
        nextEnd = end ? Timestamp.fromDate(end) : null
      }
      const batch = db.batch()
      batch.update(subscriptionRef, { status, dataInicio: nextStart, dataFim: nextEnd, updatedAt: FieldValue.serverTimestamp(), updatedBy: profile.uid })
      batch.update(storeRef, { status: status === 'suspended' ? 'suspended' : 'active', assinaturaStatus: status, assinaturaPeriodo: existing.periodo || '', assinaturaDataFim: nextEnd, updatedAt: FieldValue.serverTimestamp() })
      await batch.commit()
      return res.status(200).json({ ok: true, message: status === 'suspended' ? 'Loja suspensa.' : 'Status da loja atualizado.' })
    }
    if (action === 'preco-periodo') {
      const preco = Number(body.preco)
      const periodo = String(body.periodo || '')
      if (!Number.isFinite(preco) || preco < 0) return res.status(400).json({ error: 'Preço inválido.' })
      if (!['semanal', 'mensal', 'tresMeses', 'anual', 'vitalicio'].includes(periodo)) return res.status(400).json({ error: 'Período inválido.' })
      const start = new Date()
      const end = periodEnd(periodo, start)
      const updates = { preco, periodo, dataInicio: Timestamp.fromDate(start), dataFim: end ? Timestamp.fromDate(end) : null, updatedAt: FieldValue.serverTimestamp(), updatedBy: profile.uid }
      if (Object.hasOwn(body, 'planoId')) {
        const configuredSnap = await db.collection('configuracoesSaaS').doc('planos').get()
        const configuredPlans = configuredSnap.exists && Array.isArray(configuredSnap.data().planos) ? configuredSnap.data().planos : [
          { id: 'plano1', nome: 'Plano 1', limiteUsuarios: 7 },
          { id: 'plano2', nome: 'Plano 2', limiteUsuarios: 10 },
          { id: 'plano3', nome: 'Plano 3', limiteUsuarios: null },
        ]
        const selectedPlan = configuredPlans.find(plan => plan.id === body.planoId)
        if (!selectedPlan) return res.status(400).json({ error: 'Plano selecionado inválido.' })
        updates.planoId = selectedPlan.id
        updates.planoNome = selectedPlan.nome || selectedPlan.name || selectedPlan.id
        if (!Object.hasOwn(body, 'limiteUsuarios')) updates.limiteUsuarios = selectedPlan.limiteUsuarios ?? null
      }
      if (Object.hasOwn(body, 'limiteUsuarios')) {
        let limit = body.limiteUsuarios
        if (limit !== null && limit !== '' && (!Number.isSafeInteger(Number(limit)) || Number(limit) < 1)) return res.status(400).json({ error: 'Limite de usuários inválido. Use um inteiro positivo ou ilimitado.' })
        limit = limit === null || limit === '' ? null : Number(limit)
        const countSnap = await storeRef.collection('controle').doc('usuarios').get()
        const currentCount = Number(countSnap.exists ? countSnap.data().quantidade : 1)
        if (limit != null && currentCount > limit) return res.status(409).json({ error: `A loja já possui ${currentCount} usuário(s); o limite não pode ser menor que a quantidade atual.` })
        updates.limiteUsuarios = limit
      }
      await subscriptionRef.update(updates)
      await storeRef.update({ assinaturaStatus: existing.status, assinaturaPeriodo: periodo, assinaturaDataFim: end ? Timestamp.fromDate(end) : null, updatedAt: FieldValue.serverTimestamp() })
      return res.status(200).json({ ok: true, message: 'Preço e período atualizados.' })
    }
    if (action === 'renovar') {
      const periodo = String(body.periodo || '')
      const preco = Number(body.preco ?? existing.preco)
      if (!['semanal', 'mensal', 'tresMeses', 'anual', 'vitalicio'].includes(periodo)) return res.status(400).json({ error: 'Período inválido.' })
      if (!Number.isFinite(preco) || preco < 0) return res.status(400).json({ error: 'Preço inválido.' })
      const start = new Date()
      const trial = body.testeGratis === true
      const end = trial ? new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000) : periodEnd(periodo, start)
      const batch = db.batch()
      batch.update(subscriptionRef, { periodo, preco, status: trial ? 'trial' : 'active', testeGratis: trial, dataInicio: Timestamp.fromDate(start), dataFim: end ? Timestamp.fromDate(end) : null, renewedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(), updatedBy: profile.uid })
      batch.update(storeRef, { status: 'active', assinaturaStatus: trial ? 'trial' : 'active', assinaturaPeriodo: periodo, assinaturaDataFim: end ? Timestamp.fromDate(end) : null, updatedAt: FieldValue.serverTimestamp() })
      await batch.commit()
      return res.status(200).json({ ok: true, message: trial ? 'Uma semana de teste grátis foi concedida.' : 'Assinatura renovada.' })
    }
    return res.status(400).json({ error: 'Ação de assinatura inválida.' })
  } catch (error) { return sendError(res, error, 'Não foi possível atualizar a assinatura.') }
}
