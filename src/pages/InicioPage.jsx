import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import BrandLogo from '../components/BrandLogo.jsx'
import FichadoShiftRows from '../components/FichadoShiftRows.jsx'
import ManageAdminsModal from '../components/ManageAdminsModal.jsx'
import InstallAppHint from '../components/InstallAppHint.jsx'
import { APP_SCREEN_TITLE } from '../lib/brand.js'
import { supabase } from '../lib/supabase'
import { resolveAdminAccess } from '../lib/admin.js'
import { PAY_EVENT_EL_ROCIO } from '../data/payRules.js'
import {
  buildDailySummary,
  fixedWorkerExtras,
  formatDateLocalISO,
  formatHoursMinutes,
  parseLocalDate,
  paidEurosOverlappingDay,
  displayShiftsForDay,
  paidShiftsOverlappingDay,
  punchesForCalendarDay,
  weekdayMonSunFromDate,
  weekdayShort,
  workedHoursForDay,
  workedNoPayHoursOverlappingDay,
  workedPaidHoursOverlappingDay,
} from '../lib/payCompute.js'
import {
  friendlySupabaseError,
  isMissingTableError,
} from '../lib/dbErrors.js'
import {
  eachPlanillaGridDateISO,
  planillaRowToSlots,
} from '../lib/rocioPlanillaSchedule.js'
import { downloadMiHorarioXlsx } from '../lib/exportScheduleXlsx.js'
import {
  buildDailyReportRows,
  downloadDailyShiftsReportXlsx,
} from '../lib/exportDailyShiftsXlsx.js'
import {
  isTodayIso,
  todayIsoLocal,
  visibleWorkerWeekDays,
} from '../lib/feriaDayView.js'
import { escapeForILikeExact } from '../lib/emailMatch.js'
import { sessionIsInsecure } from '../lib/insecureLogin.js'
import { fetchWorkerPunchesForSession } from '../lib/workerPunches.js'

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

function formatFichadoPlainForExport(punches, iso) {
  const shifts = displayShiftsForDay(punches, iso)
  const hPaid = workedPaidHoursOverlappingDay(punches, iso)
  const hNp = workedNoPayHoursOverlappingDay(punches, iso)
  const ePaid = paidEurosOverlappingDay(punches, iso)
  const avgRate = hPaid > 0 ? ePaid / hPaid : null
  const hoursLegacy = workedHoursForDay(punches, iso)
  const d = parseLocalDate(iso)
  const startDay = new Date()
  startDay.setHours(0, 0, 0, 0)
  const past = d < startDay

  if (shifts.length > 0) {
    const lines = shifts.map((seg) =>
      seg.open
        ? `Entrada ${fmtClock(seg.inAt.toISOString())} (sin salida aún)`
        : `Entrada ${fmtClock(seg.inAt.toISOString())} → Salida ${fmtClock(seg.outAt.toISOString())} (${formatHoursMinutes(seg.hoursOnDay)})`,
    )
    let footer = `Total día (cobro): ${formatHoursMinutes(hPaid)}`
    if (ePaid > 0) footer += ` · ${ePaid.toFixed(2)} €`
    if (hPaid > 0 && avgRate != null) footer += ` (~${avgRate.toFixed(2)} €/h med.)`
    lines.push(footer)
    if (hNp > 0) lines.push(`Sin cobro: ${formatHoursMinutes(hNp)}`)
    return lines.join('\n')
  }
  if (hNp > 0) return `${formatHoursMinutes(hNp)} sin cobro`
  if (hPaid + hNp > 0) {
    if (hPaid > 0) {
      let s = `${formatHoursMinutes(hPaid)} cobro`
      if (avgRate != null) s += ` (~${avgRate.toFixed(2)} €/h)`
      return s
    }
    return ''
  }
  if (hoursLegacy > 0) return `${formatHoursMinutes(hoursLegacy)} (detalle)`
  if (past) return 'Sin fichajes'
  return '—'
}

