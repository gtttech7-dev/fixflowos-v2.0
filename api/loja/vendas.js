import { authenticatedProfile, requireMethod, requireStoreRole, requireActiveStore, sendError } from '../_lib/firebaseAdmin.js'

export default async function handler(req, res) {
  try {
    requireMethod(req, ['POST'])
    const { profile, db, FieldValue } = await authenticatedProfile(req)
    requireStoreRole(profile, ['admin', 'vendedorTecnico'])
    await requireActiveStore(profile, db)
    const body = req.body || {}
    const shop = db.collection('lojas').doc(profile.lojaId)

    if (body.action === 'cancelar') {
      requireStoreRole(profile, ['admin'])
      const vendaId = String(body.vendaId || '')
      if (!vendaId || vendaId.length > 150) return res.status(400).json({ error: 'Identificador de venda inválido.' })
      const saleRef = shop.collection('vendas').doc(vendaId)
      const cashControlRef = shop.collection('controle').doc('caixaAtual')
      const pendingRefundRef = shop.collection('reembolsosPendentes').doc(vendaId)
      let wasAlreadyCancelled = false
      let cashRefundPending = false
      await db.runTransaction(async tx => {
        wasAlreadyCancelled = false
        cashRefundPending = false
        const saleSnap = await tx.get(saleRef)
        if (!saleSnap.exists) { const error = new Error('Venda não encontrada nesta loja.'); error.status = 404; throw error }
        const sale = saleSnap.data()
        if (sale.status === 'cancelada') { wasAlreadyCancelled = true; return }
        if (sale.status !== 'concluida') { const error = new Error('Somente vendas concluídas podem ser canceladas.'); error.status = 409; throw error }
        const saleItems = Array.isArray(sale.itens) ? sale.itens : []
        if (!saleItems.length) { const error = new Error('A venda não possui itens para estorno de estoque.'); error.status = 409; throw error }
        const productReads = await Promise.all(saleItems.map(async item => {
          const productId = String(item.produtoId || '')
          if (!productId) { const error = new Error('Item da venda sem identificação de produto.'); error.status = 409; throw error }
          const productRef = shop.collection('produtos').doc(productId)
          return { item, productRef, snap: await tx.get(productRef) }
        }))
        const controlSnap = await tx.get(cashControlRef)
        const activeCashId = controlSnap.exists ? controlSnap.data().caixaId : null
        const activeCashRef = activeCashId ? shop.collection('caixas').doc(activeCashId) : null
        const activeCashSnap = activeCashRef ? await tx.get(activeCashRef) : null
        const validCash = Boolean(activeCashSnap?.exists && activeCashSnap.data().status === 'aberto' && activeCashId)
        const usesCash = String(sale.formaPagamento || '').toLowerCase() === 'dinheiro'
        for (const read of productReads) {
          if (!read.snap.exists) { const error = new Error(`O produto ${read.item.nome || read.item.produtoId} não existe mais. Recrie o produto antes de cancelar esta venda para manter o estoque consistente.`); error.status = 409; throw error }
          const quantity = Number(read.item.quantidade)
          if (!Number.isSafeInteger(quantity) || quantity < 1) { const error = new Error('Quantidade inválida no registro da venda.'); error.status = 409; throw error }
        }
        for (const read of productReads) {
          const product = read.snap.data()
          const quantity = Number(read.item.quantidade)
          tx.update(read.productRef, { quantidade: (Number(product.quantidade) || 0) + quantity, updatedAt: FieldValue.serverTimestamp() })
          tx.create(shop.collection('movimentacoesEstoque').doc(), { produtoId: read.item.produtoId, produtoNome: read.item.nome || product.nome || '', tipo: 'entrada-cancelamento-venda', quantidade, vendaId, usuarioUid: profile.uid, usuarioNome: profile.nome || profile.email || '', createdAt: FieldValue.serverTimestamp() })
        }
        tx.update(saleRef, { status: 'cancelada', canceladaEm: FieldValue.serverTimestamp(), canceladaPorUid: profile.uid, canceladaPorNome: profile.nome || profile.email || '', cancelamentoMotivo: String(body.motivo || 'Cancelamento administrativo').trim().slice(0, 500) })
        if (usesCash) {
          if (validCash) {
            tx.create(shop.collection('movimentacoesCaixa').doc(), { caixaId: activeCashId, tipo: 'saida', descricao: `Reembolso de cancelamento da venda ${sale.numeroVenda || vendaId.slice(0, 8)}`, valor: Number(sale.total) || 0, vendaId, formaPagamento: 'Dinheiro', usuarioUid: profile.uid, usuarioNome: profile.nome || profile.email || '', createdAt: FieldValue.serverTimestamp(), origem: 'cancelamento-venda' })
          } else {
            cashRefundPending = true
            tx.set(pendingRefundRef, { vendaId, numeroVenda: sale.numeroVenda || '', valor: Number(sale.total) || 0, formaPagamento: sale.formaPagamento || 'Dinheiro', status: 'pendente', motivo: 'Venda em dinheiro cancelada sem caixa aberto para registrar a saída do reembolso.', criadoPorUid: profile.uid, criadoPorNome: profile.nome || profile.email || '', createdAt: FieldValue.serverTimestamp() })
          }
        }
      })
      if (wasAlreadyCancelled) return res.status(200).json({ ok: true, message: 'Esta venda já estava cancelada.', jaCancelada: true })
      return res.status(200).json({ ok: true, message: cashRefundPending ? 'Venda cancelada e estoque estornado. O reembolso em dinheiro ficou pendente de registro no caixa.' : 'Venda cancelada e estoque estornado.', reembolsoPendente: cashRefundPending })
    }

    const rawItems = Array.isArray(body.itens) ? body.itens : []
    const merged = new Map()
    for (const item of rawItems) {
      const productId = String(item.produtoId || '')
      const quantity = Number(item.quantidade)
      if (!productId || !Number.isSafeInteger(quantity) || quantity < 1) return res.status(400).json({ error: 'Quantidade ou produto inválido.' })
      merged.set(productId, (merged.get(productId) || 0) + quantity)
    }
    const items = [...merged.entries()].map(([produtoId, quantidade]) => ({ produtoId, quantidade }))
    if (!items.length || items.length > 100) return res.status(400).json({ error: 'Carrinho vazio ou com itens demais.' })
    const paymentMethods = ['Pix', 'Dinheiro', 'Cartão de débito', 'Cartão de crédito']
    if (!paymentMethods.includes(body.formaPagamento)) return res.status(400).json({ error: 'Forma de pagamento inválida.' })
    const key = String(body.idempotencyKey || '')
    if (!/^[a-zA-Z0-9_-]{12,100}$/.test(key)) return res.status(400).json({ error: 'Identificador da venda inválido.' })
    const idempotencyRef = shop.collection('vendaRequests').doc(key)
    const saleRef = shop.collection('vendas').doc()
    const cashControlRef = shop.collection('controle').doc('caixaAtual')
    let saleId = ''
    await db.runTransaction(async tx => {
      const idem = await tx.get(idempotencyRef)
      if (idem.exists) { saleId = idem.data().vendaId; return }
      const normalized = []
        for (const item of items) {
        const id = String(item.produtoId || '')
        const quantity = Number(item.quantidade)
        if (!id || !Number.isSafeInteger(quantity) || quantity < 1) { const error = new Error('Quantidade ou produto inválido.'); error.status = 400; throw error }
        const productRef = shop.collection('produtos').doc(id)
        const productSnap = await tx.get(productRef)
        if (!productSnap.exists) { const error = new Error('Um produto do carrinho não existe mais.'); error.status = 409; throw error }
        const product = productSnap.data()
        if (product.ativo === false || Number(product.quantidade) < quantity) { const error = new Error(`Estoque insuficiente para ${product.nome || 'um produto'}.`); error.status = 409; throw error }
        const price = Number(product.precoVenda)
        if (!Number.isFinite(price) || price < 0) { const error = new Error(`Preço inválido em ${product.nome || 'um produto'}.`); error.status = 400; throw error }
        normalized.push({ produtoId: id, nome: String(product.nome || ''), quantidade: quantity, precoUnitario: price, valor: price * quantity, productRef, produto: product })
      }
      const subtotal = normalized.reduce((sum, item) => sum + item.valor, 0)
      const desconto = Number(body.desconto || 0)
      if (!Number.isFinite(desconto) || desconto < 0 || desconto > subtotal) { const error = new Error('Desconto inválido para o subtotal da venda.'); error.status = 400; throw error }
      const total = Math.round((subtotal - desconto) * 100) / 100
      // Resolve a sessão ativa de caixa antes de começar as gravações da transação.
      const cashControl = await tx.get(cashControlRef)
      const activeId = cashControl.exists ? cashControl.data().caixaId : null
      const activeCash = activeId ? await tx.get(shop.collection('caixas').doc(activeId)) : null
      if (!activeCash?.exists || activeCash.data().status !== 'aberto') { const error = new Error('Abra o caixa antes de finalizar uma venda.'); error.status = 409; throw error }
      const saleDoc = { numeroVenda: saleRef.id.slice(0, 8).toUpperCase(), itens: normalized.map(({ produtoId, nome, quantidade, precoUnitario, valor }) => ({ produtoId, nome, quantidade, precoUnitario, valor })), subtotal: Math.round(subtotal * 100) / 100, desconto: Math.round(desconto * 100) / 100, total, formaPagamento: body.formaPagamento, vendaCelular: body.vendaCelular === true, modeloCelular: body.vendaCelular === true ? String(body.modeloCelular || '').trim().slice(0, 120) : '', status: 'concluida', usuarioUid: profile.uid, usuarioNome: profile.nome || profile.email || '', lojaId: profile.lojaId, createdAt: FieldValue.serverTimestamp(), idempotencyKey: key }
      tx.create(saleRef, saleDoc)
      for (const item of normalized) {
        tx.update(item.productRef, { quantidade: Number(item.produto.quantidade) - item.quantidade, updatedAt: FieldValue.serverTimestamp() })
        const movementRef = shop.collection('movimentacoesEstoque').doc()
        tx.create(movementRef, { produtoId: item.produtoId, produtoNome: item.nome, tipo: 'saida-venda', quantidade: item.quantidade, vendaId: saleRef.id, usuarioUid: profile.uid, createdAt: FieldValue.serverTimestamp() })
      }
      if (activeCash?.exists && activeCash.data().status === 'aberto') {
        const cashMovement = shop.collection('movimentacoesCaixa').doc()
        tx.create(cashMovement, { caixaId: activeCash.id, tipo: 'venda', descricao: `Venda ${saleDoc.numeroVenda}`, valor: total, valorCaixa: body.formaPagamento === 'Dinheiro' ? total : 0, vendaId: saleRef.id, formaPagamento: body.formaPagamento, usuarioUid: profile.uid, usuarioNome: profile.nome || profile.email || '', createdAt: FieldValue.serverTimestamp() })
      }
      tx.create(idempotencyRef, { vendaId: saleRef.id, createdAt: FieldValue.serverTimestamp() })
      saleId = saleRef.id
    })
    return res.status(201).json({ ok: true, vendaId: saleId, message: 'Venda registrada e estoque atualizado.' })
  } catch (error) { return sendError(res, error, 'Não foi possível registrar a venda.') }
}
