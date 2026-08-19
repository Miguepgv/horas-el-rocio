import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import {
  friendlySupabaseError,
  isMissingColumnError,
  isMissingTableError,
} from '../lib/dbErrors.js'
import { fetchPunchesGroupedByPlanillaEmail } from '../lib/adminPlanillaPunches.js'
import {
  emptyRocioPlanillaPayload,
  ROCIO_PLANILLA_DAY_KEYS as DAY_KEYS,
  ROCIO_PLANILLA_EXTRA_KEYS as EXTRA_KEYS,
  ROCIO_PLANILLA_EXTRA_KEYS_UI as EXTRA_KEYS_UI,
  ROCIO_PLANILLA_EXTRA_LABELS,
  ROCIO_PLANILLA_EXTRA_TITLES,
} from '../lib/rocioPlanillaKeys.js'
import { parsePlanillaWideCsv } from '../lib/csvSchedule.js'
import { downloadPlanillaHorarioXlsx } from '../lib/exportScheduleXlsx.js'
import {
  partitionEventDays,
  planillaDayKeysForIndices,
  slotIndexForPlanillaDayKey,
  todayIsoLocal,
  visiblePlanillaDayIndices,
} from '../lib/feriaDayView.js'
import { eachPlanillaGridDateISO } from '../lib/rocioPlanillaSchedule.js'
import { planillaColumnHeader, planillaColumnTitle } from '../lib/planillaDayHeaders.js'
import AdminPlanillaFichajesTab from './AdminPlanillaFichajesTab.jsx'
import DayViewToolbar from './DayViewToolbar.jsx'
import PlanillaFichajesModal from './PlanillaFichajesModal.jsx'
import { AGOSTO_WORKER_NAMES } from '../data/agostoRoster.js'
import { PAY_EVENT_EL_ROCIO } from '../data/payRules.js'
import {
  workerRateProfile,
} from '../lib/elRocioRates.js'

function emptyRow() {
  return { ...emptyRocioPlanillaPayload(), id: null }
}

function parseEuroField(v) {
  const s = String(v ?? '').trim()
  if (s === '') return null
  const n = Number(s.replace(/\s/g, '').replace(',', '.'))
  if (!Number.isFinite(n)) return null
  return n
}

function rowPayload(row, includeRates) {
  const payload = {
    nombre: String(row.nombre ?? '').trim(),
    correo: String(row.correo ?? '').trim().toLowerCase() || null,
  }
  for (const k of DAY_KEYS) payload[k] = row[k] ?? ''
  for (const k of EXTRA_KEYS) payload[k] = parseEuroField(row[k])
  if (includeRates) {
    const rates = workerRateProfile(row)
    payload.tarifa_finde = rates.finde
    payload.tarifa_miercoles = rates.miercoles
  }
  return payload
}

function normalizePlanillaRow(r) {
  const o = { ...r }
  for (const k of EXTRA_KEYS) {
    const v = o[k]
    if (v == null || v === '') o[k] = ''
    else o[k] = String(v)
  }
  const rates = workerRateProfile(r)
  o.tarifa_finde = String(rates.finde)
  o.tarifa_miercoles = String(rates.miercoles)
  return o
}

function planillaCsvRowToPayload(rec) {
  return rowPayload(rec, true)
}

function planillaRowHasExtrasColumns(r) {
  return Boolean(r && Object.prototype.hasOwnProperty.call(r, 'nomina_event_euros'))
}

function planillaRowHasRateColumns(r) {
  return Boolean(r && Object.prototype.hasOwnProperty.call(r, 'tarifa_finde'))
}

