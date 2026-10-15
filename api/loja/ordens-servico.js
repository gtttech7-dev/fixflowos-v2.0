import { authenticatedProfile, requireMethod, requireStoreRole, requireActiveStore, sendError } from '../_lib/firebaseAdmin.js'

const ALLOWED_ROLES = ['admin', 'vendedorTecnico', 'tecnico']
const STATUSES = ['Aberta', 'Em Análise', 'Em diagnóstico', 'Em Orçamento', 'Aguardando aprovação', 'Aguardando peça', 'Em reparo', 'Garantia', 'Concluída', 'Aguardando Retirada', 'Entregue', 'Cancelada']
const CLIENT_FIELDS = ['cliente','telefone','marca','modelo','imei','defeito','diagnostico','tipoSenha','pecas','insumosUtilizados','valorReparo','status','tecnicoResponsavel','observacoes','aceiteTermo','dataAbertura']

export default async function handler(req, res) {
  try {
    requireMethod(req, ['POST', 'GET'])
    const ctx = await authenticatedProfile(req)
    const { profile, db, FieldValue } = ctx
    requireStoreRole(profile, ALLOWED_ROLES)
    await requireActiveStore(profile, db)
    const storeRef = db.collection('lojas').doc(profile.lojaId)
    const statusConfigSnap = await storeRef.collection('configuracoes').doc('geral').get()
    const configuredStatusNames = statusConfigSnap.exists && Array.isArray(statusConfigSnap.data().statusOS) ? statusConfigSnap.data().statusOS.map(status => String(status.nome || '').trim()).filter(Boolean) : []
    const allowedStatuses = new Set([...STATUSES, ...configuredStatusNames])
    if (req.method === 'GET') {
      const osId = String(req.query?.osId || '')
      if (!osId) return res.status(400).json({ error: 'Informe a OS.' })
      const osRef = storeRef.collection('ordensServico').doc(osId)
      const snap = await osRef.get()
      if (!snap.exists) return res.status(404).json({ error: 'OS não encontrada.' })
      const { senhaProtegida } = snap.data()
      if (!senhaProtegida) return res.status(200).json({ senha: '' })
      // A revelação é um ato explícito e limitado a cargos que trabalham na OS.
      if (!process.env.APP_DATA_ENCRYPTION_KEY || process.env.APP_DATA_ENCRYPTION_KEY.length < 32) throw new Error('Chave de criptografia indisponível.')
      const crypto = await import('node:crypto')
      const key = crypto.createHash('sha256').update(process.env.APP_DATA_ENCRYPTION_KEY).digest()
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(senhaProtegida.iv, 'base64'))
      decipher.setAuthTag(Buffer.from(senhaProtegida.tag, 'base64'))
      const plain = Buffer.concat([decipher.update(Buffer.from(senhaProtegida.ciphertext, 'base64')), decipher.final()]).toString('utf8')
      await storeRef.collection('auditoriaSeguranca').add({ tipo: 'senha-aparelho-consultada', osId, usuarioUid: profile.uid, usuarioNome: profile.nome || profile.email || '', createdAt: new Date() })
      return res.status(200).json({ senha: plain })
    }

    const body = req.body || {}
    const action = body.action || 'criar'
    if (action === 'atualizar') {
      const osId = String(body.osId || '')
      if (!osId) return res.status(400).json({ error: 'ID da OS não informado.' })
      const updates = body.data || {}
      const clean = {}
      for (const field of CLIENT_FIELDS) if (Object.hasOwn(updates, field)) clean[field] = updates[field]
      if (Object.hasOwn(clean, 'valorReparo')) {
        const value = Number(clean.valorReparo)
        if (!Number.isFinite(value) || value < 0) return res.status(400).json({ error: 'Valor do reparo inválido.' })
        clean.valorReparo = value
      }
      if (clean.status && !allowedStatuses.has(clean.status)) return res.status(400).json({ error: 'Status de OS inválido.' })
      if (clean.tipoSenha === 'Padrão (1 a 9)' && updates.senha && !/^[1-9]+$/.test(String(updates.senha))) return res.status(400).json({ error: 'A senha padrão só pode conter dígitos de 1 a 9. O zero é proibido.' })
      if (updates.senha) {
        const { encryptSensitive } = await import('../_lib/firebaseAdmin.js')
        clean.senhaProtegida = encryptSensitive(updates.senha)
      }
      delete clean.senha
      clean.updatedAt = FieldValue.serverTimestamp()
      clean.updatedBy = profile.uid
      const osRef = storeRef.collection('ordensServico').doc(osId)
      await db.runTransaction(async transaction => {
        const existing = await transaction.get(osRef)
        if (!existing.exists) { const error = new Error('OS não encontrada.'); error.status = 404; throw error }
        const old = existing.data()
        if (clean.status && clean.status !== old.status) {
          clean.historicoStatus = FieldValue.arrayUnion({ anterior: old.status || null, novo: clean.status, usuarioUid: profile.uid, usuarioNome: profile.nome || profile.email, criadoEm: new Date().toISOString() })
        }
        if (clean.aceiteTermo === true && old.aceiteTermo !== true) {
          clean.aceiteTermoEm = FieldValue.serverTimestamp()
          clean.versaoTermo = '1.0'
        }
        if (clean.aceiteTermo === false && old.aceiteTermo === true) {
          clean.historicoTermos = FieldValue.arrayUnion({ acao: 'retirada', usuarioUid: profile.uid, criadoEm: new Date().toISOString(), versao: old.versaoTermo || '1.0' })
        } else if (clean.aceiteTermo === true && old.aceiteTermo !== true) {
          clean.historicoTermos = FieldValue.arrayUnion({ acao: 'aceite', usuarioUid: profile.uid, criadoEm: new Date().toISOString(), versao: '1.0' })
        }
        const auditChanges = {}
        for (const [field, value] of Object.entries(clean)) {
          if (['updatedAt', 'updatedBy', 'historicoStatus', 'historicoTermos', 'aceiteTermoEm', 'versaoTermo', 'senhaProtegida'].includes(field)) continue
          const before = old[field] ?? null
          if (JSON.stringify(before) !== JSON.stringify(value)) auditChanges[field] = { anterior: before, novo: value }
        }
        transaction.update(osRef, clean)
        if (Object.keys(auditChanges).length) {
          const auditRef = storeRef.collection('auditoriaOS').doc()
          transaction.create(auditRef, { osId, numeroOS: old.numeroOS ?? null, acao: 'edicao', usuarioUid: profile.uid, usuarioNome: profile.nome || profile.email || '', alteracoes: auditChanges, createdAt: FieldValue.serverTimestamp(), criadoEm: new Date().toISOString() })
        }
      })
      return res.status(200).json({ ok: true, message: 'OS atualizada e histórico registrado.' })
    }

    const data = body.data || body
    if (!String(data.cliente || '').trim()) return res.status(400).json({ error: 'Informe o nome do cliente.' })
    if (data.status && !allowedStatuses.has(data.status)) return res.status(400).json({ error: 'Status de OS inválido.' })
    const value = Number(data.valorReparo ?? 0)
    if (!Number.isFinite(value) || value < 0) return res.status(400).json({ error: 'Valor do reparo inválido.' })
    if (data.tipoSenha === 'Padrão (1 a 9)' && data.senha && !/^[1-9]+$/.test(String(data.senha))) return res.status(400).json({ error: 'A senha padrão só pode conter dígitos de 1 a 9. O zero é proibido.' })
    const { encryptSensitive } = await import('../_lib/firebaseAdmin.js')
    const osRef = storeRef.collection('ordensServico').doc()
    const configRef = storeRef.collection('configuracoes').doc('geral')
    let nextNumber = 0
    await db.runTransaction(async transaction => {
      const configSnap = await transaction.get(configRef)
      const config = configSnap.exists ? configSnap.data() : {}
      nextNumber = Number(config.contadorOS || 0) + 1
      if (!Number.isSafeInteger(nextNumber) || nextNumber < 1) throw new Error('Contador sequencial de OS inválido.')
      transaction.set(configRef, { contadorOS: nextNumber, updatedAt: FieldValue.serverTimestamp() }, { merge: true })
      const payload = {}
      for (const field of CLIENT_FIELDS) if (Object.hasOwn(data, field)) payload[field] = data[field]
      payload.numeroOS = nextNumber
      payload.cliente = String(data.cliente).trim()
      payload.telefone = String(data.telefone || '').replace(/\D/g, '').slice(0, 11)
      payload.valorReparo = value
      payload.status = data.status || 'Aberta'
      payload.lojaId = profile.lojaId
      payload.createdAt = FieldValue.serverTimestamp()
      payload.dataAbertura = data.dataAbertura || new Date().toISOString()
      payload.createdBy = profile.uid
      payload.createdByNome = profile.nome || profile.email || ''
      payload.historicoStatus = [{ anterior: null, novo: payload.status, usuarioUid: profile.uid, usuarioNome: profile.nome || profile.email, criadoEm: new Date().toISOString() }]
      payload.aceiteTermo = data.aceiteTermo === true
      payload.versaoTermo = data.aceiteTermo === true ? '1.0' : null
      payload.aceiteTermoEm = data.aceiteTermo === true ? FieldValue.serverTimestamp() : null
      payload.historicoTermos = data.aceiteTermo === true ? [{ acao: 'aceite', usuarioUid: profile.uid, criadoEm: new Date().toISOString(), versao: '1.0' }] : []
      if (data.senha) payload.senhaProtegida = encryptSensitive(data.senha)
      transaction.create(osRef, payload)
      const auditRef = storeRef.collection('auditoriaOS').doc()
      transaction.create(auditRef, { osId: osRef.id, numeroOS: nextNumber, acao: 'criacao', usuarioUid: profile.uid, usuarioNome: profile.nome || profile.email || '', alteracoes: { status: { anterior: null, novo: payload.status }, cliente: { anterior: null, novo: payload.cliente }, valorReparo: { anterior: null, novo: payload.valorReparo } }, createdAt: FieldValue.serverTimestamp(), criadoEm: new Date().toISOString() })
    })
    return res.status(201).json({ ok: true, osId: osRef.id, numeroOS: nextNumber, message: `OS #${nextNumber} criada com sucesso.` })
  } catch (error) { return sendError(res, error, 'Não foi possível salvar a ordem de serviço.') }
}
