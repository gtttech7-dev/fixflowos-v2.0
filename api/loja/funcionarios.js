import { authenticatedProfile, requireMethod, requireStoreRole, requireActiveStore, sendError } from '../_lib/firebaseAdmin.js'

export default async function handler(req, res) {
  try {
    requireMethod(req, ['POST'])
    const { profile, auth, db, FieldValue } = await authenticatedProfile(req)
    requireStoreRole(profile, ['admin'])
    await requireActiveStore(profile, db)
    const body = req.body || {}
    if (body.action === 'atualizar') {
      const uid = String(body.uid || '')
      const nome = String(body.nome || '').trim()
      const cargo = String(body.cargo || '')
      const status = String(body.status || '')
      if (!uid || !['tecnico', 'vendedorTecnico'].includes(cargo) || !['active', 'suspended'].includes(status) || !nome) return res.status(400).json({ error: 'Dados de funcionário inválidos.' })
      const shopRef = db.collection('lojas').doc(profile.lojaId)
      const storeSnap = await shopRef.get()
      if (!storeSnap.exists || storeSnap.data().ownerUid === uid || profile.uid === uid) return res.status(403).json({ error: 'A conta do proprietário não pode ser alterada neste formulário.' })
      const profileRef = db.collection('usuarios').doc(uid)
      const employeeRef = shopRef.collection('funcionarios').doc(uid)
      const counterRef = shopRef.collection('controle').doc('usuarios')
      const subRef = shopRef.collection('assinatura').doc('atual')
      await db.runTransaction(async tx => {
        const [profileSnap, employeeSnap, counterSnap, subSnap] = await Promise.all([tx.get(profileRef), tx.get(employeeRef), tx.get(counterRef), tx.get(subRef)])
        if (!profileSnap.exists || !employeeSnap.exists || profileSnap.data().lojaId !== profile.lojaId) { const error = new Error('Funcionário não encontrado nesta loja.'); error.status = 404; throw error }
        const oldStatus = profileSnap.data().status || 'active'
        let count = Number(counterSnap.exists ? counterSnap.data().quantidade : 1)
        const limit = subSnap.exists ? subSnap.data().limiteUsuarios : 7
        if (oldStatus !== status && status === 'active' && limit != null && count >= Number(limit)) { const error = new Error(`O limite de ${limit} usuários está atingido.`); error.status = 409; throw error }
        if (oldStatus !== status) count = Math.max(1, count + (status === 'active' ? 1 : -1))
        tx.update(profileRef, { nome, cargo, status, updatedAt: FieldValue.serverTimestamp(), updatedBy: profile.uid })
        tx.update(employeeRef, { nome, cargo, status, updatedAt: FieldValue.serverTimestamp(), updatedBy: profile.uid })
        tx.set(counterRef, { quantidade: count, updatedAt: FieldValue.serverTimestamp() }, { merge: true })
      })
      await auth.updateUser(uid, { displayName: nome, disabled: status === 'suspended' })
      return res.status(200).json({ ok: true, message: status === 'suspended' ? 'Funcionário suspenso.' : 'Funcionário atualizado.' })
    }
    if (body.action !== 'criar') return res.status(400).json({ error: 'Ação inválida.' })
    const nome = String(body.nome || '').trim()
    const email = String(body.email || '').trim().toLowerCase()
    const senha = String(body.senha || '')
    const cargo = String(body.cargo || '')
    if (!nome || !email || senha.length < 8) return res.status(400).json({ error: 'Informe nome, e-mail válido e senha temporária de pelo menos 8 caracteres.' })
    if (!['tecnico', 'vendedorTecnico'].includes(cargo)) return res.status(403).json({ error: 'O cargo de Admin não pode ser atribuído a partir deste formulário.' })
    const shopRef = db.collection('lojas').doc(profile.lojaId)
    const counterRef = shopRef.collection('controle').doc('usuarios')
    const subRef = shopRef.collection('assinatura').doc('atual')
    await db.runTransaction(async tx => {
      const [counterSnap, subSnap] = await Promise.all([tx.get(counterRef), tx.get(subRef)])
      const count = Number(counterSnap.exists ? counterSnap.data().quantidade : 1)
      const limit = subSnap.exists ? subSnap.data().limiteUsuarios : 7
      if (limit != null && count >= Number(limit)) { const error = new Error(`O limite do plano foi atingido (${limit} usuários).`); error.status = 409; throw error }
      tx.set(counterRef, { quantidade: count + 1, updatedAt: FieldValue.serverTimestamp() }, { merge: true })
    })
    let createdUser
    try {
      createdUser = await auth.createUser({ email, password: senha, displayName: nome, disabled: false, emailVerified: false })
      const batch = db.batch()
      batch.set(db.collection('usuarios').doc(createdUser.uid), { uid: createdUser.uid, email, nome, cargo, lojaId: profile.lojaId, status: 'active', superAdmin: false, createdAt: FieldValue.serverTimestamp(), createdBy: profile.uid })
      batch.set(shopRef.collection('funcionarios').doc(createdUser.uid), { uid: createdUser.uid, email, nome, cargo, status: 'active', createdAt: FieldValue.serverTimestamp(), createdBy: profile.uid })
      await batch.commit()
    } catch (error) {
      if (createdUser?.uid) await auth.deleteUser(createdUser.uid).catch(() => {})
      await db.runTransaction(async tx => { const snap = await tx.get(counterRef); if (snap.exists) tx.update(counterRef, { quantidade: Math.max(1, Number(snap.data().quantidade || 1) - 1), updatedAt: FieldValue.serverTimestamp() }) }).catch(() => {})
      throw error
    }
    return res.status(201).json({ ok: true, uid: createdUser.uid, message: 'Funcionário criado.' })
  } catch (error) { return sendError(res, error, 'Não foi possível criar funcionário.') }
}
