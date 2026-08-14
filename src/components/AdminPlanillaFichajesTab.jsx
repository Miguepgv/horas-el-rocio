import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { friendlySupabaseError } from '../lib/dbErrors.js'
import { resolvePrimaryPunchUserId } from '../lib/adminPlanillaPunches.js'
import AdminFichajesPaySummary from './AdminFichajesPaySummary.jsx'
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
import { rateLabelForProfile, workerRateProfile } from '../lib/elRocioRates.js'
import {
  CLOCK_HOUR_OPTIONS,
  CLOCK_MINUTE_OPTIONS,
  formatClock,
  replaceManualShiftForDay,
  shiftIsComplete,
  shiftTimesFromPunches,
} from '../lib/manualDayHours.js'

function fmtDateEs(isoYmd) {
  const d = parseLocalDate(isoYmd)
  return d.toLocaleDateString('es-ES', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
}

function ClockPair({ times, disabled, onPatch, ariaDay }) {
  const inH = times?.inH === '' || times?.inH == null ? '' : String(times.inH)
  const outH = times?.outH === '' || times?.outH == null ? '' : String(times.outH)
  const inM = String(times?.inM ?? 0)
  const outM = String(times?.outM ?? 0)
  return (
    <div className="manual-hours-selects">
      <span className="muted small">E</span>
      <select
        className="table-input manual-hours-select"
        aria-label={`Entrada hora ${ariaDay}`}
        disabled={disabled}
        value={inH}
        onChange={(e) =>
          onPatch({
            inH: e.target.value === '' ? '' : Number(e.target.value),
            inM: times?.inM ?? 0,
          })
        }
      >
        <option value="">—</option>
        {CLOCK_HOUR_OPTIONS.map((n) => (
          <option key={`in-h-${n}`} value={String(n)}>
            {String(n).padStart(2, '0')}
          </option>
        ))}
      </select>
      <select
        className="table-input manual-hours-select"
        aria-label={`Entrada minutos ${ariaDay}`}
        disabled={disabled || inH === ''}
        value={inM}
        onChange={(e) => onPatch({ inM: Number(e.target.value) })}
      >
        {CLOCK_MINUTE_OPTIONS.map((n) => (
          <option key={`in-m-${n}`} value={String(n)}>
            {String(n).padStart(2, '0')}
          </option>
        ))}
      </select>
      <span className="muted">→</span>
      <span className="muted small">S</span>
      <select
        className="table-input manual-hours-select"
        aria-label={`Salida hora ${ariaDay}`}
        disabled={disabled}
        value={outH}
        onChange={(e) =>
          onPatch({
            outH: e.target.value === '' ? '' : Number(e.target.value),
            outM: times?.outM ?? 0,
          })
        }
      >
        <option value="">—</option>
        {CLOCK_HOUR_OPTIONS.map((n) => (
          <option key={`out-h-${n}`} value={String(n)}>
            {String(n).padStart(2, '0')}
          </option>
        ))}
      </select>
      <select
        className="table-input manual-hours-select"
        aria-label={`Salida minutos ${ariaDay}`}
        disabled={disabled || outH === ''}
        value={outM}
        onChange={(e) => onPatch({ outM: Number(e.target.value) })}
      >
        {CLOCK_MINUTE_OPTIONS.map((n) => (
          <option key={`out-m-${n}`} value={String(n)}>
            {String(n).padStart(2, '0')}
          </option>
        ))}
      </select>
      {shiftIsComplete(times) &&
      Number(times.outH) * 60 + Number(times.outM) <=
        Number(times.inH) * 60 + Number(times.inM) ? (
        <span className="muted small">(+1 día)</span>
      ) : null}
    </div>
  )
}

function WorkerDayRows({
  dayList,
  punches,
  viewDateIso,
  calendarTodayIso,
  rates,
  savingKey,
  onChangeShift,
}) {
  const fromPunches = useMemo(() => {
    const o = {}
    for (const iso of dayList) o[iso] = shiftTimesFromPunches(punches, iso)
    return o
  }, [dayList, punches])

  const [draft, setDraft] = useState(fromPunches)

  useEffect(() => {
    setDraft((prev) => {
      const next = { ...prev }
      for (const iso of dayList) {
        if (savingKey === iso) continue
        next[iso] = fromPunches[iso]
      }
      return next
    })
  }, [fromPunches, dayList, savingKey])

  return dayList.map((iso) => {
    const d = parseLocalDate(iso)
    const wd = weekdayMonSunFromDate(d)
    const hPaid = workedPaidHoursOverlappingDay(punches, iso)
    const ePaid = paidEurosOverlappingDay(punches, iso, rates)
    const times = draft[iso] ?? fromPunches[iso]
    const selected = iso === viewDateIso
    const calendarToday = isTodayIso(iso, calendarTodayIso)
    const saving = savingKey === iso
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
          <ClockPair
            times={times}
            disabled={saving || !onChangeShift}
            ariaDay={fmtDateEs(iso)}
            onPatch={(patch) => {
              const next = { ...times, ...patch }
              setDraft((prev) => ({ ...prev, [iso]: next }))
              onChangeShift(iso, next)
            }}
          />
          {saving ? <span className="muted small">Guardando…</span> : null}
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
            </>
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
  onHoursSaved,
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
  const [showPastDays, setShowPastDays] = useState(true)
  const [showFutureDays, setShowFutureDays] = useState(true)
  const [reportDate, setReportDate] = useState(todayIso)
  const [downloadBusy, setDownloadBusy] = useState(false)
  const [exportMsg, setExportMsg] = useState(null)
  const [savingKey, setSavingKey] = useState(null)
  const [hoursMsg, setHoursMsg] = useState(null)

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
      eurosFn: (punches, iso, worker) =>
        paidEurosOverlappingDay(punches, iso, workerRateProfile(worker)),
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

  async function handleSetShift(worker, dayIso, times) {
    const key = worker.punchLookupEmail
    if (!key) {
      setHoursMsg({
        type: 'error',
        text: `Guarda primero a ${worker.nombre} en Celdas horario para poder meter horas.`,
      })
      return
    }
    const complete = shiftIsComplete(times)
    const clearing = !complete
    if (clearing) {
      const had = shiftTimesFromPunches(
        punchesForWorkerEntry(worker, punchByEmail),
        dayIso,
      )
      if (!shiftIsComplete(had)) return
    }
    setSavingKey(`${worker.id}:${dayIso}`)
    setHoursMsg(null)
    const userId = await resolvePrimaryPunchUserId(key, eventWorkers)
    const result = await replaceManualShiftForDay(supabase, userId, dayIso, times)
    setSavingKey(null)
    if (!result.ok) {
      setHoursMsg({
        type: 'error',
        text: `${worker.nombre}: ${friendlySupabaseError(result.error)}`,
      })
      return
    }
    const label = complete
      ? `${formatClock(times.inH, times.inM)} → ${formatClock(times.outH, times.outM)}`
      : 'sin turno'
    setHoursMsg({
      type: 'ok',
      text: `${worker.nombre} · ${fmtDateEs(dayIso)}: ${label}`,
    })
    await onHoursSaved?.()
  }

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
        En cada día elige <strong>entrada</strong> y <strong>salida</strong> (hora y
        minutos). Se guarda al completar las dos. Si la salida es más temprano que la
        entrada (p. ej. 22:00 → 04:00), cuenta al día siguiente. — borra el turno.
      </p>
      {hoursMsg ? (
        <p className={`hint ${hoursMsg.type === 'error' ? 'error' : 'ok'}`}>
          {hoursMsg.text}
        </p>
      ) : null}
      {workers.length === 0 ? (
        <p className="muted">No hay filas en la planilla todavía.</p>
      ) : (
        workers.map((worker) => {
          const em = worker.correo
          const nombre = worker.nombre
          const punches = punchesForWorkerEntry(worker, punchByEmail)
          const rates = workerRateProfile(worker)
          const totalHPaid = allDays.reduce(
            (s, iso) => s + workedPaidHoursOverlappingDay(punches, iso),
            0,
          )
          const totalEPaid = allDays.reduce(
            (s, iso) => s + paidEurosOverlappingDay(punches, iso, rates),
            0,
          )
          const viewHPaid = workedPaidHoursOverlappingDay(punches, reportDate)
          const viewEPaid = paidEurosOverlappingDay(punches, reportDate, rates)
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
                ) : null}
                {!worker.inPlanilla ? (
                  <span className="badge-fichajes-solo-app muted small">
                    Solo app / plantilla
                  </span>
                ) : null}
                <span className="muted small">{rateLabelForProfile(rates)}</span>
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
              </div>
              <div className="table-wrap admin-fichajes-mini-wrap">
                <table className="rules-table schedule-table admin-fichajes-mini-table">
                  <thead>
                    <tr>
                      <th className="fichajes-sticky-day">Día</th>
                      <th>Entrada → Salida</th>
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
                        rates={rates}
                        savingKey={
                          savingKey?.startsWith(`${worker.id}:`)
                            ? savingKey.slice(String(worker.id).length + 1)
                            : null
                        }
                        onChangeShift={
                          worker.punchLookupEmail
                            ? (iso, times) => handleSetShift(worker, iso, times)
                            : null
                        }
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
