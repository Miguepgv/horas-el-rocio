import { useMemo } from 'react'
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

function fmtClock(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleTimeString('es-ES', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

function fmtDateEs(isoYmd) {
  const d = parseLocalDate(isoYmd)
  return d.toLocaleDateString('es-ES', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
}

/**
 * @param {{
 *   rows: Array<Record<string, unknown>>
 *   punchByEmail: Record<string, Array<{ id: string, punch_type: string, punched_at: string, no_pay?: boolean }>>
 *   onCorregir: (email: string, nombre: string) => void
 * }} props
 */
export default function AdminPlanillaFichajesTab({ rows, punchByEmail, onCorregir }) {
  const dayList = useMemo(() => [...eachEventDateISO()].sort(), [])

  const workers = useMemo(
    () =>
      rows.filter((r) => String(r.correo ?? '').trim()),
    [rows],
  )

  return (
    <div className="admin-fichajes-tab">
      <p className="muted small">
        Misma vista que <strong>Mi horario</strong> del trabajador: por día, entradas/salidas
        picadas y total del día. Pulsa <strong>Corregir fichajes</strong> para editar horas en
        Supabase.
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
                              <div className="fichado-stack">
                                {shifts.map((seg, i) => (
                                  <div key={i} className="fichado-shift-row">
                                    <span>
                                      <span className="badge-in badge-fich-in">E</span>{' '}
                                      <span className="time-strong">
                                        {fmtClock(seg.inAt.toISOString())}
                                      </span>
                                    </span>
                                    <span className="fichado-shift-mid muted">→</span>
                                    <span>
                                      <span className="badge-out badge-fich-out">S</span>{' '}
                                      <span className="time-strong">
                                        {fmtClock(seg.outAt.toISOString())}
                                      </span>
                                    </span>
                                    <span className="fichado-shift-hours">
                                      <strong>{formatHoursMinutes(seg.hoursOnDay)}</strong>
                                    </span>
                                  </div>
                                ))}
                              </div>
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
