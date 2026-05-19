export const ROCIO_PLANILLA_DAY_KEYS = []
for (let i = 1; i <= 11; i++) {
  const p = String(i).padStart(2, '0')
  ROCIO_PLANILLA_DAY_KEYS.push(`d${p}_a`, `d${p}_b`)
}

export const ROCIO_PLANILLA_EXTRA_KEYS = [
  'nomina_event_euros',
  'gasoil_euros',
  'parking_euros',
]

/** Columnas € visibles en la app (gasoil/parking ocultos en interfaz). */
export const ROCIO_PLANILLA_EXTRA_KEYS_UI = ['nomina_event_euros']

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
