import { authenticatedProfile, requireMethod, requireStoreRole, requireActiveStore, sendError, validateMoney } from '../_lib/firebaseAdmin.js'

export default async function handler(req, res) {
  try {
    requireMethod(req, ['POST'])
    const { profile, db, FieldValue } = await authenticatedProfile(req)
    requireStoreRole(profile, ['admin', 'vendedorTecnico'])
    await requireActiveStore(profile, db)
    const body = req.body || {}
    const shop = db.collection('lojas').doc(profile.lojaId)
    const controlRef = shop.collection('controle').doc('caixaAtual')
    const action = body.action
    if (action === 'registrar-reembolso-pendente') {
      requireStoreRole(profile, ['admin'])
      const reembolsoId = String(body.reembolsoId || '')
      if (!reembolsoId) return res.status(400).json({ error: 'Informe o reembolso pendente.' })
      const refundRef = shop.collection('reembolsosPendentes').doc(reembolsoId)
      const movementRef = shop.collection('movimentacoesCaixa').doc()
      await db.runTransaction(async tx => {
        const refundSnap = await tx.get(refundRef)
        const controlSnap = await tx.get(controlRef)
        if (!refundSnap.exists || refundSnap.data().status !== 'pendente') { const error = new Error('Reembolso pendente não encontrado ou já registrado.'); error.status = 409; throw error }
        const activeId = controlSnap.exists ? controlSnap.data().caixaId : null
        if (!activeId) { const error = new Error('Abra o caixa antes de registrar o reembolso.'); error.status = 409; throw error }
        const cashRef = shop.collection('caixas').doc(activeId)
        const cashSnap = await tx.get(cashRef)
        if (!cashSnap.exists || cashSnap.data().status !== 'aberto') { const error = new Error('Não existe caixa aberto para registrar o reembolso.'); error.status = 409; throw error }
        const refund = refundSnap.data()
        const valor = validateMoney(refund.valor, 'Valor do reembolso')
        tx.create(movementRef, { caixaId: activeId, tipo: 'saida', descricao: `Reembolso da venda ${refund.numeroVenda || refund.vendaId}`, valor, vendaId: refund.vendaId, usuarioUid: profile.uid, usuarioNome: profile.nome || profile.email || '', createdAt: FieldValue.serverTimestamp(), origem: 'reembolso-pendente' })
        tx.update(refundRef, { status: 'registrado', caixaId: activeId, registradoEm: FieldValue.serverTimestamp(), registradoPorUid: profile.uid, registradoPorNome: profile.nome || profile.email || '' })
      })
      return res.status(200).json({ ok: true, message: 'Reembolso registrado como saída no caixa.' })
    }
    if (action === 'abrir') {
      const value = validateMoney(body.valorInicial, 'Valor inicial')
      const newRef = shop.collection('caixas').doc()
      await db.runTransaction(async tx => {
        const controlSnap = await tx.get(controlRef)
        const currentId = controlSnap.exists ? controlSnap.data().caixaId : null
        if (currentId) {
          const activeRef = shop.collection('caixas').doc(currentId)
          const activeSnap = await tx.get(activeRef)
          if (activeSnap.exists && activeSnap.data().status === 'aberto') { const error = new Error('Já existe um caixa aberto nesta loja.'); error.status = 409; throw error }
        }
        tx.create(newRef, { status: 'aberto', valorInicial: value, usuarioUid: profile.uid, usuarioNome: profile.nome || profile.email || '', abertoEm: FieldValue.serverTimestamp(), lojaId: profile.lojaId })
        tx.set(controlRef, { caixaId: newRef.id, updatedAt: FieldValue.serverTimestamp() })
      })
      return res.status(201).json({ ok: true, caixaId: newRef.id, message: 'Caixa aberto com sucesso.' })
    }
    const caixaId = String(body.caixaId || '')
    if (!caixaId) {
      const controlSnap = await controlRef.get()
      if (!controlSnap.exists || !controlSnap.data().caixaId) { const error = new Error('Não existe um caixa aberto.'); error.status = 409; throw error }
    }
    const controlSnap = await controlRef.get()
    const activeId = controlSnap.exists ? controlSnap.data().caixaId : null
    const actualId = caixaId || activeId
    if (!actualId || actualId !== activeId) { const error = new Error('A sessão de caixa informada não é a sessão ativa desta loja.'); error.status = 409; throw error }
    const cashRef = shop.collection('caixas').doc(actualId)
    if (action === 'movimentar') {
      const value = validateMoney(body.valor, 'Valor da movimentação')
      if (value <= 0) { const error = new Error('O valor deve ser maior que zero.'); error.status = 400; throw error }
      if (!['entrada', 'saida', 'suprimento', 'sangria'].includes(body.tipo)) { const error = new Error('Tipo de movimentação inválido.'); error.status = 400; throw error }
      if (!String(body.descricao || '').trim()) { const error = new Error('Informe a descrição da movimentação.'); error.status = 400; throw error }
      const movementRef = shop.collection('movimentacoesCaixa').doc()
      await db.runTransaction(async tx => {
        const [cashSnap, controlNow] = await Promise.all([tx.get(cashRef), tx.get(controlRef)])
        if (!cashSnap.exists || cashSnap.data().status !== 'aberto' || !controlNow.exists || controlNow.data().caixaId !== actualId) { const error = new Error('O caixa não está aberto.'); error.status = 409; throw error }
        tx.create(movementRef, { caixaId: actualId, tipo: body.tipo, valor: value, descricao: String(body.descricao).trim().slice(0, 500), usuarioUid: profile.uid, usuarioNome: profile.nome || profile.email || '', createdAt: FieldValue.serverTimestamp(), lojaId: profile.lojaId })
      })
      return res.status(201).json({ ok: true, message: 'Movimentação registrada.' })
    }
    if (action === 'fechar') {
      const counted = validateMoney(body.valorContado, 'Valor contado')
      await db.runTransaction(async tx => {
        const [cashSnap, controlNow, movementsSnap] = await Promise.all([tx.get(cashRef), tx.get(controlRef), tx.get(shop.collection('movimentacoesCaixa').where('caixaId', '==', actualId))])
        if (!cashSnap.exists || cashSnap.data().status !== 'aberto' || !controlNow.exists || controlNow.data().caixaId !== actualId) { const error = new Error('Este caixa já foi fechado ou não é o caixa ativo.'); error.status = 409; throw error }
        let expected = Number(cashSnap.data().valorInicial) || 0
        for (const doc of movementsSnap.docs) {
          const m = doc.data()
          if (['entrada', 'suprimento'].includes(m.tipo)) expected += Number(m.valor) || 0
          else if (['saida', 'sangria'].includes(m.tipo)) expected -= Number(m.valor) || 0
          else if (m.tipo === 'venda') expected += Number(m.valorCaixa) || 0
        }
        expected = Math.round(expected * 100) / 100
        tx.update(cashRef, { status: 'fechado', valorEsperado: expected, valorContado: counted, diferenca: Math.round((counted - expected) * 100) / 100, fechadoEm: FieldValue.serverTimestamp(), fechadoPorUid: profile.uid, fechadoPorNome: profile.nome || profile.email || '' })
        tx.set(controlRef, { caixaId: null, updatedAt: FieldValue.serverTimestamp() })
      })
      return res.status(200).json({ ok: true, message: 'Caixa fechado. Consulte a diferença registrada no histórico.' })
    }
    const error = new Error('Ação de caixa inválida.'); error.status = 400; throw error
  } catch (error) { return sendError(res, error, 'Não foi possível concluir a operação de caixa.') }
}
