function normEmail(s) {
  return String(s ?? '')
    .trim()
    .toLowerCase()
}

function normName(s) {
  return String(s ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
}

/** Correo de planilla o, si falta, el de plantilla con el mismo nombre. */
export function resolvePunchEmailForPlanillaRow(row, eventWorkers) {
  const fromPlanilla = normEmail(row?.correo)
  if (fromPlanilla) return fromPlanilla
  const nombre = normName(row?.nombre)
  if (!nombre) return null
  const w = (eventWorkers ?? []).find((x) => normName(x.full_name) === nombre)
  return normEmail(w?.email) || null
}

/** Correos para los que hay que cargar fichajes (planilla + plantilla + logins). */
export function collectPunchEmails(planillaRows, eventWorkers, loginRecords) {
  const emails = new Set()
  for (const row of planillaRows ?? []) {
    const em = resolvePunchEmailForPlanillaRow(row, eventWorkers)
    if (em) emails.add(em)
  }
  for (const w of eventWorkers ?? []) {
    const em = normEmail(w.email)
    if (em) emails.add(em)
  }
  for (const rec of loginRecords ?? []) {
    const em = normEmail(rec.email)
    if (em) emails.add(em)
  }
  return [...emails]
}

/**
 * Lista para «Turnos picados»: todas las filas de planilla con nombre (como Celdas horario)
 * más cuentas de la app / plantilla que no estén ya enlazadas.
 */
export function buildFichajesWorkerEntries(
  planillaRows,
  eventWorkers,
  loginRecords,
  punchByEmail,
) {
  /** @type {Array<{ id: string, nombre: string, correo: string|null, punchLookupEmail: string|null, inPlanilla: boolean, needsCorreo: boolean }>} */
  const entries = []
  const seenPlanillaKey = new Set()
  const seenPunchEmail = new Set()

  for (const row of planillaRows ?? []) {
    const nombre = String(row.nombre ?? '').trim()
    if (!nombre) continue

    const planillaKey = String(row.id ?? `name:${normName(nombre)}`)
    if (seenPlanillaKey.has(planillaKey)) continue
    seenPlanillaKey.add(planillaKey)

    const planillaCorreo = normEmail(row.correo)
    const punchLookupEmail = resolvePunchEmailForPlanillaRow(row, eventWorkers)
    if (punchLookupEmail) seenPunchEmail.add(punchLookupEmail)

    entries.push({
      id: planillaKey,
      nombre,
      correo: planillaCorreo || punchLookupEmail || null,
      punchLookupEmail,
      inPlanilla: true,
      needsCorreo: !planillaCorreo && !punchLookupEmail,
    })
  }

  for (const w of eventWorkers ?? []) {
    const em = normEmail(w.email)
    if (!em || seenPunchEmail.has(em)) continue
    seenPunchEmail.add(em)
    const nombre = String(w.full_name ?? '').trim() || em
    entries.push({
      id: String(w.id ?? em),
      nombre,
      correo: em,
      punchLookupEmail: em,
      inPlanilla: false,
      needsCorreo: false,
    })
  }

  for (const rec of loginRecords ?? []) {
    const em = normEmail(rec.email)
    if (!em || seenPunchEmail.has(em)) continue
    seenPunchEmail.add(em)
    entries.push({
      id: em,
      nombre: em,
      correo: em,
      punchLookupEmail: em,
      inPlanilla: false,
      needsCorreo: false,
    })
  }

  for (const [em, punches] of Object.entries(punchByEmail ?? {})) {
    const e = normEmail(em)
    if (!e || seenPunchEmail.has(e) || !punches?.length) continue
    seenPunchEmail.add(e)
    entries.push({
      id: e,
      nombre: e,
      correo: e,
      punchLookupEmail: e,
      inPlanilla: false,
      needsCorreo: false,
    })
  }

  return entries.sort((a, b) => {
    if (a.inPlanilla !== b.inPlanilla) return a.inPlanilla ? -1 : 1
    return a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' })
  })
}

export function punchesForWorkerEntry(worker, punchByEmail) {
  const em = normEmail(worker?.punchLookupEmail || worker?.correo)
  if (!em) return []
  return punchByEmail[em] ?? []
}
