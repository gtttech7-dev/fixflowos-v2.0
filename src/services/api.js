import { auth } from '../firebase.js'

export async function apiRequest(path, { method = 'POST', body } = {}) {
  const currentUser = auth?.currentUser
  if (!currentUser) throw new Error('Sua sessão expirou. Entre novamente.')
  const token = await currentUser.getIdToken(true)
  const response = await fetch(path, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload.error || `Erro na operação (${response.status}).`)
  return payload
}
