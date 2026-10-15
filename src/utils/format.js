export const money = value => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number.isFinite(Number(value)) ? Number(value) : 0)
export const dateTime = value => {
  if (!value) return '—'
  const date = value?.toDate ? value.toDate() : new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(date)
}
export const digits = value => String(value ?? '').replace(/\D/g, '')
export function phoneMask(value) {
  const d = digits(value).slice(0, 11)
  if (d.length <= 2) return d ? `(${d}` : ''
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
}
export function parseBRL(value) {
  if (typeof value === 'number') return Number.isFinite(value) && value >= 0 ? value : 0
  const clean = String(value ?? '').trim().replace(/R\$/gi, '').replace(/\s/g, '')
  if (!clean) return 0
  const normalized = clean.includes(',') ? clean.replace(/\./g, '').replace(',', '.') : clean
  const parsed = Number(normalized)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0
}
export function validNumeric(value) {
  if (typeof value === 'number') return Number.isFinite(value) && value >= 0
  if (typeof value !== 'string' || !value.trim()) return false
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0
}
export function passwordPatternValid(value) { return value === '' || /^[1-9]+$/.test(value) }
