import { collection, onSnapshot, orderBy, query } from 'firebase/firestore'
import { db } from '../firebase.js'
import { apiRequest } from './api.js'

export function subscribeOS(lojaId, callback, onError) {
  const q = query(collection(db, 'lojas', lojaId, 'ordensServico'), orderBy('numeroOS', 'desc'))
  return onSnapshot(q, snap => callback(snap.docs.map(item => ({ id: item.id, ...item.data() })).sort((a, b) => Number(b.numeroOS) - Number(a.numeroOS))), onError)
}
export async function createOS(data) { return apiRequest('/api/loja/ordens-servico', { body: { action: 'criar', data } }) }
export async function updateOS(lojaId, osId, previousStatus, data, user) {
  const payload = { ...data }
  delete payload.id
  // All OS updates go through the server, which encrypts the device credential and appends history.
  return apiRequest('/api/loja/ordens-servico', { body: { action: 'atualizar', osId, data: payload } })
}
export async function revealOSPassword(osId) {
  return apiRequest(`/api/loja/ordens-servico?osId=${encodeURIComponent(osId)}`, { method: 'GET' })
}
