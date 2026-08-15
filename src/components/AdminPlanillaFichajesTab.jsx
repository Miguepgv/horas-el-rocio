import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { friendlySupabaseError } from '../lib/dbErrors.js'
import { resolvePrimaryPunchUserId } from '../lib/adminPlanillaPunches.js'
import AdminFichajesPaySummary from './AdminFichajesPaySummary.jsx'
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
  todayIsoLocal,
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

function cloneCompleteShifts(list) {
  return (list ?? [])
    .filter(shiftIsComplete)
    .map((t) => ({
      inH: t.inH,
      inM: t.inM ?? 0,
      outH: t.outH,
      outM: t.outM ?? 0,
    }))
}

function formatTimesListLabel(list) {
  const complete = cloneCompleteShifts(list)
  if (!complete.length) return 'sin turnos'
  return complete
    .map((t) => `${formatClock(t.inH, t.inM)} → ${formatClock(t.outH, t.outM)}`)
    .join(' · ')
}

function DayShiftEditor({
  timesList,
  disabled,
  ariaDay,
  onDraftChange,
  onPersist,
  onCopy,
  onPaste,
  canPaste,
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
  const canCopy = cloneCompleteShifts(list).length > 0

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
        <button
          type="button"
          className="secondary small"
          disabled={!canCopy}
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            onCopy?.(cloneCompleteShifts(list))
          }}
        >
          Copiar
        </button>
        <button
          type="button"
          className="secondary small"
          disabled={disabled || !canPaste}
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            onPaste?.()
          }}
        >
          Pegar
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
  clipboard,
  onCopyDay,
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
    const canPaste =
      Boolean(clipboard?.timesList?.length) && clipboard.dayIso === iso
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
            canPaste={canPaste && Boolean(onChangeShifts)}
            onCopy={(times) => onCopyDay?.(iso, times)}
            onPaste={() => {
              if (!clipboard?.timesList?.length) return
              const next = cloneCompleteShifts(clipboard.timesList)
              dirtyIsoRef.current.delete(iso)
              setDraft((prev) => ({ ...prev, [iso]: next }))
              onChangeShifts?.(iso, next)
            }}
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
  const [reportDate, setReportDate] = useState(todayIso)
  const [downloadBusy, setDownloadBusy] = useState(false)
  const [exportMsg, setExportMsg] = useState(null)
  const [savingKey, setSavingKey] = useState(null)
  const [hoursMsg, setHoursMsg] = useState(null)
  /** { dayIso, timesList, fromName, fromWorkerId } */
  const [clipboard, setClipboard] = useState(null)
  const [pasteTargetId, setPasteTargetId] = useState('')
  const [pasteBusy, setPasteBusy] = useState(false)

  useEffect(() => {
    if (!allDays.length) return
    if (!allDays.includes(reportDate)) {
      setReportDate(
        allDays.includes(todayIso) ? todayIso : allDays[allDays.length - 1],
      )
    }
  }, [allDays, reportDate, todayIso])

  /** Solo el día elegido (por defecto hoy). Otros días: desplegable. */
  const visibleDays = useMemo(() => {
    if (allDays.includes(reportDate)) return [reportDate]
    return reportDate ? [reportDate] : []
  }, [allDays, reportDate])

  const weekReportDays = useMemo(
    () =>
      weekReportDayRange(allDays, reportDate, {
        includeFuture: false,
      }),
    [allDays, reportDate],
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

  const daySelectOptions = useMemo(() => {
    const list = allDays.length ? [...allDays] : [todayIso]
    if (!list.includes(todayIso)) {
      // Hoy fuera del periodo: igual lo ofrecemos primero.
      list.unshift(todayIso)
    }
    return list
  }, [allDays, todayIso])

  function dayOptionLabel(iso) {
    const d = parseLocalDate(iso)
    const wd = weekdayMonSunFromDate(d)
    const base = `${weekdayShort(wd)} ${fmtDateEs(iso)}`
    if (iso === todayIso) return `Hoy · ${base}`
    if (iso < todayIso) return `Anterior · ${base}`
    return `Posterior · ${base}`
  }

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

  async function handleSetShifts(worker, dayIso, timesList, opts = {}) {
    const { silent = false } = opts
    const key = worker.punchLookupEmail
    if (!key) {
      if (!silent) {
        setHoursMsg({
          type: 'error',
          text: `Guarda primero a ${worker.nombre} en Celdas horario para poder meter horas.`,
        })
      }
      return { ok: false, skipped: true }
    }
    if ((timesList ?? []).some(shiftIsPartial)) return { ok: false }

    const complete = (timesList ?? []).filter(shiftIsComplete)
    const had = shiftTimesListFromPunches(
      punchesForWorkerEntry(worker, punchByEmail),
      dayIso,
    ).filter(shiftIsComplete)

    if (complete.length === 0 && had.length === 0) return { ok: true, skipped: true }

    setSavingKey(`${worker.id}:${dayIso}`)
    if (!silent) setHoursMsg(null)
    const userId = await resolvePrimaryPunchUserId(key, eventWorkers)
    const result = await replaceManualShiftsForDay(
      supabase,
      userId,
      dayIso,
      complete,
    )
    setSavingKey(null)
    if (!result.ok) {
      if (!silent) {
        setHoursMsg({
          type: 'error',
          text: `${worker.nombre}: ${friendlySupabaseError(result.error)}`,
        })
      }
      return { ok: false, error: result.error, worker }
    }
    if (!silent) {
      const label = formatTimesListLabel(complete)
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
    return { ok: true, worker }
  }

  function handleCopyDay(worker, dayIso, timesList) {
    const times = cloneCompleteShifts(timesList)
    if (!times.length) {
      setHoursMsg({
        type: 'error',
        text: 'No hay turnos completos para copiar en ese día.',
      })
      return
    }
    setClipboard({
      dayIso,
      timesList: times,
      fromName: worker.nombre,
      fromWorkerId: worker.id,
    })
    setPasteTargetId('')
    setHoursMsg({
      type: 'ok',
      text: `Copiado de ${worker.nombre} · ${fmtDateEs(dayIso)}: ${formatTimesListLabel(times)}`,
    })
  }

  async function pasteToWorkers(targets) {
    if (!clipboard?.timesList?.length) return
    const list = targets.filter((w) => w.punchLookupEmail)
    if (!list.length) {
      setHoursMsg({
        type: 'error',
        text: 'Ningún destinatario tiene correo en planilla para guardar turnos.',
      })
      return
    }
    setPasteBusy(true)
    setHoursMsg(null)
    let okCount = 0
    let failCount = 0
    for (const w of list) {
      const r = await handleSetShifts(
        w,
        clipboard.dayIso,
        cloneCompleteShifts(clipboard.timesList),
        { silent: true },
      )
      if (r?.ok && !r.skipped) okCount += 1
      else if (!r?.ok && !r?.skipped) failCount += 1
    }
    setPasteBusy(false)
    await onHoursSaved?.()
    setHoursMsg({
      type: failCount ? 'error' : 'ok',
      text: failCount
        ? `Pegado en ${okCount} persona(s); falló en ${failCount}.`
        : `Turnos pegados en ${okCount} persona(s) · ${fmtDateEs(clipboard.dayIso)}.`,
    })
  }

  async function handlePasteAll() {
    if (!clipboard) return
    const others = workers.filter(
      (w) => w.id !== clipboard.fromWorkerId && w.punchLookupEmail,
    )
    if (
      !window.confirm(
        `¿Pegar el turno de ${clipboard.fromName} (${fmtDateEs(clipboard.dayIso)}: ${formatTimesListLabel(clipboard.timesList)}) a ${others.length} trabajador(es)?`,
      )
    ) {
      return
    }
    await pasteToWorkers(others)
  }

  async function handlePasteOne() {
    if (!clipboard || !pasteTargetId) return
    const w = workers.find((x) => String(x.id) === String(pasteTargetId))
    if (!w) return
    await pasteToWorkers([w])
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
      <div className="day-view-toolbar card subpanel">
        <p className="label-up fichajes-day-picker-title">Día a editar</p>
        <div className="fichajes-day-chips" role="group" aria-label="Elegir día">
          {daySelectOptions.map((iso) => {
            const active = iso === reportDate
            const isToday = iso === todayIso
            return (
              <button
                key={iso}
                type="button"
                className={
                  active
                    ? 'fichajes-day-chip fichajes-day-chip--active'
                    : 'fichajes-day-chip'
                }
                aria-pressed={active}
                onClick={() => setReportDate(iso)}
              >
                {isToday ? (
                  <>
                    <strong>Hoy</strong>
                    <span className="fichajes-day-chip-sub">{fmtDateEs(iso)}</span>
                  </>
                ) : (
                  <>
                    <strong>{weekdayShort(weekdayMonSunFromDate(parseLocalDate(iso)))}</strong>
                    <span className="fichajes-day-chip-sub">{fmtDateEs(iso)}</span>
                    {iso < todayIso ? (
                      <span className="fichajes-day-chip-tag">anterior</span>
                    ) : (
                      <span className="fichajes-day-chip-tag">próximo</span>
                    )}
                  </>
                )}
              </button>
            )
          })}
        </div>
        <div className="day-view-toolbar-row fichajes-day-toolbar-extra">
          <label className="day-view-label fichajes-day-select-label">
            O elige en la lista
            <select
              className="table-input fichajes-day-select"
              value={reportDate}
              onChange={(e) => setReportDate(e.target.value)}
            >
              {daySelectOptions.map((iso) => (
                <option key={iso} value={iso}>
                  {dayOptionLabel(iso)}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="secondary"
            disabled={downloadBusy}
            onClick={handleDownloadDaily}
          >
            {downloadBusy ? 'Generando…' : 'Informe del día (Excel)'}
          </button>
          <button
            type="button"
            className="secondary"
            disabled={downloadBusy}
            onClick={handleDownloadWeekly}
          >
            {downloadBusy ? 'Generando…' : 'Informe semana (Excel)'}
          </button>
          {reportDate !== todayIso ? (
            <button
              type="button"
              className="secondary"
              onClick={() => setReportDate(todayIso)}
            >
              Volver a hoy
            </button>
          ) : null}
        </div>
        <p className="muted small day-view-toolbar-hint">
          Pulsa un día de arriba (p. ej. <strong>anterior</strong>) para ver y editar esos
          turnos. Por defecto estás en <strong>Hoy</strong>.
        </p>
      </div>
      {exportMsg ? (
        <p className={`hint ${exportMsg.type === 'error' ? 'error' : 'ok'}`}>
          {exportMsg.text}
        </p>
      ) : null}

      <p className="muted small admin-fichajes-hint">
        En cada día puedes meter <strong>varios turnos</strong> (turno partido): pulsa{' '}
        <strong>+ Añadir turno</strong>. Usa <strong>Copiar</strong> y luego{' '}
        <strong>Pegar</strong> en otra persona, o pega a todo el equipo / a alguien
        concreto con la barra de abajo. Se guarda al completar cada tramo.
      </p>
      {clipboard ? (
        <div className="card subpanel fichajes-clipboard-bar">
          <p className="muted small fichajes-clipboard-summary">
            Portapapeles:{' '}
            <strong>{clipboard.fromName}</strong> · {fmtDateEs(clipboard.dayIso)} ·{' '}
            {formatTimesListLabel(clipboard.timesList)}
          </p>
          <div className="fichajes-clipboard-actions">
            <button
              type="button"
              className="secondary"
              disabled={pasteBusy}
              onClick={handlePasteAll}
            >
              {pasteBusy ? 'Pegando…' : 'Pegar al resto del equipo'}
            </button>
            <label className="fichajes-clipboard-one">
              <span className="muted small">O a alguien:</span>
              <select
                className="table-input"
                value={pasteTargetId}
                disabled={pasteBusy}
                onChange={(e) => setPasteTargetId(e.target.value)}
              >
                <option value="">— Elegir persona —</option>
                {workers
                  .filter((w) => w.id !== clipboard.fromWorkerId)
                  .map((w) => (
                    <option key={w.id} value={String(w.id)}>
                      {w.nombre}
                      {!w.punchLookupEmail ? ' (sin correo)' : ''}
                    </option>
                  ))}
              </select>
              <button
                type="button"
                className="secondary"
                disabled={pasteBusy || !pasteTargetId}
                onClick={handlePasteOne}
              >
                Pegar
              </button>
            </label>
            <button
              type="button"
              className="secondary"
              disabled={pasteBusy}
              onClick={() => {
                setClipboard(null)
                setPasteTargetId('')
              }}
            >
              Limpiar
            </button>
          </div>
        </div>
      ) : null}
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
                        clipboard={clipboard}
                        onCopyDay={(iso, times) =>
                          handleCopyDay(worker, iso, times)
                        }
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
