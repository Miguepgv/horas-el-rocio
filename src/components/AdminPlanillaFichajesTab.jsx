import { useEffect, useMemo, useRef, useState } from 'react'
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
  emptyShift,
  formatClock,
  hoursFromShiftTimes,
  replaceManualShiftsForDay,
  shiftIsComplete,
  shiftIsEmpty,
  shiftIsPartial,
  shiftTimesListFromPunches,
  totalHoursFromShiftTimesList,
} from '../lib/manualDayHours.js'

function fmtDateEs(isoYmd) {
  const d = parseLocalDate(isoYmd)
  return d.toLocaleDateString('es-ES', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
}

function ClockPair({ times, disabled, onPatch, ariaDay, label }) {
  const inH = times?.inH === '' || times?.inH == null ? '' : String(times.inH)
  const outH = times?.outH === '' || times?.outH == null ? '' : String(times.outH)
  const inM = String(times?.inM ?? 0)
  const outM = String(times?.outM ?? 0)
  const hSeg = hoursFromShiftTimes(times)
  return (
    <div className="manual-hours-selects">
      {label ? <span className="muted small manual-hours-turno-label">{label}</span> : null}
      <span className="muted small">E</span>
      <select
        className="table-input manual-hours-select"
        aria-label={`Entrada hora ${ariaDay}${label ? ` ${label}` : ''}`}
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
        aria-label={`Entrada minutos ${ariaDay}${label ? ` ${label}` : ''}`}
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
        aria-label={`Salida hora ${ariaDay}${label ? ` ${label}` : ''}`}
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
        aria-label={`Salida minutos ${ariaDay}${label ? ` ${label}` : ''}`}
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
      {hSeg > 0 ? (
        <span className="muted small manual-hours-seg">
          {formatHoursMinutes(hSeg)}
        </span>
      ) : null}
    </div>
  )
}

function DayShiftEditor({
  timesList,
  disabled,
  ariaDay,
  onDraftChange,
  onPersist,
}) {
  const list =
    timesList?.length > 0 ? timesList : [emptyShift()]

  /** No guardar si hay filas vacías a medias (p. ej. acaba de pulsar + Añadir turno). */
  function readyToPersist(next) {
    if (next.some(shiftIsPartial)) return false
    const completes = next.filter(shiftIsComplete)
    const empties = next.filter(shiftIsEmpty)
    if (completes.length === 0) return true
    return empties.length === 0
  }

  function commit(next, { persist } = { persist: false }) {
    onDraftChange(next)
    if (persist && readyToPersist(next)) {
      onPersist?.(next)
    }
  }

  function patchAt(index, patch) {
    const next = list.map((t, i) => (i === index ? { ...t, ...patch } : t))
    commit(next, { persist: true })
  }

  function removeAt(index) {
    const next = list.filter((_, i) => i !== index)
    commit(next.length ? next : [emptyShift()], { persist: true })
  }

  function addShift() {
    // Solo UI: no guardar hasta que el nuevo tramo tenga entrada y salida.
    commit([...list, emptyShift()], { persist: false })
  }

  const draftTotal = totalHoursFromShiftTimesList(list)

  return (
    <div className="manual-hours-day-stack">
      {list.map((times, i) => (
        <div key={i} className="manual-hours-shift-row">
          <ClockPair
            times={times}
            disabled={disabled}
            ariaDay={ariaDay}
            label={list.length > 1 ? `T${i + 1}` : null}
            onPatch={(patch) => patchAt(i, patch)}
          />
          {list.length > 1 || !shiftIsEmpty(times) ? (
            <button
              type="button"
              className="secondary small manual-hours-remove"
              disabled={disabled}
              onClick={() => removeAt(i)}
              aria-label={`Quitar turno ${i + 1} del ${ariaDay}`}
            >
              Quitar
            </button>
          ) : null}
        </div>
      ))}
      <div className="manual-hours-day-actions">
        <button
          type="button"
          className="secondary small"
          disabled={disabled || list.length >= 4}
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            addShift()
          }}
        >
          + Añadir turno
        </button>
        {draftTotal > 0 ? (
          <span className="muted small">
            Suma turnos: <strong>{formatHoursMinutes(draftTotal)}</strong>
          </span>
        ) : null}
      </div>
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
  onChangeShifts,
}) {
  const fromPunches = useMemo(() => {
    const o = {}
    for (const iso of dayList) o[iso] = shiftTimesListFromPunches(punches, iso)
    return o
  }, [dayList, punches])

  const [draft, setDraft] = useState(fromPunches)
  /** Días con filas extra en edición (turno partido aún sin guardar). */
  const dirtyIsoRef = useRef(new Set())

  useEffect(() => {
    setDraft((prev) => {
      const next = { ...prev }
      for (const iso of dayList) {
        if (savingKey === iso) continue
        if (dirtyIsoRef.current.has(iso)) continue
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
    const timesList = draft[iso] ?? fromPunches[iso]
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
          <DayShiftEditor
            timesList={timesList}
            disabled={saving || !onChangeShifts}
            ariaDay={fmtDateEs(iso)}
            onDraftChange={(next) => {
              dirtyIsoRef.current.add(iso)
              setDraft((prev) => ({ ...prev, [iso]: next }))
            }}
            onPersist={(next) => {
              dirtyIsoRef.current.delete(iso)
              onChangeShifts?.(iso, next)
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

  async function handleSetShifts(worker, dayIso, timesList) {
    const key = worker.punchLookupEmail
    if (!key) {
      setHoursMsg({
        type: 'error',
        text: `Guarda primero a ${worker.nombre} en Celdas horario para poder meter horas.`,
      })
      return
    }
    if ((timesList ?? []).some(shiftIsPartial)) return

    const complete = (timesList ?? []).filter(shiftIsComplete)
    const had = shiftTimesListFromPunches(
      punchesForWorkerEntry(worker, punchByEmail),
      dayIso,
    ).filter(shiftIsComplete)

    if (complete.length === 0 && had.length === 0) return

    setSavingKey(`${worker.id}:${dayIso}`)
    setHoursMsg(null)
    const userId = await resolvePrimaryPunchUserId(key, eventWorkers)
    const result = await replaceManualShiftsForDay(
      supabase,
      userId,
      dayIso,
      complete,
    )
    setSavingKey(null)
    if (!result.ok) {
      setHoursMsg({
        type: 'error',
        text: `${worker.nombre}: ${friendlySupabaseError(result.error)}`,
      })
      return
    }
    const label =
      complete.length === 0
        ? 'sin turnos'
        : complete
            .map(
              (t) =>
                `${formatClock(t.inH, t.inM)} → ${formatClock(t.outH, t.outM)}`,
            )
            .join(' · ')
    const sumLabel =
      complete.length > 1 && result.hours
        ? ` (suma ${formatHoursMinutes(result.hours)})`
        : ''
    setHoursMsg({
      type: 'ok',
      text: `${worker.nombre} · ${fmtDateEs(dayIso)}: ${label}${sumLabel}`,
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
        En cada día puedes meter <strong>varios turnos</strong> (turno partido): pulsa{' '}
        <strong>+ Añadir turno</strong> y completa entrada/salida del 2º tramo. Se guarda
        al completar cada tramo; la columna resumen suma todas las horas del día. Si la
        salida es más temprano que la entrada (p. ej. 22:00 → 04:00), cuenta al día
        siguiente. Quitar o dejar vacío borra ese tramo.
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
                      <th>Turnos (entrada → salida)</th>
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
                        onChangeShifts={
                          worker.punchLookupEmail
                            ? (iso, timesList) =>
                                handleSetShifts(worker, iso, timesList)
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
