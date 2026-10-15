import { authenticatedProfile, requireMethod, requireStoreRole, requireActiveStore, sendError, validateMoney } from '../_lib/firebaseAdmin.js'

export default async function handler(req, res) {
  try {
    requireMethod(req, ['POST'])
    const { profile, db, FieldValue } = await authenticatedProfile(req)
    requireStoreRole(profile, ['admin'])
    await requireActiveStore(profile, db)
    const body = req.body || {}
    const shop = db.collection('lojas').doc(profile.lojaId)
    const action = String(body.action || '')
    const productId = String(body.productId || '')
    if (action === 'salvar') {
      const product = body.produto || {}
      const nome = String(product.nome || '').trim()
      const categoria = String(product.categoria || '').trim().slice(0, 80)
      const sku = String(product.sku || '').trim().slice(0, 100)
      const fornecedor = String(product.fornecedor || '').trim().slice(0, 160)
      const quantidade = Number(product.quantidade)
      const estoqueMinimo = Number(product.estoqueMinimo)
      const precoVenda = validateMoney(product.precoVenda, 'Preço de venda')
      if (!nome || nome.length > 160) return res.status(400).json({ error: 'Nome do produto obrigatório (máximo 160 caracteres).' })
      if (!Number.isSafeInteger(quantidade) || quantidade < 0 || !Number.isSafeInteger(estoqueMinimo) || estoqueMinimo < 0) return res.status(400).json({ error: 'Quantidade e estoque mínimo devem ser números inteiros não negativos.' })
      if (product.custo != null && profile.cargo !== 'admin') return res.status(403).json({ error: 'Somente o Admin pode cadastrar ou alterar custo de aquisição.' })
      const productRef = productId ? shop.collection('produtos').doc(productId) : shop.collection('produtos').doc()
      const movementRef = shop.collection('movimentacoesEstoque').doc()
      const costRef = shop.collection('estoqueCustos').doc(productRef.id)
      await db.runTransaction(async tx => {
        const existing = productId ? await tx.get(productRef) : null
        if (productId && !existing.exists) { const error = new Error('Produto não encontrado.'); error.status = 404; throw error }
        const previous = existing?.exists ? existing.data() : null
        if (previous?.ativo === false) { const error = new Error('Produto desativado. Reative-o por um procedimento administrativo.'); error.status = 409; throw error }
        const oldQty = Number(previous?.quantidade || 0)
        const data = { nome, categoria, sku, quantidade, estoqueMinimo, precoVenda, fornecedor, ativo: product.ativo !== false, updatedAt: FieldValue.serverTimestamp() }
        if (!previous) data.createdAt = FieldValue.serverTimestamp()
        if (previous) tx.update(productRef, data)
        else tx.create(productRef, data)
        if (!previous || oldQty !== quantidade) {
          tx.create(movementRef, { produtoId: productRef.id, produtoNome: nome, tipo: previous ? 'ajuste-inventario' : 'inventario-inicial', quantidade: quantidade - oldQty, quantidadeAnterior: oldQty, quantidadeNova: quantidade, usuarioUid: profile.uid, usuarioNome: profile.nome || profile.email || '', descricao: previous ? 'Ajuste manual via estoque' : 'Saldo inicial', createdAt: FieldValue.serverTimestamp() })
        }
        if (product.custo != null) {
          const custo = validateMoney(product.custo, 'Custo de aquisição')
          tx.set(costRef, { custo, updatedAt: FieldValue.serverTimestamp() }, { merge: true })
        }
      })
      return res.status(200).json({ ok: true, productId: productRef.id, message: 'Produto salvo e movimentação de estoque registrada.' })
    }
    if (action === 'desativar') {
      if (!productId) return res.status(400).json({ error: 'Produto não informado.' })
      const productRef = shop.collection('produtos').doc(productId)
      await db.runTransaction(async tx => {
        const snap = await tx.get(productRef)
        if (!snap.exists) { const error = new Error('Produto não encontrado.'); error.status = 404; throw error }
        tx.update(productRef, { ativo: false, updatedAt: FieldValue.serverTimestamp(), desativadoPor: profile.uid })
      })
      return res.status(200).json({ ok: true, message: 'Produto desativado sem apagar o histórico.' })
    }
    return res.status(400).json({ error: 'Ação de estoque inválida.' })
  } catch (error) { return sendError(res, error, 'Não foi possível salvar o produto.') }
}
