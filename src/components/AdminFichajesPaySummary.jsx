import { formatHoursMinutes } from '../lib/payCompute.js'
import { computeAdminPayout } from '../lib/planillaEuroExtras.js'

/** Total periodo feria en Turnos picados: bruto, nómina (resta), gasoil, parking, total a pagar. */
export default function AdminFichajesPaySummary({
  hours = 0,
  eurosHoras = 0,
  gasoil = 0,
  parking = 0,
  nomina = 0,
}) {
  const pay = computeAdminPayout({
    eurosHoras,
    nomina,
    gasoil,
    parking,
  })
  const hasHours = hours > 0 || pay.brutoHoras > 0
  const hasPlanilla =
    pay.nomina > 0 || pay.gasoil > 0 || pay.parking > 0

  if (!hasHours && !hasPlanilla && pay.totalPagar <= 0) {
    return <span>—</span>
  }

  return (
    <span className="admin-fichajes-pay-summary">
      {hasHours ? (
        <span className="admin-fichajes-pay-line">
          <strong>{formatHoursMinutes(hours)}</strong>
          {pay.brutoHoras > 0 ? (
            <>
              {' '}
              · Bruto horas: <strong>{pay.brutoHoras.toFixed(2)} €</strong>
            </>
          ) : null}
        </span>
      ) : null}
      {pay.nomina > 0 ? (
        <span className="admin-fichajes-pay-line admin-fichajes-pay-deduct">
          Nómina (resta): <strong>−{pay.nomina.toFixed(2)} €</strong>
        </span>
      ) : null}
      {pay.nomina > 0 && pay.brutoHoras > 0 ? (
        <span className="admin-fichajes-pay-line">
          Horas en mano: <strong>{pay.horasEnMano.toFixed(2)} €</strong>
        </span>
      ) : null}
      {pay.gasoil > 0 ? (
        <span className="admin-fichajes-pay-line">
          Gasoil: <strong>+{pay.gasoil.toFixed(2)} €</strong>
        </span>
      ) : null}
      {pay.parking > 0 ? (
        <span className="admin-fichajes-pay-line">
          Parking: <strong>+{pay.parking.toFixed(2)} €</strong>
        </span>
      ) : null}
      <span className="admin-fichajes-pay-line admin-fichajes-pay-total">
        <strong>Total a pagar: {pay.totalPagar.toFixed(2)} €</strong>
      </span>
    </span>
  )
}
