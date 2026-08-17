export function formatLocalDateTime(value: string | null | undefined, includeSeconds = true) {
  if (!value) return '—'

  const timestamp = Date.parse(value)
  if (Number.isNaN(timestamp)) return value

  const date = new Date(timestamp)
  const pad = (part: number) => String(part).padStart(2, '0')
  const formatted = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
  return includeSeconds ? `${formatted}:${pad(date.getSeconds())}` : formatted
}
