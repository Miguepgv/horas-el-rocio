/**
 * Evento El Rocío — metadatos del periodo.
 * Las tarifas €/h efectivas están en `src/lib/elRocioRates.js` (por instante, minuto a minuto).
 */

/** @typedef {{ sortOrder: number, title: string, weekdays: number[], fromTime: string, toTime: string, crossesMidnight?: boolean, eurPerHour: number, notes?: string }} PaySegment */

/** @type {{ id: string, label: string, dateFrom: string, dateTo: string, currency: string, segments: PaySegment[] }} */
export const PAY_EVENT_EL_ROCIO = {
  id: 'el_rocio_2026',
  label: 'El Rocío 2026 — La Tata',
  dateFrom: '2026-05-15',
  dateTo: '2026-05-26',
  currency: 'EUR',
  segments: [],
}

const WD = ['', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

export function formatWeekdays(ids) {
  const sorted = [...new Set(ids)].sort((a, b) => a - b)
  return sorted.map((n) => WD[n] ?? String(n)).join(', ')
}

export function formatTimeRange(segment) {
  const { fromTime, toTime, crossesMidnight } = segment
  if (crossesMidnight) {
    return `${fromTime} → ${toTime} (día siguiente)`
  }
  return `${fromTime} → ${toTime}`
}
