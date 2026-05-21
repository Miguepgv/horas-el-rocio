import { useMemo, useState } from 'react'
import AdminFichajesPaySummary from './AdminFichajesPaySummary.jsx'
import FichadoShiftRows from './FichadoShiftRows.jsx'
import DayViewToolbar from './DayViewToolbar.jsx'
import {
  buildFichajesWorkerEntries,
  punchesForWorkerEntry,
} from '../lib/fichajesWorkerList.js'
import {
  buildDailyReportRows,
  downloadDailyShiftsReportXlsx,
  downloadWeeklyShiftsReportXlsx,
} from '../lib/exportDailyShiftsXlsx.js'
import {
  isTodayIso,
  partitionEventDays,
  todayIsoLocal,
  visibleAdminDays,
  weekReportDayRange,
} from '../lib/feriaDayView.js'
import {
  eachCobroDisplayDateISO,
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

function WorkerDayRows({ dayList, punches, viewDateIso, calendarTodayIso }) {
  return dayList.map((iso) => {
    const d = parseLocalDate(iso)
    const wd = weekdayMonSunFromDate(d)
    const shifts = paidShiftsOverlappingDay(punches, iso)
    const hPaid = workedPaidHoursOverlappingDay(punches, iso)
    const ePaid = paidEurosOverlappingDay(punches, iso)
    const avgRate = hPaid > 0 ? ePaid / hPaid : null
    const selected = iso === viewDateIso
    const calendarToday = isTodayIso(iso, calendarTodayIso)
    return (
      <tr
        key={iso}
        className={
          selected
            ? 'fichajes-row-today'
            : iso < viewDateIso
              ? 'fichajes-row-past'
              : 'fichajes-row-future'
        }
      >
        <td className="fichajes-sticky-day">
          <strong>{weekdayShort(wd)}</strong>{' '}
          <span className="muted small">{fmtDateEs(iso)}</span>
          {selected ? (
            <span className="badge-today small">
              {calendarToday ? 'Hoy' : 'Revisando'}
            </span>
          ) : null}
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
              {avgRate != null ? <> (~{avgRate.toFixed(2)} €/h)</> : null}
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
  })
}

export default function AdminPlanillaFichajesTab({
  rows,
  eventWorkers,
  loginEmailRecords,
  punchByEmail,
  onCorregir,
}) {
  const todayIso = todayIsoLocal()
  const allPunchesFlat = useMemo(
    () => Object.values(punchByEmail ?? {}).flat(),
    [punchByEmail],
  )
  const allDays = useMemo(
    () => eachCobroDisplayDateISO(allPunchesFlat),
    [allPunchesFlat],
  )
  const [showPastDays, setShowPastDays] = useState(false)
  const [showFutureDays, setShowFutureDays] = useState(false)
  const [reportDate, setReportDate] = useState(todayIso)
  const [downloadBusy, setDownloadBusy] = useState(false)
  const [exportMsg, setExportMsg] = useState(null)

  const { past, future } = useMemo(
    () => partitionEventDays(allDays, reportDate),
    [allDays, reportDate],
  )

  const visibleDays = useMemo(() => {
    if (showPastDays || showFutureDays) {
      return visibleAdminDays(allDays, {
        showPast: showPastDays,
        showFuture: showFutureDays,
        todayIso: reportDate,
      })
    }
    return allDays.includes(reportDate) ? [reportDate] : []
  }, [allDays, showPastDays, showFutureDays, reportDate])

  const weekReportDays = useMemo(
    () =>
      weekReportDayRange(allDays, reportDate, {
        includeFuture: showFutureDays,
      }),
    [allDays, reportDate, showFutureDays],
  )

  const reportFns = useMemo(
    () => ({
      paidShiftsFn: paidShiftsOverlappingDay,
      hoursFn: workedPaidHoursOverlappingDay,
      eurosFn: paidEurosOverlappingDay,
      punchesForWorker: punchesForWorkerEntry,
    }),
    [],
  )

  const minReportDate = allDays[0] ?? todayIso
  const maxReportDate = allDays[allDays.length - 1] ?? todayIso

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

  async function handleDownloadDaily() {
    setExportMsg(null)
    setDownloadBusy(true)
    try {
      const reportRows = buildDailyReportRows(
        workers,
        punchByEmail,
        reportDate,
        reportFns,
      )
      await downloadDailyShiftsReportXlsx({
        reportDateIso: reportDate,
        title: 'Informe diario — turnos picados (cobro)',
        rows: reportRows,
      })
      setExportMsg({ type: 'ok', text: 'Informe del día descargado.' })
    } catch (e) {
      setExportMsg({
        type: 'error',
        text: e?.message ?? 'No se pudo generar el informe.',
      })
    }
    setDownloadBusy(false)
  }

  async function handleDownloadWeekly() {
    setExportMsg(null)
    setDownloadBusy(true)
    try {
      await downloadWeeklyShiftsReportXlsx({
        dayIsos: weekReportDays,
        title: 'Informe semanal — personal (turnos picados, cobro)',
        workers,
        punchByEmail,
        fns: reportFns,
      })
      setExportMsg({ type: 'ok', text: 'Informe de la semana descargado.' })
    } catch (e) {
      setExportMsg({
        type: 'error',
        text: e?.message ?? 'No se pudo generar el informe semanal.',
      })
    }
    setDownloadBusy(false)
  }

  return (
    <div className="admin-fichajes-tab">
      <DayViewToolbar
        reportDate={reportDate}
        onReportDateChange={setReportDate}
        minDate={minReportDate}
        maxDate={maxReportDate}
        showPastDays={showPastDays}
        onTogglePast={() => setShowPastDays((v) => !v)}
        pastCount={past.length}
        showFutureDays={showFutureDays}
        onToggleFuture={() => setShowFutureDays((v) => !v)}
        futureCount={future.length}
        onDownloadDaily={handleDownloadDaily}
        onDownloadWeekly={handleDownloadWeekly}
        downloadBusy={downloadBusy}
        dateLabel="Día a revisar"
        hintText="Elige el día que quieres revisar (útil después de medianoche: sigue en turno del día anterior). La tabla y el resumen de cada persona usan esa fecha. Los informes Excel usan el mismo día."
      />
      {exportMsg ? (
        <p className={`hint ${exportMsg.type === 'error' ? 'error' : 'ok'}`}>
          {exportMsg.text}
        </p>
      ) : null}

      <p className="muted small admin-fichajes-hint">
        Turnos picados por día de cobro (entrada del turno). Cambia la fecha arriba
        para ver otro día sin esperar al calendario.
      </p>
      {planillaSinCorreo > 0 ? (
        <p className="muted small admin-fichajes-hint">
          Hay {planillaSinCorreo} fila(s) sin correo en planilla: asigna el correo
          de la app y pulsa <strong>Guardar</strong>.
        </p>
      ) : null}
      {workers.length === 0 ? (
        <p className="muted">No hay filas en la planilla todavía.</p>
      ) : (
        workers.map((worker) => {
          const em = worker.correo
          const nombre = worker.nombre
          const punches = punchesForWorkerEntry(worker, punchByEmail)
          const totalHPaid = allDays.reduce(
            (s, iso) => s + workedPaidHoursOverlappingDay(punches, iso),
            0,
          )
          const totalEPaid = allDays.reduce(
            (s, iso) => s + paidEurosOverlappingDay(punches, iso),
            0,
          )
          const viewHPaid = workedPaidHoursOverlappingDay(punches, reportDate)
          const viewEPaid = paidEurosOverlappingDay(punches, reportDate)
          const gasoil = worker.gasoil_euros ?? 0
          const parking = worker.parking_euros ?? 0
          const nomina = worker.nomina_event_euros ?? 0

          return (
            <div
              key={worker.id ?? em ?? nombre}
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
                  <span className="badge-fichajes-solo-app muted small">
                    Falta correo · no enlaza fichajes
                  </span>
                ) : !worker.inPlanilla ? (
                  <span className="badge-fichajes-solo-app muted small">
                    Solo app / plantilla
                  </span>
                ) : null}
                {viewHPaid > 0 || viewEPaid > 0 ? (
                  <span className="muted small fichajes-today-total">
                    {fmtDateEs(reportDate)}:{' '}
                    <strong>{formatHoursMinutes(viewHPaid)}</strong>
                    {viewEPaid > 0 ? (
                      <>
                        {' '}
                        · <strong>{viewEPaid.toFixed(2)} €</strong>
                      </>
                    ) : null}
                  </span>
                ) : null}
                <button
                  type="button"
                  className="secondary btn-xs"
                  disabled={!worker.punchLookupEmail}
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
                    {visibleDays.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="muted">
                          La fecha elegida no está en el periodo de cobro de la
                          feria.
                        </td>
                      </tr>
                    ) : (
                      <WorkerDayRows
                        dayList={visibleDays}
                        punches={punches}
                        viewDateIso={reportDate}
                        calendarTodayIso={todayIso}
                      />
                    )}
                  </tbody>
                </table>
              </div>
              <p className="admin-fichajes-worker-total muted small">
                <strong>Total periodo feria:</strong>
                <AdminFichajesPaySummary
                  hours={totalHPaid}
                  eurosHoras={totalEPaid}
                  gasoil={gasoil}
                  parking={parking}
                  nomina={nomina}
                />
              </p>
            </div>
          )
        })
      )}
    </div>
  )
}
