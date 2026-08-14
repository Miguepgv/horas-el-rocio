import { PAY_EVENT_EL_ROCIO } from '../data/payRules.js'
import { formatDateLocalISO, weekdayMonSunFromDate } from './payCompute.js'

const THANK_YOU_BY_WEEKDAY = {
  1: 'La masacre ha terminado y seguimos en pie gracias a ti. Ve a curar tus heridas de guerra y a recuperar tu humanidad. ¡Gran trabajo!',
  2: '¡Gracias por dar lo mejor de ti hoy! Disfruta de tu merecido descanso.',
  3: 'Tu esfuerzo marca la diferencia en el equipo. ¡Desconecta y recarga pilas!',
  4: 'Turno completado. ¡Gracias por mantener el nivel y cuidar los detalles hoy!',
  5: '¡Y fin! Gracias por tu energía hoy. ¡Nos vemos en el próximo turno!',
  6: '¡Sobreviviste al turno! Ve a descansar, te lo has ganado. 👏',
  7: 'Leyenda absoluta. Cierra los ojos rápido que el próximo servicio está a la vuelta de la esquina. ¡Fuerza y honor!',
}

const THANK_YOU_MARTES_CIERRE =
  'Misión completada. Oficialmente puedes apagar el cerebro y olvidar que este fin de semana existió. ¡Eres un grande, a descansar!'

/** Mensaje de agradecimiento al fichar salida (día de la semana en hora local). */
export function shiftThankYouMessage(date = new Date()) {
  const iso = formatDateLocalISO(date)
  const wd = weekdayMonSunFromDate(date)
  if (iso === PAY_EVENT_EL_ROCIO.dateTo) return THANK_YOU_MARTES_CIERRE
  return THANK_YOU_BY_WEEKDAY[wd] ?? THANK_YOU_BY_WEEKDAY[2]
}
