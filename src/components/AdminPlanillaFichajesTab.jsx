import { useMemo, useState } from 'react'
import FichadoShiftRows from './FichadoShiftRows.jsx'
import DayViewToolbar from './DayViewToolbar.jsx'
import {
  buildFichajesWorkerEntries,
  punchesForWorkerEntry,
} from '../lib/fichajesWorkerList.js'
import { eachPlanillaGridDateISO } from '../lib/rocioPlanillaSchedule.js'
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

function WorkerDayRows({ dayList, punches, todayIso }) {
  return dayList.map((iso) => {
    const d = parseLocalDate(iso)
    const wd = weekdayMonSunFromDate(d)
    const shifts = paidShiftsOverlappingDay(punches, iso)
    const hPaid = workedPaidHoursOverlappingDay(punches, iso)
    const ePaid = paidEurosOverlappingDay(punches, iso)
    const avgRate = hPaid > 0 ? ePaid / hPaid : null
    const today = isTodayIso(iso, todayIso)
    return (
      <tr
        key={iso}
        className={
          today
            ? 'fichajes-row-today'
            : iso < todayIso
              ? 'fichajes-row-past'
              : 'fichajes-row-future'
        }
      >
        <td className="fichajes-sticky-day">
          <strong>{weekdayShort(wd)}</strong>{' '}
          <span className="muted small">{fmtDateEs(iso)}</span>
          {today ? (
            <span className="badge-today small">Hoy</span>
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
  const allDays = useMemo(() => [...eachPlanillaGridDateISO()], [])
  const { past, future } = useMemo(
    () => partitionEventDays(allDays, todayIso),
    [allDays, todayIso],
  )

  const [showPastDays, setShowPastDays] = useState(false)
  const [showFutureDays, setShowFutureDays] = useState(false)
  const [reportDate, setReportDate] = useState(todayIso)
  const [downloadBusy, setDownloadBusy] = useState(false)
  const [exportMsg, setExportMsg] = useState(null)

  const visibleDays = useMemo(
    () =>
      visibleAdminDays(allDays, {
        showPast: showPastDays,
        showFuture: showFutureDays,
        todayIso,
      }),
    [allDays, showPastDays, showFutureDays, todayIso],
  )

  const weekReportDays = useMemo(
    () =>
      weekReportDayRange(allDays, todayIso, {
        includeFuture: showFutureDays,
      }),
    [allDays, todayIso, showFutureDays],
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
  const maxReportDate = todayIso

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
      />
      {exportMsg ? (
        <p className={`hint ${exportMsg.type === 'error' ? 'error' : 'ok'}`}>
          {exportMsg.text}
        </p>
      ) : null}

      <p className="muted small admin-fichajes-hint">
        Vista rápida del día actual. Usa el informe Excel para revisar cualquier
        día con listado de turnos y totales.
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
          const todayHPaid = workedPaidHoursOverlappingDay(punches, todayIso)
          const todayEPaid = paidEurosOverlappingDay(punches, todayIso)

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
                {todayHPaid > 0 || todayEPaid > 0 ? (
                  <span className="muted small fichajes-today-total">
                    Hoy: <strong>{formatHoursMinutes(todayHPaid)}</strong>
                    {todayEPaid > 0 ? (
                      <>
                        {' '}
                        · <strong>{todayEPaid.toFixed(2)} €</strong>
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
                          Hoy no está dentro del periodo de la feria en la
                          planilla.
                        </td>
                      </tr>
                    ) : (
                      <WorkerDayRows
                        dayList={visibleDays}
                        punches={punches}
                        todayIso={todayIso}
                      />
                    )}
                  </tbody>
                </table>
              </div>
              <p className="admin-fichajes-worker-total muted small">
                <strong>Total periodo feria:</strong>{' '}
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
