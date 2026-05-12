import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { friendlySupabaseError, isMissingTableError } from '../lib/dbErrors.js'
import { fetchPunchesGroupedByPlanillaEmail } from '../lib/adminPlanillaPunches.js'
import {
  emptyRocioPlanillaPayload,
  ROCIO_PLANILLA_DAY_KEYS as DAY_KEYS,
  ROCIO_PLANILLA_EXTRA_KEYS as EXTRA_KEYS,
} from '../lib/rocioPlanillaKeys.js'
import { parsePlanillaWideCsv } from '../lib/csvSchedule.js'
import AdminPlanillaFichajesTab from './AdminPlanillaFichajesTab.jsx'
import PlanillaFichajesModal from './PlanillaFichajesModal.jsx'

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

function planillaCsvRowToPayload(rec) {
  const payload = {
    nombre: String(rec.nombre ?? '').trim(),
    correo: String(rec.correo ?? '').trim().toLowerCase() || null,
  }
  for (const k of DAY_KEYS) payload[k] = rec[k] ?? ''
  for (const k of EXTRA_KEYS) payload[k] = parseEuroField(rec[k])
  return payload
}

function normalizePlanillaRow(r) {
  const o = { ...r }
  for (const k of EXTRA_KEYS) {
    const v = o[k]
    if (v == null || v === '') o[k] = ''
    else o[k] = String(v)
  }
  return o
}

function planillaRowHasExtrasColumns(r) {
  return Boolean(r && Object.prototype.hasOwnProperty.call(r, 'nomina_event_euros'))
}

