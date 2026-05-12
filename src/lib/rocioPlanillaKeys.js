/** Columnas de turno d01_a … d11_b (misma convención que AdminPlanillaPanel). */
export const ROCIO_PLANILLA_DAY_KEYS = []
for (let i = 1; i <= 11; i++) {
  const p = String(i).padStart(2, '0')
  ROCIO_PLANILLA_DAY_KEYS.push(`d${p}_a`, `d${p}_b`)
}

/** Columnas monetarias editables en planilla (€). */
export const ROCIO_PLANILLA_EXTRA_KEYS = [
  'nomina_event_euros',
  'gasoil_euros',
  'parking_euros',
]

export function emptyRocioPlanillaPayload() {
  const o = {
    nombre: '',
    correo: '',
    nomina_event_euros: '',
    gasoil_euros: '',
    parking_euros: '',
  }
  for (const k of ROCIO_PLANILLA_DAY_KEYS) o[k] = ''
  return o
}
