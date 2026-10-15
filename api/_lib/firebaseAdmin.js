import { cert, getApps, initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore'
import * as crypto from 'node:crypto'

export function adminServices() {
  if (!process.env.FIREBASE_SERVICE_ACCOUNT_JSON) throw new Error('Configuração privada ausente: defina FIREBASE_SERVICE_ACCOUNT_JSON nas variáveis de ambiente da Vercel.')
  let serviceAccount
  try { serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON) } catch { throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON não contém JSON válido.') }
  if (serviceAccount.private_key) serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n')
  const app = getApps()[0] || initializeApp({ credential: cert(serviceAccount), projectId: serviceAccount.project_id })
  return { app, auth: getAuth(app), db: getFirestore(app), FieldValue, Timestamp }
}

export function sendError(res, error, fallback = 'Não foi possível concluir a operação.') {
  const knownStatus = error.code === 'auth/email-already-exists' ? 409 : error.code === 'auth/invalid-password' ? 400 : error.code === 'auth/invalid-email' ? 400 : null
  const status = Number(error.status) || knownStatus || 500
  if (status >= 500) console.error('[FixFlowOS API]', error)
  return res.status(status).json({ error: status >= 500 ? fallback : (error.message || fallback) })
}

export async function authenticatedProfile(req, { superAdmin = false } = {}) {
  const header = req.headers.authorization || ''
  const match = header.match(/^Bearer\s+(.+)$/i)
  if (!match) { const error = new Error('Autenticação necessária.'); error.status = 401; throw error }
  const services = adminServices()
  const { auth, db } = services
  let decoded
  try { decoded = await auth.verifyIdToken(match[1], true) } catch { const error = new Error('Sessão inválida ou expirada.'); error.status = 401; throw error }
  const snap = await db.collection('usuarios').doc(decoded.uid).get()
  const profile = snap.exists ? { uid: decoded.uid, ...snap.data() } : null
  if (!profile) { const error = new Error('Perfil de usuário não provisionado.'); error.status = 403; throw error }
  if (profile.status === 'suspended') { const error = new Error('Esta conta está suspensa.'); error.status = 403; throw error }
  if (superAdmin && (decoded.superAdmin !== true || profile.superAdmin !== true || profile.cargo !== 'superAdmin')) {
    const error = new Error('Acesso exclusivo ao Super Admin.'); error.status = 403; throw error
  }
  return { decoded, profile, ...services }
}

export function requireMethod(req, methods) {
  if (!methods.includes(req.method)) { const error = new Error('Método não permitido.'); error.status = 405; throw error }
}

export function requireStoreRole(profile, roles) {
  if (!profile.lojaId || !roles.includes(profile.cargo)) { const error = new Error('Você não tem permissão para esta operação.'); error.status = 403; throw error }
}

export async function requireActiveStore(profile, db) {
  if (!profile.lojaId) { const error = new Error('Usuário sem loja vinculada.'); error.status = 403; throw error }
  const storeRef = db.collection('lojas').doc(profile.lojaId)
  const [storeSnap, subscriptionSnap] = await Promise.all([storeRef.get(), storeRef.collection('assinatura').doc('atual').get()])
  if (!storeSnap.exists || !subscriptionSnap.exists) { const error = new Error('Loja ou assinatura não configurada.'); error.status = 403; throw error }
  const store = storeSnap.data()
  const subscription = subscriptionSnap.data()
  const end = subscription.dataFim?.toDate ? subscription.dataFim.toDate() : (subscription.dataFim ? new Date(subscription.dataFim) : null)
  const isActive = ['active', 'trial'].includes(subscription.status)
  const endIsFuture = end instanceof Date && Number.isFinite(end.getTime()) && end.getTime() > Date.now()
  const isInPeriod = subscription.status === 'trial' ? endIsFuture : (subscription.periodo === 'vitalicio' || endIsFuture)
  if (store.status !== 'active' || !isActive || !isInPeriod) {
    const error = new Error(store.status === 'suspended' || subscription.status === 'suspended' ? 'A loja está suspensa. Consulte o Super Admin.' : 'A assinatura está vencida ou inativa. Regularize a assinatura para continuar.'); error.status = 403; throw error
  }
  return { store, subscription }
}

export function periodEnd(period, start = new Date()) {
  const addCalendarMonths = (date, months) => {
    const end = new Date(date)
    const day = end.getDate()
    end.setDate(1)
    end.setMonth(end.getMonth() + months)
    const lastDay = new Date(end.getFullYear(), end.getMonth() + 1, 0).getDate()
    end.setDate(Math.min(day, lastDay))
    return end
  }
  switch (period) {
    case 'semanal': { const end = new Date(start); end.setDate(end.getDate() + 7); return end }
    case 'mensal': return addCalendarMonths(start, 1)
    case 'tresMeses': return addCalendarMonths(start, 3)
    case 'anual': return addCalendarMonths(start, 12)
    case 'vitalicio': return null
    default: { const error = new Error('Período de assinatura inválido.'); error.status = 400; throw error }
  }
}

export function validateMoney(value, label = 'Valor') {
  const number = Number(value)
  if (!Number.isFinite(number) || number < 0) { const error = new Error(`${label} inválido.`); error.status = 400; throw error }
  return number
}

export function encryptSensitive(value) {
  if (!value) return null
  if (!process.env.APP_DATA_ENCRYPTION_KEY || process.env.APP_DATA_ENCRYPTION_KEY.length < 32) {
    const error = new Error('Para guardar senha de aparelho, configure APP_DATA_ENCRYPTION_KEY (mínimo de 32 caracteres) nas variáveis privadas da Vercel.'); error.status = 500; throw error
  }
  const key = crypto.createHash('sha256').update(process.env.APP_DATA_ENCRYPTION_KEY).digest()
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()])
  return { iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), ciphertext: encrypted.toString('base64'), algorithm: 'aes-256-gcm' }
}
