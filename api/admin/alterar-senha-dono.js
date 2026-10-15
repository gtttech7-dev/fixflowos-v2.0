import { authenticatedProfile, requireMethod, sendError } from '../_lib/firebaseAdmin.js'
export default async function handler(req, res) {
  try {
    requireMethod(req, ['POST'])
    const { profile, db, auth } = await authenticatedProfile(req, { superAdmin: true })
    const lojaId = String(req.body?.lojaId || '')
    const senha = String(req.body?.senha || '')
    if (!lojaId || senha.length < 8) return res.status(400).json({ error: 'Informe a loja e uma senha com pelo menos 8 caracteres.' })
    const storeSnap = await db.collection('lojas').doc(lojaId).get()
    if (!storeSnap.exists || !storeSnap.data().ownerUid) return res.status(404).json({ error: 'Proprietário da loja não encontrado.' })
    await auth.updateUser(storeSnap.data().ownerUid, { password: senha })
    await db.collection('lojas').doc(lojaId).collection('auditoria').add({ tipo: 'senha-proprietario-alterada', realizadaPor: profile.uid, createdAt: new Date() })
    return res.status(200).json({ ok: true, message: 'Senha do proprietário alterada.' })
  } catch (error) { return sendError(res, error, 'Não foi possível alterar a senha.') }
}