export default function AdminPlanillaPanel() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const [emailOptions, setEmailOptions] = useState([])
  const [magicLoginEmails, setMagicLoginEmails] = useState([])
  const [loginEmailRecords, setLoginEmailRecords] = useState([])
  const [punchByEmail, setPunchByEmail] = useState({})
  const [eventWorkersCache, setEventWorkersCache] = useState([])
  const [punchModal, setPunchModal] = useState(null)
  const [adminSection, setAdminSection] = useState('celdas')
  const [showPastPlanillaDays, setShowPastPlanillaDays] = useState(true)
  const [showFuturePlanillaDays, setShowFuturePlanillaDays] = useState(true)
  const todayIso = todayIsoLocal()
  const planillaGridDays = useMemo(() => [...eachPlanillaGridDateISO()], [])
  const { past: pastPlanillaDays, future: futurePlanillaDays } = useMemo(
    () => partitionEventDays(planillaGridDays, todayIso),
    [planillaGridDays, todayIso],
  )
  const visiblePlanillaDayKeys = useMemo(() => {
    const indices = visiblePlanillaDayIndices(planillaGridDays, {
      showPast: showPastPlanillaDays,
      showFuture: showFuturePlanillaDays,
      todayIso,
    })
    return planillaDayKeysForIndices(indices)
  }, [planillaGridDays, showPastPlanillaDays, showFuturePlanillaDays, todayIso])
  const [importCsv, setImportCsv] = useState('')
  const [importBusy, setImportBusy] = useState(false)

  const refresh = useCallback(async (opts = {}) => {
    const { keepUserMessage = false, silent = false } = opts
    if (!silent) setLoading(true)
    if (!keepUserMessage) setMsg(null)
    const { data, error } = await supabase
      .from('rocio_horario_planilla')
      .select('*')
      .order('nombre', { ascending: true })
    setLoading(false)
    if (error) {
      setMsg({ type: 'error', text: friendlySupabaseError(error) })
      setRows([])
      return { planillaExtrasMissing: false }
    }
    const raw = data ?? []
    setRows(raw.map(normalizePlanillaRow))

    const emails = new Set()
    const magic = new Set()
    for (const r of raw) {
      const e = String(r.correo ?? '')
        .trim()
        .toLowerCase()
      if (e) emails.add(e)
    }
    const ew = await supabase.from('event_workers').select('email,auth_user_id')
    if (!ew.error) {
      for (const r of ew.data ?? []) {
        const e = String(r.email ?? '')
          .trim()
          .toLowerCase()
        if (e) emails.add(e)
      }
    }
    const log = await supabase
      .from('app_login_emails')
      .select('email,auth_user_id')
    if (!log.error) {
      setLoginEmailRecords(log.data ?? [])
      for (const r of log.data ?? []) {
        const e = String(r.email ?? '')
          .trim()
          .toLowerCase()
        if (e) {
          magic.add(e)
          emails.add(e)
        }
      }
    } else {
      setLoginEmailRecords([])
      if (!isMissingTableError(log.error)) {
        console.warn('app_login_emails:', log.error?.message ?? log.error)
      }
    }
    const magicSorted = [...magic].sort()
    setMagicLoginEmails(magicSorted)
    setEmailOptions([...emails].sort())
    setEventWorkersCache(ew.error ? [] : ew.data ?? [])
    let punchMap = {}
    try {
      punchMap = await fetchPunchesGroupedByPlanillaEmail(
        supabase,
        raw,
        ew.error ? [] : (ew.data ?? []),
        log.error ? [] : (log.data ?? []),
      )
    } catch (e) {
      console.warn('fichajes planilla:', e)
      setMsg({
        type: 'error',
        text: `No se pudieron cargar los fichajes: ${friendlySupabaseError(e)}`,
      })
    }
    setPunchByEmail(punchMap)

    const planillaExtrasMissing = Boolean(
      raw.length && !planillaRowHasExtrasColumns(raw[0]),
    )
    const planillaRatesMissing = Boolean(
      raw.length && !planillaRowHasRateColumns(raw[0]),
    )
    if (planillaExtrasMissing) {
      setMsg({
        type: 'error',
        text:
          'La tabla en Supabase no tiene las columnas de nómina/gasoil/incentivo. Ejecuta en el SQL Editor el archivo scripts/supabase_planilla_extras.sql (o el bloque ALTER de scripts/supabase_rocio_horario_tables.sql) y luego NOTIFY pgrst; recarga la app.',
      })
    } else if (planillaRatesMissing) {
      setMsg({
        type: 'error',
        text:
          'Faltan las columnas de tarifa en Supabase. Ejecuta scripts/supabase_planilla_tarifas.sql y recarga la app.',
      })
    }
    return { planillaExtrasMissing, planillaRatesMissing }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  function patchLocal(id, field, value) {
    setRows((list) =>
      list.map((r) => (r.id === id ? { ...r, [field]: value } : r)),
    )
  }

  function patchDraft(draftRow, patch) {
    setRows((list) =>
      list.map((r) => (r === draftRow ? { ...r, ...patch } : r)),
    )
  }

  async function persistOne(row, includeRates = true) {
    const payload = rowPayload(row, includeRates)
    if (!payload.nombre) {
      return { ok: false, error: 'El nombre no puede estar vacío.' }
    }
    let err
    let savedRows = null
    if (row.id) {
      ;({ data: savedRows, error: err } = await supabase
        .from('rocio_horario_planilla')
        .update(payload)
        .eq('id', row.id)
        .select('*'))
    } else {
      ;({ data: savedRows, error: err } = await supabase
        .from('rocio_horario_planilla')
        .insert(payload)
        .select('*'))
    }
    if (err && includeRates && isMissingColumnError(err)) {
      return persistOne(row, false)
    }
    if (err) return { ok: false, error: friendlySupabaseError(err) }
    return { ok: true, saved: savedRows?.[0], includeRates }
  }

  async function saveRow(row) {
    setBusy(true)
    setMsg(null)
    const result = await persistOne(row)
    setBusy(false)
    if (!result.ok) {
      setMsg({ type: 'error', text: result.error })
      return
    }
    const rmeta = await refresh({ keepUserMessage: true })
    if (!rmeta?.planillaExtrasMissing) {
      setMsg({
        type: 'ok',
        text: result.includeRates
          ? 'Guardado.'
          : 'Guardado (sin tarifas: ejecuta en Supabase scripts/supabase_planilla_tarifas.sql).',
      })
    }
  }

  async function saveAllRows() {
    const toSave = rows.filter((r) => String(r.nombre ?? '').trim())
    if (!toSave.length) {
      setMsg({ type: 'error', text: 'No hay filas con nombre para guardar.' })
      return
    }
    setBusy(true)
    setMsg(null)
    let ok = 0
    let ratesSkipped = false
    for (const row of toSave) {
      const result = await persistOne(row)
      if (!result.ok) {
        setBusy(false)
        setMsg({
          type: 'error',
          text: `Error al guardar «${String(row.nombre).trim()}»: ${result.error}. Se han guardado ${ok} fila(s) antes.`,
        })
        await refresh({ keepUserMessage: true })
        return
      }
      if (!result.includeRates) ratesSkipped = true
      ok += 1
    }
    setBusy(false)
    const rmeta = await refresh({ keepUserMessage: true })
    if (!rmeta?.planillaExtrasMissing) {
      setMsg({
        type: 'ok',
        text: ratesSkipped
          ? `Guardados ${ok} trabajadores (sin tarifas: ejecuta scripts/supabase_planilla_tarifas.sql).`
          : `Guardados ${ok} trabajadores.`,
      })
    }
  }

  async function deleteRow(row) {
    const nombre = String(row?.nombre ?? '').trim() || 'esta fila'
    if (
      !window.confirm(
        `¿Quitar a ${nombre} de la planilla? Luego puedes añadir otro con «+ Añadir trabajador».`,
      )
    )
      return
    if (!row?.id) {
      setRows((list) => list.filter((r) => r !== row))
      setMsg({ type: 'ok', text: `${nombre} quitado.` })
      return
    }
    setBusy(true)
    const { error } = await supabase
      .from('rocio_horario_planilla')
      .delete()
      .eq('id', row.id)
    setBusy(false)
    if (error) {
      setMsg({ type: 'error', text: friendlySupabaseError(error) })
      return
    }
    setMsg({ type: 'ok', text: `${nombre} quitado.` })
    refresh()
  }

  function addRow() {
    setRows((r) => [...r, { ...emptyRow(), id: null }])
  }

  async function replacePlanillaWithPayloads(payloads, okText) {
    setImportBusy(true)
    setMsg(null)
    const dummyId = '00000000-0000-0000-0000-000000000000'
    const { error: delErr } = await supabase
      .from('rocio_horario_planilla')
      .delete()
      .neq('id', dummyId)
    if (delErr) {
      setImportBusy(false)
      setMsg({ type: 'error', text: friendlySupabaseError(delErr) })
      return false
    }

    const chunk = 80
    for (let i = 0; i < payloads.length; i += chunk) {
      const batch = payloads.slice(i, i + chunk)
      const { error } = await supabase.from('rocio_horario_planilla').insert(batch)
      if (error) {
        setImportBusy(false)
        setMsg({ type: 'error', text: friendlySupabaseError(error) })
        await refresh()
        return false
      }
    }
    setImportBusy(false)
    setImportCsv('')
    setMsg({ type: 'ok', text: okText })
    refresh()
    return true
  }

  async function replacePlanillaFromCsv() {
    const text = importCsv.trim()
    if (!text) {
      setMsg({ type: 'error', text: 'Pega primero el CSV.' })
      return
    }
    const parsed = parsePlanillaWideCsv(text)
    const valid = parsed.filter((r) => String(r.nombre ?? '').trim())
    if (!valid.length) {
      setMsg({
        type: 'error',
        text:
          `No se ha reconocido ninguna fila válida. Usa nombre + ${DAY_KEYS.length} celdas de horario + correo, o cabeceras d01_a, d01_b, …`,
      })
      return
    }
    if (
      !window.confirm(
        `Se borrarán TODAS las filas actuales de la planilla (${rows.length}) y se cargarán ${valid.length} filas desde el CSV. ¿Continuar?`,
      )
    )
      return

    await replacePlanillaWithPayloads(
      valid.map(planillaCsvRowToPayload),
      `Planilla sustituida (${valid.length} filas).`,
    )
  }

  async function loadAgostoRoster() {
    if (
      !window.confirm(
        `Se borrarán TODAS las filas actuales (${rows.length}) y se cargarán ${AGOSTO_WORKER_NAMES.length} trabajadores (14–19 ago, horario a 0). ¿Continuar?`,
      )
    )
      return
    const payloads = AGOSTO_WORKER_NAMES.map((nombre) =>
      planillaCsvRowToPayload({ ...emptyRocioPlanillaPayload(), nombre }),
    )
    await replacePlanillaWithPayloads(
      payloads,
      `Listado cargado: ${payloads.length} trabajadores, horario a 0.`,
    )
  }

  const magicSet = useMemo(() => new Set(magicLoginEmails), [magicLoginEmails])
  const emailOptionsRest = useMemo(
    () => emailOptions.filter((e) => !magicSet.has(e)),
    [emailOptions, magicSet],
  )

  const headerDays = useMemo(
    () =>
      visiblePlanillaDayKeys.map((k) => {
        const idx = slotIndexForPlanillaDayKey(k)
        return (
          <th key={k} className="planilla-mini-th" title={planillaColumnTitle(idx)}>
            {planillaColumnHeader(idx)}
          </th>
        )
      }),
    [visiblePlanillaDayKeys],
  )

  return (
    <section className="card admin-card">
      <p className="label-up">Planilla y fichajes (Supabase)</p>
      <p className="muted small">
        {PAY_EVENT_EL_ROCIO.label} · {PAY_EVENT_EL_ROCIO.dateFrom} →{' '}
        {PAY_EVENT_EL_ROCIO.dateTo}
      </p>
      {msg && (
        <p className={`hint ${msg.type === 'error' ? 'error' : 'ok'}`}>{msg.text}</p>
      )}

      <div className="tabs-bar admin-planilla-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={adminSection === 'celdas'}
          className={adminSection === 'celdas' ? 'tab active' : 'tab'}
          onClick={() => setAdminSection('celdas')}
        >
          Celdas horario
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={adminSection === 'fichajes'}
          className={adminSection === 'fichajes' ? 'tab active' : 'tab'}
          onClick={() => setAdminSection('fichajes')}
        >
          Turnos picados
        </button>
      </div>

      {loading ? (
        <p className="muted">Cargando…</p>
      ) : adminSection === 'fichajes' ? (
        <AdminPlanillaFichajesTab
          rows={rows}
          eventWorkers={eventWorkersCache}
          loginEmailRecords={loginEmailRecords}
          punchByEmail={punchByEmail}
          onHoursSaved={() => refresh({ silent: true, keepUserMessage: true })}
        />
      ) : (
        <>
          <div className="planilla-save-all-bar">
            <button
              type="button"
              disabled={busy || importBusy || rows.length === 0}
              onClick={saveAllRows}
            >
              {busy ? 'Guardando…' : 'Guardar todos los cambios'}
            </button>
            <p className="muted small">
              Cambia nómina, gasoil e incentivo en todas las filas y pulsa este
              botón una vez.
            </p>
          </div>
          <div className="card subpanel planilla-import-block">
            <p className="label-up">Listado 14–19 agosto (horario a 0)</p>
            <p className="muted small">
              Carga los {AGOSTO_WORKER_NAMES.length} nombres con celdas vacías. No hace
              falta horario ni correo: las horas se eligen en{' '}
              <strong>Turnos picados</strong> (entrada y salida de cada día).
            </p>
            <p className="muted small">
              <strong>Tarifa (todos iguales):</strong> viernes a martes 12 €/h · miércoles
              15 €/h. Al guardar se aplican estas tarifas a toda la planilla.
            </p>
            <p className="muted small">
              <strong>Fijo:</strong> en <strong>Nómina €</strong> pon el sueldo que ya cobra
              por nómina (se resta del bruto de horas). Si trabaja de más, la diferencia
              sale en mano; si de menos, horas en mano = 0. <strong>Gasoil</strong> e{' '}
              <strong>Incentivo</strong> se suman al total.
            </p>
            <button
              type="button"
              className="secondary"
              disabled={busy || importBusy}
              onClick={loadAgostoRoster}
            >
              {importBusy
                ? 'Cargando…'
                : `Cargar ${AGOSTO_WORKER_NAMES.length} trabajadores (todo a 0)`}
            </button>
          </div>
          <div className="card subpanel planilla-import-block">
            <p className="label-up">Importar planilla (CSV ancha)</p>
            <textarea
              className="planilla-import-textarea"
              rows={5}
              placeholder="Pegar aquí el CSV…"
              value={importCsv}
              onChange={(e) => setImportCsv(e.target.value)}
              disabled={busy || importBusy}
            />
            <button
              type="button"
              className="secondary danger-text"
              disabled={busy || importBusy}
              onClick={replacePlanillaFromCsv}
            >
              {importBusy ? 'Importando…' : 'Sustituir planilla por este CSV'}
            </button>
          </div>
          <DayViewToolbar
            reportDate={todayIso}
            onReportDateChange={() => {}}
            minDate={planillaGridDays[0] ?? todayIso}
            maxDate={todayIso}
            showPastDays={showPastPlanillaDays}
            onTogglePast={() => setShowPastPlanillaDays((v) => !v)}
            pastCount={pastPlanillaDays.length}
            showFutureDays={showFuturePlanillaDays}
            onToggleFuture={() => setShowFuturePlanillaDays((v) => !v)}
            futureCount={futurePlanillaDays.length}
            onDownloadDaily={() => {}}
            showReportDownload={false}
            showWeekDownload={false}
          >
            <button
              type="button"
              className="secondary"
              disabled={busy || importBusy}
              onClick={async () => {
                try {
                  await downloadPlanillaHorarioXlsx(rows, {
                    dayKeys: visiblePlanillaDayKeys,
                  })
                } catch (e) {
                  setMsg({
                    type: 'error',
                    text: `No se pudo generar el Excel: ${e?.message ?? e}`,
                  })
                }
              }}
            >
              Excel (días visibles)
            </button>
          </DayViewToolbar>
          {visiblePlanillaDayKeys.length === 0 ? (
            <p className="muted small">Hoy no está en el calendario de la planilla.</p>
          ) : null}
          <div className="table-wrap planilla-admin-wrap">
            <table className="rules-table planilla-admin-table">
              <thead>
                <tr>
                  <th className="planilla-th-nombre">Nombre</th>
                  <th className="planilla-th-correo">Correo (enlace)</th>
                  {EXTRA_KEYS_UI.map((ek) => (
                    <th
                      key={ek}
                      className="planilla-th-euro"
                      title={ROCIO_PLANILLA_EXTRA_TITLES[ek]}
                    >
                      {ROCIO_PLANILLA_EXTRA_LABELS[ek] ?? ek}
                    </th>
                  ))}
                  {headerDays}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id ?? `draft-${row.nombre}`}>
                    <td className="planilla-td-nombre">
                      <input
                        className="table-input"
                        value={row.nombre ?? ''}
                        onChange={(e) =>
                          row.id
                            ? patchLocal(row.id, 'nombre', e.target.value)
                            : patchDraft(row, { nombre: e.target.value })
                        }
                      />
                      <div className="planilla-nombre-actions">
                        <button
                          type="button"
                          className="secondary btn-xs"
                          disabled={busy}
                          onClick={() => saveRow(row)}
                        >
                          Guardar
                        </button>
                        <button
                          type="button"
                          className="secondary btn-xs danger-text"
                          disabled={busy}
                          onClick={() => deleteRow(row)}
                        >
                          Quitar
                        </button>
                      </div>
                    </td>
                    <td className="planilla-td-correo">
                      <div className="planilla-email-stack">
                        <select
                          className="table-input planilla-email-select"
                          value={
                            emailOptions.includes(String(row.correo ?? '').toLowerCase())
                              ? String(row.correo ?? '').toLowerCase()
                              : '__custom__'
                          }
                          onChange={(e) => {
                            const v = e.target.value
                            if (v === '__custom__') return
                            row.id
                              ? patchLocal(row.id, 'correo', v)
                              : patchDraft(row, { correo: v })
                          }}
                        >
                          <option value="">— Sin correo —</option>
                          {magicLoginEmails.length > 0 ? (
                            <optgroup label="Han entrado (enlace / WhatsApp)">
                              {magicLoginEmails.map((emOpt) => (
                                <option key={`m-${emOpt}`} value={emOpt}>
                                  {emOpt}
                                </option>
                              ))}
                            </optgroup>
                          ) : null}
                          {emailOptionsRest.length > 0 ? (
                            <optgroup label="Ya en planilla o plantilla">
                              {emailOptionsRest.map((emOpt) => (
                                <option key={emOpt} value={emOpt}>
                                  {emOpt}
                                </option>
                              ))}
                            </optgroup>
                          ) : null}
                          <option value="__custom__">Escribir otro…</option>
                        </select>
                        <input
                          className="table-input planilla-email-free"
                          placeholder="correo@…"
                          value={row.correo ?? ''}
                          onChange={(e) =>
                            row.id
                              ? patchLocal(row.id, 'correo', e.target.value)
                              : patchDraft(row, { correo: e.target.value })
                          }
                        />
                      </div>
                    </td>
                    {EXTRA_KEYS_UI.map((ek) => (
                      <td key={ek} className="planilla-td-euro">
                        <input
                          className="table-input planilla-euro-input"
                          inputMode="decimal"
                          placeholder="—"
                          value={
                            row[ek] != null && row[ek] !== ''
                              ? String(row[ek])
                              : ''
                          }
                          onChange={(e) =>
                            row.id
                              ? patchLocal(row.id, ek, e.target.value)
                              : patchDraft(row, { [ek]: e.target.value })
                          }
                        />
                      </td>
                    ))}
                    {visiblePlanillaDayKeys.map((k) => (
                      <td key={k} className="planilla-td-slot">
                        <input
                          className="table-input planilla-cell"
                          title={
                            String(k).endsWith('_b')
                              ? '2º turno del día (turno partido). Ej: 17:00 A 22:00'
                              : '1º turno del día. Ej: 09:00 A 14:00. Vacío o D = descanso'
                          }
                          placeholder={
                            String(k).endsWith('_b')
                              ? '17:00 A 22:00'
                              : '09:00 A 14:00'
                          }
                          value={row[k] ?? ''}
                          onChange={(e) =>
                            row.id
                              ? patchLocal(row.id, k, e.target.value)
                              : patchDraft(row, { [k]: e.target.value })
                          }
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="planilla-save-all-bar">
            <button type="button" className="secondary" disabled={busy} onClick={addRow}>
              + Añadir trabajador
            </button>
            <button type="button" disabled={busy || importBusy} onClick={saveAllRows}>
              {busy ? 'Guardando…' : 'Guardar todos'}
            </button>
          </div>
          <p className="muted small">
            Si alguien no viene: <strong>Quitar</strong> (junto al nombre) y luego{' '}
            <strong>+ Añadir trabajador</strong> con el sustituto. También puedes cambiar
            solo el nombre. Al final pulsa <strong>Guardar todos</strong>.
          </p>
          <p className="muted small">
            <strong>Turno partido:</strong> escribe el 1º tramo en la columna del día
            (p. ej. <code>09:00 A 14:00</code>) y el 2º en la columna «· 2º» (p. ej.{' '}
            <code>17:00 A 22:00</code>). En Turnos picados la suma del día suma ambos
            tramos.
          </p>
        </>
      )}

      <PlanillaFichajesModal
        open={Boolean(punchModal)}
        onClose={() => setPunchModal(null)}
        nombre={punchModal?.nombre ?? ''}
        email={punchModal?.email ?? ''}
        punches={punchModal ? punchByEmail[punchModal.email] ?? [] : []}
        eventWorkers={eventWorkersCache}
        onSaved={refresh}
      />
    </section>
  )
}
