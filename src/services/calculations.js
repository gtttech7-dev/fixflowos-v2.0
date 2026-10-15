import { validNumeric } from '../utils/format.js'

export function stoppedValueByStatus(orders, statuses = []) {
  const config = new Map(statuses.map(status => [status.nome, status]))
  const buckets = new Map()
  for (const os of orders) {
    const status = String(os.status || 'Aberta')
    const cfg = config.get(status)
    const active = cfg ? cfg.ativo !== false : true
    const present = active && (cfg ? cfg.considerarAparelhoNaLoja === true : !['Entregue', 'Cancelada'].includes(status))
    if (!present) continue
    const countsValue = cfg ? cfg.considerarValorParado === true && cfg.considerarAparelhoNaLoja === true : !['Entregue', 'Cancelada'].includes(status)
    if (!buckets.has(status)) buckets.set(status, { status, quantidade: 0, valor: 0 })
    const bucket = buckets.get(status)
    bucket.quantidade += 1
    if (countsValue && validNumeric(os.valorReparo)) bucket.valor += Number(os.valorReparo)
  }
  const rows = [...buckets.values()].sort((a, b) => a.status.localeCompare(b.status, 'pt-BR'))
  return { rows, quantidade: rows.reduce((sum, row) => sum + row.quantidade, 0), valor: rows.reduce((sum, row) => sum + row.valor, 0) }
}
