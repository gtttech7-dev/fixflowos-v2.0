import { cert, getApps, initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'

const email = process.argv[2]
if (!email) {
  console.error('Uso: FIREBASE_SERVICE_ACCOUNT_JSON="{...}" node scripts/provision-superadmin.mjs admin@seudominio.com')
  process.exit(1)
}
if (!process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
  console.error('Defina FIREBASE_SERVICE_ACCOUNT_JSON apenas no ambiente seguro onde este script será executado.')
  process.exit(1)
}
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON)
if (serviceAccount.private_key) serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n')
const app = getApps()[0] || initializeApp({ credential: cert(serviceAccount), projectId: serviceAccount.project_id })
const auth = getAuth(app)
const db = getFirestore(app)
const account = await auth.getUserByEmail(email.trim())
await auth.setCustomUserClaims(account.uid, { ...(account.customClaims || {}), superAdmin: true })
await db.collection('usuarios').doc(account.uid).set({ uid: account.uid, email: account.email || email, nome: account.displayName || 'Super Admin', cargo: 'superAdmin', superAdmin: true, status: 'active', lojaId: FieldValue.delete(), updatedAt: FieldValue.serverTimestamp() }, { merge: true })
console.log(`Super Admin provisionado para ${email}. Encerre e inicie a sessão novamente para atualizar o token.`)
