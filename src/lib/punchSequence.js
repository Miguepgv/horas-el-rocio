/** Fichajes de cobro ordenados por hora (sin no_pay). */
export function paidPunchesSorted(punches) {
  return (punches ?? [])
    .filter((p) => !p.no_pay)
    .slice()
    .sort(
      (a, b) =>
        new Date(a.punched_at).getTime() - new Date(b.punched_at).getTime(),
    )
}

/** Hay una entrada de cobro sin salida posterior. */
export function hasOpenPaidIn(punches) {
  let open = false
  for (const p of paidPunchesSorted(punches)) {
    if (p.punch_type === 'in') open = true
    else if (p.punch_type === 'out') open = false
  }
  return open
}

/** ¿Se puede picar este tipo ahora? (entrada solo si cerrado; salida solo si hay entrada abierta). */
export function canPunchKind(punches, kind) {
  const open = hasOpenPaidIn(punches)
  if (kind === 'in') return !open
  if (kind === 'out') return open
  return false
}

export function punchBlockedMessage(punches, kind) {
  if (canPunchKind(punches, kind)) return null
  if (kind === 'in') {
    return 'Ya tienes una entrada sin salida. Picar salida antes de volver a entrar.'
  }
  if (kind === 'out') {
    return 'No hay entrada abierta. Solo puedes picar salida después de una entrada.'
  }
  return 'Fichaje no permitido.'
}
