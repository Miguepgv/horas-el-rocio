/** Importe € de una celda de planilla (número o vacío → 0). */
export function parsePlanillaEuroField(v) {
  const s = String(v ?? '').trim()
  if (s === '') return 0
  const n = Number(s.replace(/\s/g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : 0
}

export function planillaExtrasFromRow(row) {
  return {
    nomina_event_euros: parsePlanillaEuroField(row?.nomina_event_euros),
    gasoil_euros: parsePlanillaEuroField(row?.gasoil_euros),
    parking_euros: parsePlanillaEuroField(row?.parking_euros),
  }
}

/** Desglose para pagar: bruto horas − nómina + gasoil + parking. */
export function computeAdminPayout(p) {
  const brutoHoras = Number(p?.eurosHoras ?? 0)
  const nomina = Number(p?.nomina ?? 0)
  const gasoil = Number(p?.gasoil ?? 0)
  const parking = Number(p?.parking ?? 0)
  const horasEnMano = Math.max(0, brutoHoras - nomina)
  const totalPagar = horasEnMano + gasoil + parking
  return { brutoHoras, nomina, horasEnMano, gasoil, parking, totalPagar }
}
