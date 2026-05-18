import { useMemo } from 'react'
import FichadoShiftRows from './FichadoShiftRows.jsx'
import {
  buildFichajesWorkerEntries,
  punchesForWorkerEntry,
} from '../lib/fichajesWorkerList.js'
import { eachPlanillaGridDateISO } from '../lib/rocioPlanillaSchedule.js'
import {
  formatHoursMinutes,
  paidEurosOverlappingDay,
  paidShiftsOverlappingDay,
  parseLocalDate,
  weekdayMonSunFromDate,
  weekdayShort,
  workedPaidHoursOverlappingDay,
} from '../lib/payCompute.js'

function fmtDateEs(isoYmd) {
  const d = parseLocalDate(isoYmd)
  return d.toLocaleDateString('es-ES', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
}

export default function AdminPlanillaFichajesTab({
  rows,
  eventWorkers,
  loginEmailRecords,
  punchByEmail,
  onCorregir,
}) {
  const dayList = useMemo(() => [...eachPlanillaGridDateISO()], [])

  const workers = useMemo(
    () =>
      buildFichajesWorkerEntries(
        rows,
        eventWorkers,
        loginEmailRecords,
        punchByEmail,
      ),
    [rows, eventWorkers, loginEmailRecords, punchByEmail],
  )

  const planillaSinCorreo = useMemo(
    () =>
      (rows ?? []).filter(
        (r) => String(r.nombre ?? '').trim() && !String(r.correo ?? '').trim(),
      ).length,
    [rows],
  )

  return (
    <div className="admin-fichajes-tab">
      <p className="muted small admin-fichajes-hint">
        Misma plantilla que «Celdas horario». La entrada aparece al picar; horas y €
        al cerrar con salida. Si falta correo en planilla, se intenta enlazar por
        nombre con la plantilla del evento.
      </p>
      {planillaSinCorreo > 0 ? (
        <p className="muted small admin-fichajes-hint">
          Hay {planillaSinCorreo} fila(s) sin correo en planilla: pon el mismo correo
          con el que entran a la app y pulsa <strong>Guardar</strong> en esa fila.
        </p>
      ) : null}
      {workers.length === 0 ? (
        <p className="muted">No hay filas en la planilla todavía.</p>
      ) : (
        workers.map((worker) => {
          const em = worker.correo
          const nombre = worker.nombre
          const punches = punchesForWorkerEntry(worker, punchByEmail)
          const totalHPaid = dayList.reduce(
            (s, iso) => s + workedPaidHoursOverlappingDay(punches, iso),
            0,
          )
          const totalEPaid = dayList.reduce(
            (s, iso) => s + paidEurosOverlappingDay(punches, iso),
            0,
          )
          return (
            <div
              key={worker.id ?? em}
              className="admin-fichajes-worker-block card subpanel"
            >
              <div className="admin-fichajes-worker-head">
                <h3 className="admin-fichajes-worker-title">{nombre}</h3>
                {em ? (
                  <code className="muted small">{em}</code>
                ) : (
                  <span className="muted small">Sin correo en planilla</span>
                )}
                {worker.needsCorreo ? (
                  <span
                    className="badge-fichajes-solo-app muted small"
                    title="Asigna y guarda el correo en Celdas horario para enlazar fichajes."
                  >
                    Falta correo · no enlaza fichajes
                  </span>
                ) : !worker.inPlanilla ? (
                  <span
                    className="badge-fichajes-solo-app muted small"
                    title="Cuenta o plantilla sin fila en planilla con este correo."
                  >
                    Solo app / plantilla
                  </span>
                ) : null}
                <button
                  type="button"
                  className="secondary btn-xs"
                  disabled={!worker.punchLookupEmail}
                  title={
                    worker.punchLookupEmail
                      ? 'Editar fichajes de este trabajador'
                      : 'Asigna y guarda un correo en planilla para poder corregir fichajes'
                  }
                  onClick={() =>
                    onCorregir(worker.punchLookupEmail ?? '', nombre)
                  }
                >
                  Corregir fichajes
                </button>
              </div>
              <div className="table-wrap admin-fichajes-mini-wrap">
                <table className="rules-table schedule-table admin-fichajes-mini-table">
                  <thead>
                    <tr>
                      <th className="fichajes-sticky-day">Día</th>
                      <th>Turnos picados (cobro)</th>
                      <th>Resumen día</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dayList.map((iso) => {
                      const d = parseLocalDate(iso)
                      const wd = weekdayMonSunFromDate(d)
                      const shifts = paidShiftsOverlappingDay(punches, iso)
                      const hPaid = workedPaidHoursOverlappingDay(punches, iso)
                      const ePaid = paidEurosOverlappingDay(punches, iso)
                      const avgRate = hPaid > 0 ? ePaid / hPaid : null
                      return (
                        <tr key={iso}>
                          <td className="fichajes-sticky-day">
                            <strong>{weekdayShort(wd)}</strong>{' '}
                            <span className="muted small">{fmtDateEs(iso)}</span>
                          </td>
                          <td>
                            {shifts.length > 0 ? (
                              <FichadoShiftRows shifts={shifts} />
                            ) : (
                              <span className="muted">—</span>
                            )}
                          </td>
                          <td className="muted small">
                            {hPaid > 0 ? (
                              <>
                                <strong>{formatHoursMinutes(hPaid)}</strong>
                                {ePaid > 0 ? (
                                  <>
                                    {' '}
                                    · <strong>{ePaid.toFixed(2)} €</strong>
                                  </>
                                ) : null}
                                {avgRate != null ? (
                                  <> (~{avgRate.toFixed(2)} €/h)</>
                                ) : null}
                              </>
                            ) : shifts.some((s) => s.open) ? (
                              <span className="fichado-open-summary">
                                Entrada picada · falta salida
                              </span>
                            ) : (
                              '—'
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <p className="admin-fichajes-worker-total muted small">
                <strong>Total turnos picados (cobro, periodo feria):</strong>{' '}
                {totalHPaid > 0 ? (
                  <>
                    <strong>{formatHoursMinutes(totalHPaid)}</strong>
                    {totalEPaid > 0 ? (
                      <>
                        {' '}
                        · <strong>{totalEPaid.toFixed(2)} €</strong>
                      </>
                    ) : null}
                  </>
                ) : (
                  '—'
                )}
              </p>
            </div>
          )
        })
      )}
    </div>
  )
}
