import { useMemo } from 'react'
import FichadoShiftRows from './FichadoShiftRows.jsx'
import {
  eachEventDateISO,
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

export default function AdminPlanillaFichajesTab({ rows, punchByEmail, onCorregir }) {
  const dayList = useMemo(() => [...eachEventDateISO()].sort(), [])

  const workers = useMemo(
    () =>
      rows.filter((r) => String(r.correo ?? '').trim()),
    [rows],
  )

  return (
    <div className="admin-fichajes-tab">
      <p className="muted small admin-fichajes-hint">
        La entrada aparece al picar; las horas y el importe del día se calculan al
        cerrar con salida.
      </p>
      {workers.length === 0 ? (
        <p className="muted">No hay filas con correo asignado.</p>
      ) : (
        workers.map((row) => {
          const em = String(row.correo ?? '')
            .trim()
            .toLowerCase()
          const nombre = String(row.nombre ?? '').trim() || em
          const punches = punchByEmail[em] ?? []
          const totalHPaid = dayList.reduce(
            (s, iso) => s + workedPaidHoursOverlappingDay(punches, iso),
            0,
          )
          const totalEPaid = dayList.reduce(
            (s, iso) => s + paidEurosOverlappingDay(punches, iso),
            0,
          )
          return (
            <div key={row.id ?? em} className="admin-fichajes-worker-block card subpanel">
              <div className="admin-fichajes-worker-head">
                <h3 className="admin-fichajes-worker-title">{nombre}</h3>
                <code className="muted small">{em}</code>
                <button
                  type="button"
                  className="secondary btn-xs"
                  onClick={() => onCorregir(em, nombre)}
                >
                  Corregir fichajes
                </button>
              </div>
              <div className="table-wrap">
                <table className="rules-table schedule-table admin-fichajes-mini-table">
                  <thead>
                    <tr>
                      <th>Día</th>
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
                          <td>
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
