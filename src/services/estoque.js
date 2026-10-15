import { collection, doc, getDocs, query, orderBy, getDoc } from 'firebase/firestore'
import { db } from '../firebase.js'
import { apiRequest } from './api.js'

export async function listProducts(lojaId) {
  const snap = await getDocs(query(collection(db, 'lojas', lojaId, 'produtos'), orderBy('nome')))
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}
export async function getCosts(lojaId, ids) {
  const pairs = await Promise.all(ids.map(async id => {
    try { const snap = await getDoc(doc(db, 'lojas', lojaId, 'estoqueCustos', id)); return [id, snap.exists() ? snap.data().custo : null] } catch { return [id, null] }
  }))
  return Object.fromEntries(pairs)
}
export async function saveProduct(lojaId, product, productId) {
  return apiRequest('/api/loja/estoque', { body: { action: 'salvar', productId: productId || null, produto: {
    nome: product.nome.trim(), categoria: product.categoria.trim(), sku: product.sku.trim(), quantidade: Number(product.quantidade), estoqueMinimo: Number(product.estoqueMinimo), custo: product.custo === '' ? null : Number(product.custo), precoVenda: Number(product.precoVenda), fornecedor: product.fornecedor.trim(), ativo: true,
  } } })
}
export async function removeProduct(lojaId, productId) { return apiRequest('/api/loja/estoque', { body: { action: 'desativar', productId } }) }
