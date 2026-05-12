import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { PAY_EVENT_EL_ROCIO } from '../data/payRules.js'
import { parseLongSlotsCsv, parseRosterCsv } from '../lib/csvSchedule.js'
import { friendlySupabaseError } from '../lib/dbErrors.js'

function normName(s) {
  return String(s ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
}

export default function EventRosterPanel() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState(false)
  const [rosterCsv, setRosterCsv] = useState('')
  const [slotsCsv, setSlotsCsv] = useState('')

  const refresh = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('event_workers')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('full_name', { ascending: true })
    setLoading(false)
    if (error) {
      setMsg({ type: 'error', text: friendlySupabaseError(error) })
      setRows([])
      return
    }
    setRows(data ?? [])
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  async function saveRow(w) {
    setMsg(null)
    setBusy(true)
    const payload = {
      full_name: w.full_name.trim(),
      email: w.email?.trim() ? w.email.trim().toLowerCase() : null,
      sort_order: Number(w.sort_order) || 0,
    }
    let error
    if (w.id) {
      ;({ error } = await supabase
        .from('event_workers')
        .update(payload)
        .eq('id', w.id))
    } else {
      ;({ error } = await supabase.from('event_workers').insert(payload))
    }
    setBusy(false)
    if (error) {
      setMsg({ type: 'error', text: friendlySupabaseError(error) })
      return
    }
    setMsg({ type: 'ok', text: 'Persona guardada.' })
    refresh()
  }

  function addBlank() {
    setRows((r) => [
      ...r,
      {
        id: null,
        full_name: '',
        email: '',
        auth_user_id: null,
        sort_order: (r.length + 1) * 10,
      },
    ])
  }

  function patchRow(id, patch) {
    setRows((list) => list.map((x) => (x.id === id ? { ...x, ...patch } : x)))
  }

  function patchDraft(patch, draftRow) {
    setRows((list) =>
      list.map((x) => (x === draftRow ? { ...x, ...patch } : x)),
    )
  }

  async function importRoster(e) {
    e.preventDefault()
    setMsg(null)
    let parsed = []
    try {
      parsed = parseRosterCsv(rosterCsv)
    } catch (err) {
      setMsg({ type: 'error', text: err?.message ?? 'CSV inválido' })
      return
    }
    if (!parsed.length) {
      setMsg({ type: 'error', text: 'No hay filas. Usa: nombre,correo' })
      return
    }
    setBusy(true)
    for (let i = 0; i < parsed.length; i++) {
      const row = parsed[i]
      const { error } = await supabase.from('event_workers').insert({
        full_name: row.full_name,
        email: row.email,
        sort_order: (i + 1) * 10,
      })
      if (error) {
        setBusy(false)
        setMsg({
          type: 'error',
          text: `${friendlySupabaseError(error)} (${row.full_name})`,
        })
        return
      }
    }
    setBusy(false)
    setMsg({
      type: 'ok',
      text: `Añadidas ${parsed.length} personas. Revisa y pon correos.`,
    })
    setRosterCsv('')
    refresh()
  }

  async function importSlots(e) {
    e.preventDefault()
    setMsg(null)
    let parsed = []
    try {
      parsed = parseLongSlotsCsv(slotsCsv)
    } catch (err) {
      setMsg({ type: 'error', text: err?.message ?? 'CSV inválido' })
      return
    }
    if (!parsed.length) {
      setMsg({
        type: 'error',
        text:
          'Sin filas válidas. Cabecera opcional. Ver ejemplo abajo (salida puede ir vacía o omitirse).',
      })
      return
    }

    const { data: workers, error: ewErr } = await supabase
      .from('event_workers')
      .select('id,full_name,email')
    if (ewErr) {
      setMsg({ type: 'error', text: friendlySupabaseError(ewErr) })
      return
    }

    function resolveWorkerId(row) {
      if (row.email) {
        const em = row.email.toLowerCase()
        const byEmail = workers?.find(
          (w) => w.email && w.email.toLowerCase() === em,
        )
        if (byEmail) return byEmail.id
      }
      const nn = normName(row.full_name)
      const byName = workers?.find((w) => normName(w.full_name) === nn)
      return byName?.id ?? null
    }

    setBusy(true)
    let ok = 0
    for (const r of parsed) {
      const worker_id = resolveWorkerId(r)
      if (!worker_id) {
        setBusy(false)
        setMsg({
          type: 'error',
          text: `No encuentro trabajador "${r.full_name}". Impórtalo antes en la tabla o CSV de nombres.`,
        })
        return
      }
      const payload = {
        worker_id,
        work_date: r.work_date,
        slot_index: r.slot_index,
        start_time: r.is_rest ? null : r.start_time || null,
        end_time: r.is_rest ? null : r.end_time || null,
        crosses_midnight: Boolean(r.crosses_midnight),
        is_rest: Boolean(r.is_rest),
      }
      const { error } = await supabase.from('event_schedule_slots').upsert(payload, {
        onConflict: 'worker_id,work_date,slot_index',
      })
      if (error) {
        setBusy(false)
        setMsg({
          type: 'error',
          text: `${friendlySupabaseError(error)} · ${r.full_name} ${r.work_date} T${r.slot_index}`,
        })
        return
      }
      ok += 1
    }
    setBusy(false)
    setMsg({ type: 'ok', text: `Importadas ${ok} franjas (turnos).` })
    setSlotsCsv('')
  }

  return (
    <section className="card admin-card">
      <p className="label-up">Plantilla del evento (nombre, correo, horarios)</p>
      <p className="muted small">
        La app te reconoce si el <strong>correo</strong> de esta tabla es el mismo con el
        que la persona hace login (tabla <code>event_workers</code>). No hace falta
        rellenar la columna UUID: suele quedar vacía. Lo mismo vale si usáis solo la{' '}
        <strong>planilla horario</strong>: el correo allí debe coincidir. Turnos
        partidos en CSV de franjas: <strong>turno</strong> 1 y 2 el mismo día.
      </p>

      <div className="table-wrap roster-table-wrap">
        <table className="rules-table roster-edit-table">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Correo</th>
              <th title="Opcional. La app enlaza por correo igual al login; este UUID no lo rellena la interfaz.">
                UUID
              </th>
              <th />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={4} className="muted">
                  Cargando…
                </td>
              </tr>
            ) : (
              rows.map((w) => (
                <tr key={w.id ?? `draft-${w.sort_order}`}>
                  <td>
                    <input
                      className="table-input"
                      value={w.full_name}
                      onChange={(e) =>
                        w.id
                          ? patchRow(w.id, { full_name: e.target.value })
                          : patchDraft({ full_name: e.target.value }, w)
                      }
                      placeholder="Nombre"
                    />
                  </td>
                  <td>
                    <input
                      className="table-input"
                      type="email"
                      value={w.email ?? ''}
                      onChange={(e) =>
                        w.id
                          ? patchRow(w.id, { email: e.target.value })
                          : patchDraft({ email: e.target.value }, w)
                      }
                      placeholder="correo@…"
                    />
                  </td>
                  <td className="muted small">
                    {w.auth_user_id ? (
                      <span className="badge-linked" title="Raro: suele bastar el correo.">
                        Sí
                      </span>
                    ) : w.email?.trim() ? (
                      <span title="Basta con que este correo sea el del login.">—</span>
                    ) : (
                      <span title="Sin correo: la persona no enlaza por email.">Sin</span>
                    )}
                  </td>
                  <td>
                    <button
                      type="button"
                      className="secondary btn-xs"
                      disabled={busy || !String(w.full_name ?? '').trim()}
                      onClick={() => saveRow(w)}
                    >
                      Guardar
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <button type="button" className="secondary" onClick={addBlank} disabled={busy}>
        + Añadir fila
      </button>

      <hr className="admin-hr" />

      <p className="label-up">Importar nombres (CSV)</p>
      <p className="muted small">
        Columnas: <code>nombre,correo</code>. Correo opcional.
      </p>
      <textarea
        className="csv-textarea"
        rows={4}
        placeholder={`nombre,correo\nMARIA JOSE,\nJUANFRAN,juan@mail.com`}
        value={rosterCsv}
        onChange={(e) => setRosterCsv(e.target.value)}
      />
      <button type="button" className="secondary" disabled={busy} onClick={importRoster}>
        Importar personas
      </button>

      <hr className="admin-hr" />

      <p className="label-up">Importar horarios / turnos partidos (CSV)</p>
      <p className="muted small">
        Mismo día con <strong>turno</strong> 1 y 2 = turno partido (dos filas). Si solo tienes hora de
        entrada, deja <strong>salida</strong> vacía o usa el formato de 7 columnas sin salida. El
        domingo u otro día con entrada y salida, mete la hora en <strong>salida</strong>.
      </p>
      <pre className="csv-sample">
        nombre,correo,fecha,turno,entrada,salida,cruza,descanso{'\n'}
        MARIA JOSE,,2026-05-15,1,12:00,,false,false{'\n'}
        MARIA JOSE,,2026-05-15,2,20:30,,false,false{'\n'}
        MARIA JOSE,,2026-05-17,1,10:00,14:00,false,false{'\n'}
        nombre,correo,fecha,turno,entrada,cruza,descanso{'\n'}
        ALEX,,2026-05-15,1,8:30,false,false{'\n'}
        ALEX,,2026-05-15,2,17:00,false,false{'\n'}
        JUAN,,2026-05-15,1,D,false,true
      </pre>
      <textarea
        className="csv-textarea"
        rows={6}
        value={slotsCsv}
        onChange={(e) => setSlotsCsv(e.target.value)}
      />
      <button type="button" className="secondary" disabled={busy} onClick={importSlots}>
        Importar franjas
      </button>

      <p className="muted small admin-tip">
        Evento: {PAY_EVENT_EL_ROCIO.dateFrom} → {PAY_EVENT_EL_ROCIO.dateTo}.
      </p>

      {msg && (
        <p className={`hint ${msg.type === 'error' ? 'error' : 'ok'}`}>{msg.text}</p>
      )}
    </section>
  )
}