export default function AdminPlanillaPanel() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const [emailOptions, setEmailOptions] = useState([])
  const [magicLoginEmails, setMagicLoginEmails] = useState([])
  const [punchByEmail, setPunchByEmail] = useState({})
  const [eventWorkersCache, setEventWorkersCache] = useState([])
  const [punchModal, setPunchModal] = useState(null)
  const [adminSection, setAdminSection] = useState('celdas')
  const [importCsv, setImportCsv] = useState('')
  const [importBusy, setImportBusy] = useState(false)

  const refresh = useCallback(async (opts = {}) => {
    const { keepUserMessage = false } = opts
    setLoading(true)
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
    const log = await supabase.from('app_login_emails').select('email')
    if (!log.error) {
      for (const r of log.data ?? []) {
        const e = String(r.email ?? '')
          .trim()
          .toLowerCase()
        if (e) {
          magic.add(e)
          emails.add(e)
        }
      }
    } else if (!isMissingTableError(log.error)) {
      console.warn('app_login_emails:', log.error?.message ?? log.error)
    }
    const magicSorted = [...magic].sort()
    setMagicLoginEmails(magicSorted)
    setEmailOptions([...emails].sort())
    setEventWorkersCache(ew.error ? [] : ew.data ?? [])
    let punchMap = {}
    if (!ew.error) {
      try {
        punchMap = await fetchPunchesGroupedByPlanillaEmail(
          supabase,
          raw,
          ew.data ?? [],
        )
      } catch (e) {
        console.warn('fichajes planilla:', e)
        setMsg({
          type: 'error',
          text: `No se pudieron cargar los fichajes: ${friendlySupabaseError(e)}`,
        })
      }
    }
    setPunchByEmail(punchMap)

    const planillaExtrasMissing = Boolean(
      raw.length && !planillaRowHasExtrasColumns(raw[0]),
    )
    if (planillaExtrasMissing) {
      setMsg({
        type: 'error',
        text:
          'La tabla en Supabase no tiene las columnas de nómina/gasoil/parking. Ejecuta en el SQL Editor el archivo scripts/supabase_planilla_extras.sql (o el bloque ALTER de scripts/supabase_rocio_horario_tables.sql) y luego NOTIFY pgrst; recarga la app.',
      })
    }
    return { planillaExtrasMissing }
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

  async function saveRow(row) {
    setBusy(true)
    setMsg(null)
    const payload = { nombre: String(row.nombre ?? '').trim() }
    payload.correo = String(row.correo ?? '').trim().toLowerCase() || null
    for (const k of DAY_KEYS) payload[k] = row[k] ?? ''
    for (const k of EXTRA_KEYS) payload[k] = parseEuroField(row[k])

    let err
    let savedRows = null
    if (row.id) {
      ;({ data: savedRows, error: err } = await supabase
        .from('rocio_horario_planilla')
        .update(payload)
        .eq('id', row.id)
        .select('*'))
    } else {
      if (!payload.nombre) {
        setBusy(false)
        setMsg({ type: 'error', text: 'El nombre no puede estar vacío.' })
        return
      }
      ;({ data: savedRows, error: err } = await supabase
        .from('rocio_horario_planilla')
        .insert(payload)
        .select('*'))
    }
    setBusy(false)
    if (err) {
      setMsg({ type: 'error', text: friendlySupabaseError(err) })
      return
    }
    const saved = savedRows?.[0]
    if (saved) {
      for (const k of EXTRA_KEYS) {
        const want = payload[k]
        if (want == null) continue
        if (!(k in saved)) {
          setMsg({
            type: 'error',
            text:
              'El guardado no devuelve las columnas de € (nómina/gasoil/parking). Ejecuta scripts/supabase_planilla_extras.sql en Supabase y recarga el esquema (NOTIFY pgrst).',
          })
          await refresh({ keepUserMessage: true })
          return
        }
        const got = saved[k]
        const nw = Number(want)
        const ng = Number(got)
        const close =
          Number.isFinite(nw) &&
          Number.isFinite(ng) &&
          Math.abs(nw - ng) < 0.009
        if (!close) {
          setMsg({
            type: 'error',
            text: `No se ha podido confirmar el campo ${k} tras guardar. Revisa la base de datos y el SQL de columnas.`,
          })
          await refresh({ keepUserMessage: true })
          return
        }
      }
    }
    const rmeta = await refresh({ keepUserMessage: true })
    if (!rmeta?.planillaExtrasMissing) {
      setMsg({ type: 'ok', text: 'Guardado.' })
    }
  }

  async function deleteRow(id) {
    if (!id || !window.confirm('¿Quitar esta fila de la planilla?')) return
    setBusy(true)
    const { error } = await supabase
      .from('rocio_horario_planilla')
      .delete()
      .eq('id', id)
    setBusy(false)
    if (error) {
      setMsg({ type: 'error', text: friendlySupabaseError(error) })
      return
    }
    setMsg({ type: 'ok', text: 'Fila eliminada.' })
    refresh()
  }

  function addRow() {
    setRows((r) => [...r, { ...emptyRow(), id: null }])
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
          'No se ha reconocido ninguna fila válida. Usa nombre + 22 columnas (d01_a…d11_b) + correo, o cabeceras con nombres d01_a, d01_b, …',
      })
      return
    }
    if (
      !window.confirm(
        `Se borrarán TODAS las filas actuales de la planilla (${rows.length}) y se cargarán ${valid.length} filas desde el CSV. ¿Continuar?`,
      )
    )
      return

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
      return
    }

    const payloads = valid.map(planillaCsvRowToPayload)
    const chunk = 80
    for (let i = 0; i < payloads.length; i += chunk) {
      const batch = payloads.slice(i, i + chunk)
      const { error } = await supabase.from('rocio_horario_planilla').insert(batch)
      if (error) {
        setImportBusy(false)
        setMsg({ type: 'error', text: friendlySupabaseError(error) })
        await refresh()
        return
      }
    }
    setImportBusy(false)
    setImportCsv('')
    setMsg({ type: 'ok', text: `Planilla sustituida (${valid.length} filas).` })
    refresh()
  }

  const magicSet = useMemo(() => new Set(magicLoginEmails), [magicLoginEmails])
  const emailOptionsRest = useMemo(
    () => emailOptions.filter((e) => !magicSet.has(e)),
    [emailOptions, magicSet],
  )

  const headerDays = useMemo(
    () =>
      DAY_KEYS.map((k, idx) => (
        <th key={k} className="planilla-mini-th" title={k}>
          {Math.floor(idx / 2) + 1}
          {idx % 2 === 0 ? 'a' : 'b'}
        </th>
      )),
    [],
  )

  return (
    <section className="card admin-card">
      <p className="label-up">Planilla y fichajes (Supabase)</p>

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
          punchByEmail={punchByEmail}
          onCorregir={(email, nombre) => setPunchModal({ email, nombre })}
        />
      ) : (
        <>
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
          <div className="table-wrap planilla-admin-wrap">
            <table className="rules-table planilla-admin-table">
              <thead>
                <tr>
                  <th className="planilla-th-nombre">Nombre</th>
                  <th className="planilla-th-correo">Correo (enlace)</th>
                  <th className="planilla-th-euro" title="€ que ya van por nómina del evento (se restan del bruto horas)">
                    Nómina €
                  </th>
                  <th className="planilla-th-euro">Gasoil €</th>
                  <th className="planilla-th-euro">Parking €</th>
                  {headerDays}
                  <th className="planilla-th-actions" />
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
                    {EXTRA_KEYS.map((ek) => (
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
                    {DAY_KEYS.map((k) => (
                      <td key={k} className="planilla-td-slot">
                        <input
                          className="table-input planilla-cell"
                          value={row[k] ?? ''}
                          onChange={(e) =>
                            row.id
                              ? patchLocal(row.id, k, e.target.value)
                              : patchDraft(row, { [k]: e.target.value })
                          }
                        />
                      </td>
                    ))}
                    <td className="planilla-actions">
                      <button
                        type="button"
                        className="secondary btn-xs"
                        disabled={busy}
                        onClick={() => saveRow(row)}
                      >
                        Guardar
                      </button>
                      {row.id ? (
                        <button
                          type="button"
                          className="secondary btn-xs danger-text"
                          disabled={busy}
                          onClick={() => deleteRow(row.id)}
                        >
                          Quitar
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button type="button" className="secondary" disabled={busy} onClick={addRow}>
            + Añadir trabajador
          </button>
        </>
      )}

      {msg && (
        <p className={`hint ${msg.type === 'error' ? 'error' : 'ok'}`}>{msg.text}</p>
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
