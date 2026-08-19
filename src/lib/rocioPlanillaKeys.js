import { ROCIO_PLANILLA_GRID_DAY_COUNT } from './rocioPlanillaSchedule.js'

export const ROCIO_PLANILLA_DAY_KEYS = []
for (let i = 1; i <= ROCIO_PLANILLA_GRID_DAY_COUNT; i++) {
  const p = String(i).padStart(2, '0')
  ROCIO_PLANILLA_DAY_KEYS.push(`d${p}_a`, `d${p}_b`)
}

export const ROCIO_PLANILLA_RATE_KEYS = ['tarifa_finde', 'tarifa_miercoles']

export const ROCIO_PLANILLA_RATE_LABELS = {
  tarifa_finde: 'Vie–Mar €/h',
  tarifa_miercoles: 'Mié €/h',
}

export const ROCIO_PLANILLA_RATE_TITLES = {
  tarifa_finde: 'Viernes a martes: 12 €/h para todos.',
  tarifa_miercoles: 'Miércoles: 15 €/h para todos.',
}

export const ROCIO_PLANILLA_EXTRA_KEYS = [
  'nomina_event_euros',
  'gasoil_euros',
  'parking_euros',
]

/** Columnas € en planilla (admin y export). */
export const ROCIO_PLANILLA_EXTRA_KEYS_UI = ROCIO_PLANILLA_EXTRA_KEYS

export const ROCIO_PLANILLA_EXTRA_LABELS = {
  nomina_event_euros: 'Nómina €',
  gasoil_euros: 'Gasoil €',
  parking_euros: 'Incentivo €',
}

export const ROCIO_PLANILLA_EXTRA_TITLES = {
  nomina_event_euros:
    'Si es fijo: pon aquí el sueldo que ya va por nómina. Se RESTA del bruto de horas. Si las horas valen más, la diferencia se paga en mano. Si valen menos, horas en mano = 0. Las horas las metes tú en Turnos picados (no hace falta que piquen).',
  gasoil_euros: 'Se SUMA al total a pagar (gasoil).',
  parking_euros: 'Se SUMA al total a pagar (incentivo).',
}

export function emptyRocioPlanillaPayload() {
  const o = {
    nombre: '',
    correo: '',
    tarifa_finde: '12',
    tarifa_miercoles: '15',
    nomina_event_euros: '',
    gasoil_euros: '',
    parking_euros: '',
  }
  for (const k of ROCIO_PLANILLA_DAY_KEYS) o[k] = ''
  return o
}