export default function InicioPage({ session, onSignOut }) {
  const uid = session?.user?.id
  const email = session?.user?.email ?? ''

  const [gate, setGate] = useState({
    isAdmin: false,
    isSuper: false,
    loaded: false,
  })
  const [gearOpen, setGearOpen] = useState(false)

  const [profile, setProfile] = useState(null)
  const [punches, setPunches] = useState([])
  const [scheduleSlots, setScheduleSlots] = useState([])
  const [eventWorker, setEventWorker] = useState(null)
  const [tab, setTab] = useState('horario')
  const [reportDate, setReportDate] = useState(() => todayIsoLocal())
  const [dailyExportBusy, setDailyExportBusy] = useState(false)
  const todayIso = todayIsoLocal()
  const [punchMsg, setPunchMsg] = useState(null)
  const [loadingData, setLoadingData] = useState(true)
  const [horarioBanner, setHorarioBanner] = useState(null)
  const [planillaExtrasRow, setPlanillaExtrasRow] = useState(null)

  useEffect(() => {
    let cancelled = false
    async function run() {
      const r = await resolveAdminAccess(supabase, session)
      if (!cancelled) setGate({ ...r, loaded: true })
    }
    run()
    return () => {
      cancelled = true
    }
  }, [session])

  useEffect(() => {
    let cancelled = false
    async function avisos() {
      const ack = localStorage.getItem('horario_avisos_ack_ts') ?? ''
      const em = email.trim().toLowerCase()
      if (!em) return
      const { data, error } = await supabase
        .from('horario_avisos')
        .select('id,mensaje,para_email,created_at')
        .or(`para_email.is.null,para_email.eq.${em}`)
        .order('created_at', { ascending: false })
        .limit(8)
      if (cancelled) return
      if (error) return
      const unseen = (data ?? []).filter(
        (r) => !ack || String(r.created_at) > ack,
      )
      if (unseen.length) {
        const last = unseen[0]
        setHorarioBanner({
          id: last.id,
          text: last.mensaje,
          createdAt: last.created_at,
        })
      } else setHorarioBanner(null)
    }
    avisos()
    return () => {
      cancelled = true
    }
  }, [email])

  async function reloadData() {
    if (!uid) return
    setLoadingData(true)
    setPunchMsg(null)
    const emailLower = email.trim().toLowerCase()
    const emailPattern = escapeForILikeExact(emailLower)

    let pu = { data: [], error: null }
    try {
      const punchList = await fetchWorkerPunchesForSession(supabase, session)
      pu = { data: punchList, error: null }
    } catch (e) {
      pu = { data: [], error: e }
    }

    const pr = await supabase
      .from('worker_profiles')
      .select('*')
      .eq('user_id', uid)
      .maybeSingle()

    const [ewUid, ewMail] = await Promise.all([
      supabase
        .from('event_workers')
        .select('id,full_name,email,auth_user_id')
        .eq('auth_user_id', uid)
        .limit(1),
      supabase
        .from('event_workers')
        .select('id,full_name,email,auth_user_id')
        .ilike('email', emailPattern)
        .limit(1),
    ])

    const ewRow = ewUid.data?.[0] ?? ewMail.data?.[0]
    let ewErr = null
    if (!ewRow) {
      if (ewUid.error && !isMissingTableError(ewUid.error)) ewErr = ewUid.error
      else if (ewMail.error && !isMissingTableError(ewMail.error)) ewErr = ewMail.error
    }
    const ewRes = {
      data: ewRow ? [ewRow] : [],
      error: ewErr,
    }

    let slots = []
    let planillaRow = null

    const plEmail = await supabase
      .from('rocio_horario_planilla')
      .select('*')
      .ilike('correo', emailPattern)
      .limit(1)
      .maybeSingle()

    if (plEmail.data) {
      planillaRow = plEmail.data
    }

    let plNameError = null
    if (!planillaRow && ewRow?.full_name && !ewRes.error) {
      const plName = await supabase
        .from('rocio_horario_planilla')
        .select('*')
        .eq('nombre', ewRow.full_name.trim())
        .maybeSingle()
      plNameError = plName.error
      if (!plName.error && plName.data) {
        planillaRow = plName.data
      }
    }

    if (planillaRow) {
      slots = planillaRowToSlots(planillaRow, ewRow?.id ?? null)
    } else if (ewRow?.id && !ewRes.error) {
      const sl = await supabase
        .from('event_schedule_slots')
        .select('*')
        .eq('worker_id', ewRow.id)
      if (!sl.error) slots = sl.data ?? []
    }

    const errs = []
    if (pu.error) errs.push(pu.error)
    if (pr.error && !isMissingTableError(pr.error)) errs.push(pr.error)
    if (ewRes.error && !isMissingTableError(ewRes.error))
      errs.push(ewRes.error)
    if (plEmail.error && !isMissingTableError(plEmail.error))
      errs.push(plEmail.error)
    if (plNameError && !isMissingTableError(plNameError))
      errs.push(plNameError)

    if (errs.length) {
      setPunchMsg({
        type: 'error',
        text: friendlySupabaseError(errs[0]),
      })
    }

    let prof = pr.data
    const insecure = sessionIsInsecure(session)
    if (
      !insecure &&
      !pr.error &&
      !prof &&
      !isMissingTableError(pr.error)
    ) {
      const ins = await supabase.from('worker_profiles').insert({ user_id: uid })
      if (!ins.error) {
        const again = await supabase
          .from('worker_profiles')
          .select('*')
          .eq('user_id', uid)
          .maybeSingle()
        prof = again.data
      }
    } else if (isMissingTableError(pr.error)) {
      prof = null
    }

    const effWorker =
      ewRow ??
      (planillaRow
        ? {
            id: null,
            full_name: String(planillaRow.nombre ?? '').trim(),
            email:
              String(planillaRow.correo ?? '')
                .trim()
                .toLowerCase() || emailLower,
            auth_user_id: uid,
          }
        : null)

    setProfile(prof ?? null)
    setPunches(pu.data ?? [])
    setEventWorker(effWorker)
    setScheduleSlots(slots)
    setPlanillaExtrasRow(planillaRow ?? null)
    setLoadingData(false)
  }

  useEffect(() => {
    reloadData()
  }, [uid])

  const slotsToday = useMemo(
    () =>
      scheduleSlots
        .filter((s) => s.work_date === todayIso)
        .sort((a, b) => a.slot_index - b.slot_index),
    [scheduleSlots, todayIso],
  )

  function slotsForDate(iso) {
    return scheduleSlots
      .filter((s) => s.work_date === iso)
      .sort((a, b) => a.slot_index - b.slot_index)
  }

  const lastPunch = useMemo(() => {
    if (!punches.length) return null
    const sorted = punches.slice().sort(
      (a, b) => new Date(b.punched_at) - new Date(a.punched_at),
    )
    return sorted[0]
  }, [punches])

  const punchChains = useMemo(() => {
    const sortF = (a, b) =>
      new Date(a.punched_at).getTime() - new Date(b.punched_at).getTime()
    const paid = punches.filter((p) => !p.no_pay).sort(sortF)
    function openIn(list) {
      let o = false
      for (const p of list) {
        if (p.punch_type === 'in') o = true
        else if (p.punch_type === 'out') o = false
      }
      return o
    }
    return { openPaidIn: openIn(paid) }
  }, [punches])

  const profileForPay = useMemo(() => {
    const pl = planillaExtrasRow
    const base = profile ? { ...profile } : {}
    function mergeEuro(plVal, profKey) {
      if (plVal != null && String(plVal).trim() !== '') {
        const n = Number(String(plVal).replace(/\s/g, '').replace(',', '.'))
        if (Number.isFinite(n)) return n
      }
      return Number(base[profKey] ?? 0) || 0
    }
    const payroll = mergeEuro(pl?.nomina_event_euros, 'payroll_event_euros')
    const gasoil = mergeEuro(pl?.gasoil_euros, 'gasoil_euros')
    const parking = mergeEuro(pl?.parking_euros, 'parking_euros')
    return {
      ...base,
      payroll_event_euros: payroll,
      gasoil_euros: gasoil,
      parking_euros: parking,
      is_fixed: Boolean(base.is_fixed) || payroll > 0,
    }
  }, [profile, planillaExtrasRow])

  const summary = useMemo(() => buildDailySummary(punches), [punches])
  const extras = useMemo(
    () => fixedWorkerExtras(profileForPay, summary.totalGross),
    [profileForPay, summary.totalGross],
  )
  const showMoneyExtras = useMemo(
    () => extras.payrollIncluded > 0 || summary.totalGross > 0,
    [extras.payrollIncluded, summary.totalGross],
  )

  async function punch(kind, { noPay = false } = {}) {
    if (!uid) return
    setPunchMsg(null)
    const row = {
      user_id: uid,
      punch_type: kind,
      punched_at: new Date().toISOString(),
      created_by: null,
      no_pay: noPay,
    }
    const { error } = await supabase.from('punches').insert(row)
    if (error) {
      setPunchMsg({ type: 'error', text: friendlySupabaseError(error) })
      return
    }
    await reloadData()
  }

  const scheduleTableDays = useMemo(() => [...eachPlanillaGridDateISO()], [])
  const workerWeekDays = useMemo(
    () => visibleWorkerWeekDays(scheduleTableDays),
    [scheduleTableDays],
  )

  const horarioXlsxRows = useMemo(() => {
    return workerWeekDays.map((iso) => {
      const d = parseLocalDate(iso)
      const wd = weekdayMonSunFromDate(d)
      const dia = `${weekdayShort(wd)} ${fmtDateEs(iso)}`
      const slotList = scheduleSlots
        .filter((s) => s.work_date === iso)
        .sort((a, b) => a.slot_index - b.slot_index)
      let previsto = '—'
      if (slotList.length > 0) {
        previsto = slotList
          .map((sl) => {
            if (sl.is_rest) return `Turno ${sl.slot_index}: Descanso`
            const st = sl.start_time ? String(sl.start_time).slice(0, 5) : '—'
            const en = sl.end_time ? String(sl.end_time).slice(0, 5) : '—'
            let line = `Turno ${sl.slot_index}: Entrada ${st} → Salida ${en}`
            if (sl.crosses_midnight) line += ' (+1 día)'
            return line
          })
          .join('\n')
      }
      const fichado = formatFichadoPlainForExport(punches, iso)
      return { dia, previsto, fichado }
    })
  }, [workerWeekDays, scheduleSlots, punches])

  const downloadHorarioXlsx = useCallback(async () => {
    setPunchMsg(null)
    try {
      await downloadMiHorarioXlsx({
        appTitle: APP_SCREEN_TITLE,
        workerLine: eventWorker?.full_name
          ? `${eventWorker.full_name} · ${email}`
          : email,
        rows: horarioXlsxRows,
      })
    } catch (e) {
      setPunchMsg({
        type: 'error',
        text: `No se pudo descargar el Excel: ${e?.message ?? e}`,
      })
    }
  }, [email, eventWorker, horarioXlsxRows])

  const downloadDailyReport = useCallback(async () => {
    setPunchMsg(null)
    setDailyExportBusy(true)
    try {
      const em = email.trim().toLowerCase()
      const nombre = eventWorker?.full_name?.trim() || em
      const reportRows = buildDailyReportRows(
        [{ nombre, correo: em, punchLookupEmail: em }],
        { [em]: punches },
        reportDate,
        {
          paidShiftsFn: paidShiftsOverlappingDay,
          hoursFn: workedPaidHoursOverlappingDay,
          eurosFn: paidEurosOverlappingDay,
          punchesForWorker: (_w, map) => map[em] ?? [],
        },
      )
      await downloadDailyShiftsReportXlsx({
        reportDateIso: reportDate,
        title: 'Mi informe diario de turnos',
        rows: reportRows,
      })
      setPunchMsg({ type: 'ok', text: 'Informe del día descargado.' })
    } catch (e) {
      setPunchMsg({
        type: 'error',
        text: `No se pudo generar el informe: ${e?.message ?? e}`,
      })
    }
    setDailyExportBusy(false)
  }, [email, eventWorker, punches, reportDate])

  const summaryRowsVisible = useMemo(
    () =>
      summary.rows.filter((r) =>
        workerWeekDays.includes(r.dateIso),
      ),
    [summary.rows, workerWeekDays],
  )

  function dismissHorarioAviso() {
    if (horarioBanner?.createdAt) {
      localStorage.setItem(
        'horario_avisos_ack_ts',
        String(horarioBanner.createdAt),
      )
    }
    setHorarioBanner(null)
  }

  const todayPunches = useMemo(() => {
    return punches
      .filter((p) => formatDateLocalISO(new Date(p.punched_at)) === todayIso)
      .slice()
      .sort((a, b) => new Date(a.punched_at) - new Date(b.punched_at))
  }, [punches, todayIso])

  return (
    <div className="shell wide">
      <header className="header row header-brand">
        <div className="header-brand-left">
          <BrandLogo className="brand-logo-sm" />
          <div>
            <h1>{APP_SCREEN_TITLE}</h1>
            <p className="muted">{PAY_EVENT_EL_ROCIO.label}</p>
          </div>
        </div>
        <div className="header-actions">
          {gate.loaded && gate.isSuper && (
            <button
              type="button"
              className="icon-gear"
              title="Gestionar administradores"
              aria-label="Gestionar administradores"
              onClick={() => setGearOpen(true)}
            >
              ⚙
            </button>
          )}
          {gate.loaded && gate.isAdmin && (
            <Link to="/admin" className="link-btn subtle">
              Administración
            </Link>
          )}
          <button type="button" className="secondary btn-inline" onClick={onSignOut}>
            Cerrar sesión
          </button>
        </div>
      </header>

      <ManageAdminsModal open={gearOpen} onClose={() => setGearOpen(false)} />

      <p className="muted small session-email">
        Sesión: <strong>{email}</strong>
        {eventWorker?.full_name ? (
          <>
            {' '}
            · <strong>{eventWorker.full_name}</strong>
          </>
        ) : null}
      </p>

      <InstallAppHint />

      {horarioBanner ? (
        <div className="banner horario-aviso-banner" role="status">
          <p>
            <strong>Aviso:</strong> {horarioBanner.text}
          </p>
          <button type="button" className="secondary btn-xs" onClick={dismissHorarioAviso}>
            Entendido
          </button>
        </div>
      ) : null}

      {!loadingData && !eventWorker && (
        <p className="banner roster-hint">
          No hay planilla para <strong>{email}</strong>. Consulta a tu encargado.
        </p>
      )}

      <section className="card punch-card">
        <p className="label-up">Hoy ({fmtDateEs(todayIso)})</p>
        <div className="today-sched">
          <div>
            <span className="muted small">Horario previsto</span>
            <p className="today-sched-line schedule-split">
              {slotsToday.length > 0 ? (
                slotsToday.map((sl) => (
                  <span
                    key={sl.id ?? `${sl.work_date}-${sl.slot_index}`}
                    className="planned-slot-block"
                  >
                    <span className="muted small">Turno {sl.slot_index}</span>{' '}
                    {sl.is_rest ? (
                      <span className="muted">Descanso</span>
                    ) : (
                      <>
                        <span className="badge-sched-in badge-h-prev-in">Entrada</span>{' '}
                        <span className="time-strong time-h-prev-in">
                          {sl.start_time
                            ? String(sl.start_time).slice(0, 5)
                            : '—'}
                        </span>
                        <span className="schedule-arrow">→</span>
                        <span className="badge-sched-out badge-h-prev-out">Salida</span>{' '}
                        <span className="time-strong time-h-prev-out">
                          {sl.end_time ? String(sl.end_time).slice(0, 5) : '—'}
                        </span>
                        {sl.crosses_midnight ? (
                          <span className="muted small"> (+1 día)</span>
                        ) : null}
                      </>
                    )}
                  </span>
                ))
              ) : (
                'Sin horario cargado.'
              )}
            </p>
          </div>
          <div>
            <span className="muted small">Último fichaje</span>
            <p className="today-sched-line">
              {lastPunch ? (
                <>
                  {lastPunch.punch_type === 'in' ? (
                    <span className="badge-in badge-fich-in">Entrada</span>
                  ) : (
                    <span className="badge-out badge-fich-out">Salida</span>
                  )}{' '}
                  ·{' '}
                  <strong>{fmtClock(lastPunch.punched_at)}</strong>
                  {lastPunch.no_pay ? (
                    <span className="muted small"> (sin cobro)</span>
                  ) : null}
                </>
              ) : (
                '—'
              )}
            </p>
          </div>
        </div>

        {todayPunches.length > 0 && (
          <ul className="punch-today-list" aria-label="Fichajes de hoy">
            {todayPunches.map((p) => (
              <li key={p.id}>
                {p.punch_type === 'in' ? (
                  <span className={`badge-in ${p.no_pay ? 'badge-np' : 'badge-fich-in'}`}>
                    Entrada
                  </span>
                ) : (
                  <span className={`badge-out ${p.no_pay ? 'badge-np' : 'badge-fich-out'}`}>
                    Salida
                  </span>
                )}{' '}
                <span className="time-strong">{fmtClock(p.punched_at)}</span>
              </li>
            ))}
          </ul>
        )}

        <div className="punch-actions punch-actions-grid">
          <button
            type="button"
            className="btn-punch btn-in"
            disabled={loadingData || punchChains.openPaidIn}
            onClick={() => punch('in', { noPay: false })}
          >
            Fichar entrada
          </button>
          <button
            type="button"
            className="btn-punch btn-out"
            disabled={loadingData || !punchChains.openPaidIn}
            onClick={() => punch('out', { noPay: false })}
          >
            Fichar salida
          </button>
        </div>
        {punchMsg && (
          <p className={`hint ${punchMsg.type === 'error' ? 'error' : 'ok'}`}>
            {punchMsg.text}
          </p>
        )}
      </section>

      <section className="card tabs-card">
        <div className="tabs-bar" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'horario'}
            className={tab === 'horario' ? 'tab active' : 'tab'}
            onClick={() => setTab('horario')}
          >
            Mi horario
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'resumen'}
            className={tab === 'resumen' ? 'tab active' : 'tab'}
            onClick={() => setTab('resumen')}
          >
            Resumen cobro
          </button>
        </div>

        {tab === 'horario' && (
          <div className="tab-panel">
            <div className="worker-horario-toolbar card subpanel">
              <p className="muted small worker-week-hint">
                Tu semana completa de la feria (previsto y fichado).
              </p>
              <div className="day-view-toolbar-row">
                <label className="day-view-label">
                  Informe de un día
                  <input
                    type="date"
                    className="table-input day-view-date-input"
                    value={reportDate}
                    min={scheduleTableDays[0] ?? todayIso}
                    max={scheduleTableDays[scheduleTableDays.length - 1] ?? todayIso}
                    onChange={(e) => setReportDate(e.target.value)}
                  />
                </label>
                <button
                  type="button"
                  className="secondary"
                  disabled={loadingData || dailyExportBusy}
                  onClick={downloadDailyReport}
                >
                  {dailyExportBusy ? 'Generando…' : 'Informe del día (Excel)'}
                </button>
                <button
                  type="button"
                  className="secondary"
                  disabled={loadingData}
                  onClick={downloadHorarioXlsx}
                >
                  Semana completa (Excel)
                </button>
              </div>
            </div>
            <div className="table-wrap horario-scroll-wrap">
              <table className="rules-table schedule-table horario-sticky-table">
                <thead>
                  <tr>
                    <th className="horario-sticky-day">Día</th>
                    <th>Previsto</th>
                    <th>Fichado</th>
                  </tr>
                </thead>
                <tbody>
                  {workerWeekDays.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="muted">
                        Sin días de feria en tu planilla.
                      </td>
                    </tr>
                  ) : null}
                  {workerWeekDays.map((iso) => {
                    const d = parseLocalDate(iso)
                    const wd = weekdayMonSunFromDate(d)
                    const slotList = slotsForDate(iso)
                    const todayRow = isTodayIso(iso, todayIso)
                    const planned =
                      slotList.length > 0 ? (
                        <div className="planned-stack">
                          {slotList.map((sl) => (
                            <div
                              key={sl.id ?? `${iso}-${sl.slot_index}`}
                              className="planned-slot-row"
                            >
                              <span className="muted small">T{sl.slot_index}</span>{' '}
                              {sl.is_rest ? (
                                <span className="muted">Descanso</span>
                              ) : (
                                <>
                                  <span className="badge-sched-in badge-h-prev-in">E</span>{' '}
                                  <span className="time-h-prev-in">
                                  {sl.start_time
                                    ? String(sl.start_time).slice(0, 5)
                                    : '—'}
                                  </span>
                                  <span className="schedule-arrow muted">→</span>{' '}
                                  <span className="badge-sched-out badge-h-prev-out">S</span>{' '}
                                  <span className="time-h-prev-out">
                                  {sl.end_time
                                    ? String(sl.end_time).slice(0, 5)
                                    : '—'}
                                  </span>
                                  {sl.crosses_midnight ? (
                                    <span className="muted small"> (+1)</span>
                                  ) : null}
                                </>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : (
                        '—'
                      )
                    const shifts = displayShiftsForDay(punches, iso)
                    const dayRawPunches = punchesForCalendarDay(punches, iso)
                    const hPaid = workedPaidHoursOverlappingDay(punches, iso)
                    const hNp = workedNoPayHoursOverlappingDay(punches, iso)
                    const ePaid = paidEurosOverlappingDay(punches, iso)
                    const avgRate = hPaid > 0 ? ePaid / hPaid : null
                    const hoursLegacy = workedHoursForDay(punches, iso)
                    const startDay = new Date()
                    startDay.setHours(0, 0, 0, 0)
                    const past = d < startDay

                    const fichadoCell =
                      shifts.length > 0 ? (
                        <div className="fichado-stack">
                          <FichadoShiftRows shifts={shifts} />
                          <div className="fichado-day-footer muted small">
                            {hPaid > 0 ? (
                              <>
                                Total día (cobro):{' '}
                                <strong>{formatHoursMinutes(hPaid)}</strong>
                                {ePaid > 0 ? (
                                  <>
                                    {' '}
                                    · <strong>{ePaid.toFixed(2)} €</strong>
                                  </>
                                ) : null}
                                {avgRate != null ? (
                                  <> (~{avgRate.toFixed(2)} €/h med.)</>
                                ) : null}
                              </>
                            ) : shifts.some((s) => s.open) ? (
                              <>Horas y € se calculan al picar salida</>
                            ) : null}
                          </div>
                          {hNp > 0 ? (
                            <p className="fich-line-np muted small fichado-np-note">
                              Sin cobro: {formatHoursMinutes(hNp)}
                            </p>
                          ) : null}
                        </div>
                      ) : hNp > 0 ? (
                        <span className="fich-line-np">{formatHoursMinutes(hNp)} sin cobro</span>
                      ) : hPaid + hNp > 0 ? (
                        <span>
                          {hPaid > 0 ? (
                            <>
                              <span className="fich-line-paid">
                                {formatHoursMinutes(hPaid)} cobro
                                {avgRate != null ? (
                                  <span className="muted small">
                                    {' '}
                                    (~{avgRate.toFixed(2)} €/h)
                                  </span>
                                ) : null}
                              </span>
                            </>
                          ) : null}
                        </span>
                      ) : null
                    return (
                      <tr
                        key={iso}
                        className={todayRow ? 'horario-row-today' : 'horario-row-past'}
                      >
                        <td className="horario-sticky-day">
                          <strong>{weekdayShort(wd)}</strong>{' '}
                          <span className="muted small">{fmtDateEs(iso)}</span>
                          {todayRow ? (
                            <span className="badge-today small">Hoy</span>
                          ) : null}
                        </td>
                        <td>{planned}</td>
                        <td>
                          {fichadoCell ? (
                            fichadoCell
                          ) : hoursLegacy > 0 ? (
                            <span className="muted small">
                              {formatHoursMinutes(hoursLegacy)} (detalle)
                            </span>
                          ) : dayRawPunches.length > 0 ? (
                            <ul className="punch-today-list fichado-raw-day">
                              {dayRawPunches.map((p) => (
                                <li key={p.id}>
                                  {p.punch_type === 'in' ? (
                                    <span className="badge-in badge-fich-in">E</span>
                                  ) : (
                                    <span className="badge-out badge-fich-out">S</span>
                                  )}{' '}
                                  <span className="time-strong">
                                    {fmtClock(p.punched_at)}
                                  </span>
                                  {p.no_pay ? (
                                    <span className="muted small"> (sin cobro)</span>
                                  ) : null}
                                </li>
                              ))}
                            </ul>
                          ) : past ? (
                            <span className="muted">Sin fichajes</span>
                          ) : (
                            <span className="muted">—</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === 'resumen' && (
          <div className="tab-panel">
            <div className="table-wrap">
              <table className="rules-table">
                <thead>
                  <tr>
                    <th>Día</th>
                    <th>Horas</th>
                    <th>€ estim.</th>
                  </tr>
                </thead>
                <tbody>
                  {summaryRowsVisible.map((r) => (
                    <tr key={r.dateIso}>
                      <td>
                        {r.weekdayLabel} {fmtDateEs(r.dateIso)}
                      </td>
                      <td>{r.hours > 0 ? formatHoursMinutes(r.hours) : '—'}</td>
                      <td>{r.gross > 0 ? `${r.gross.toFixed(2)} €` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="card subpanel">
              <p className="label-up">Totales (tarifas del evento)</p>
              <p>
                Horas (cobro):{' '}
                <strong>{formatHoursMinutes(summary.totalHours)}</strong> · Bruto horas:{' '}
                <strong>{summary.totalGross.toFixed(2)} €</strong>
              </p>
              {showMoneyExtras ? (
                <>
                  <ul className="money-list">
                    {extras.payrollIncluded > 0 ? (
                      <li>
                        Por nómina (evento):{' '}
                        <strong>{extras.payrollIncluded.toFixed(2)} €</strong>
                      </li>
                    ) : null}
                    <li>
                      Bruto por horas (estim.):{' '}
                      <strong>{extras.grossFromHours.toFixed(2)} €</strong>
                    </li>
                    {extras.payrollIncluded > 0 ? (
                      <li>
                        Tras descontar nómina (horas en mano):{' '}
                        <strong>{extras.extraAfterPayroll.toFixed(2)} €</strong>
                      </li>
                    ) : (
                      <li className="money-total">
                        Total estimado por horas:{' '}
                        <strong>{extras.grossFromHours.toFixed(2)} €</strong>
                      </li>
                    )}
                  </ul>
                </>
              ) : null}
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
