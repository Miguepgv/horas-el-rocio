import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { friendlySupabaseError } from '../lib/dbErrors.js'
import {
  fromDatetimeLocalValue,
  resolvePrimaryPunchUserId,
  toDatetimeLocalValue,
} from '../lib/adminPlanillaPunches.js'

/**
 * @param {{
 *   open: boolean
 *   onClose: () => void
 *   nombre: string
 *   email: string
 *   punches: Array<{ id: string, punch_type: string, punched_at: string, no_pay?: boolean }>
 *   eventWorkers: Array<{ email?: string|null, auth_user_id?: string|null }>
 *   onSaved: () => void | Promise<void>
 * }} props
 */
export default function PlanillaFichajesModal({
  open,
  onClose,
  nombre,
  email,
  punches,
  eventWorkers,
  onSaved,
}) {
  const [times, setTimes] = useState({})
  const [types, setTypes] = useState({})
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const [newType, setNewType] = useState('in')
  const [newTime, setNewTime] = useState('')

  useEffect(() => {
    if (!open) return
    /* eslint-disable react-hooks/set-state-in-effect -- sincronizar formulario al abrir */
    setMsg(null)
    const t = {}
    const ty = {}
    for (const p of punches ?? []) {
      t[p.id] = toDatetimeLocalValue(p.punched_at)
      ty[p.id] = p.punch_type === 'out' ? 'out' : 'in'
    }
    setTimes(t)
    setTypes(ty)
    setNewType('in')
    setNewTime(toDatetimeLocalValue(new Date().toISOString()))
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [open, punches])

  if (!open) return null

  const sorted = [...(punches ?? [])].sort(
    (a, b) => new Date(a.punched_at) - new Date(b.punched_at),
  )

  async function savePunch(p) {
    const raw = times[p.id]
    const iso = fromDatetimeLocalValue(raw)
    if (!iso) {
      setMsg({ type: 'error', text: 'Fecha u hora no válida.' })
      return
    }
    const punchType = types[p.id] === 'out' ? 'out' : 'in'
    setBusy(true)
    setMsg(null)
    const { error } = await supabase
      .from('punches')
      .update({ punched_at: iso, punch_type: punchType })
      .eq('id', p.id)
    setBusy(false)
    if (error) {
      setMsg({ type: 'error', text: friendlySupabaseError(error) })
      return
    }
    setMsg({ type: 'ok', text: 'Fichaje guardado.' })
    await onSaved()
  }

  async function deletePunch(id) {
    if (!window.confirm('¿Borrar este fichaje?')) return
    setBusy(true)
    setMsg(null)
    const { error } = await supabase.from('punches').delete().eq('id', id)
    setBusy(false)
    if (error) {
      setMsg({ type: 'error', text: friendlySupabaseError(error) })
      return
    }
    await onSaved()
  }

  async function guardarNuevoFichaje() {
    const iso = fromDatetimeLocalValue(newTime)
    if (!iso) {
      setMsg({ type: 'error', text: 'Indica fecha y hora válidas antes de guardar.' })
      return
    }
    setBusy(true)
    setMsg(null)
    const userId = await resolvePrimaryPunchUserId(email, eventWorkers)
    if (!userId) {
      setBusy(false)
      setMsg({ type: 'error', text: 'No se pudo resolver el usuario para el fichaje.' })
      return
    }
    const { error } = await supabase.from('punches').insert({
      user_id: userId,
      punch_type: newType,
      punched_at: iso,
      created_by: null,
      no_pay: false,
    })
    setBusy(false)
    if (error) {
      setMsg({ type: 'error', text: friendlySupabaseError(error) })
      return
    }
    setMsg({ type: 'ok', text: 'Fichaje añadido y guardado.' })
    setNewTime(toDatetimeLocalValue(new Date().toISOString()))
    await onSaved()
  }

  return (
    <div className="modal-root" role="dialog" aria-modal="true" aria-label="Fichajes reales">
      <button type="button" className="modal-backdrop" onClick={() => !busy && onClose()} aria-hidden />
      <div className="modal-panel card planilla-fichajes-modal-panel">
        <div className="modal-head">
          <h2>Fichajes reales</h2>
          <button type="button" className="secondary btn-close" onClick={onClose} disabled={busy}>
            Cerrar
          </button>
        </div>
        <p className="muted small">
          <strong>{nombre || email}</strong>
          {nombre && email ? (
            <>
              {' '}
              · <code>{email}</code>
            </>
          ) : null}
        </p>
        <p className="muted small" style={{ marginTop: 0 }}>
          Cambia entrada/salida o la hora y pulsa <strong>Guardar</strong> en cada fila. Los turnos que pasan
          medianoche se cobran en el día de la entrada.
        </p>

        <ul className="planilla-fichajes-list">
          {sorted.length === 0 ? (
            <li className="muted">Sin fichajes en el periodo cargado.</li>
          ) : (
            sorted.map((p) => (
              <li key={p.id} className="planilla-fichajes-row">
                <select
                  className="table-input planilla-fichajes-type-select"
                  value={types[p.id] ?? 'in'}
                  disabled={busy}
                  onChange={(e) =>
                    setTypes((prev) => ({ ...prev, [p.id]: e.target.value }))
                  }
                  aria-label="Tipo de fichaje"
                >
                  <option value="in">Entrada</option>
                  <option value="out">Salida</option>
                </select>
                <input
                  type="datetime-local"
                  className="table-input planilla-fichajes-dt"
                  value={times[p.id] ?? ''}
                  disabled={busy}
                  onChange={(e) =>
                    setTimes((prev) => ({ ...prev, [p.id]: e.target.value }))
                  }
                />
                <div className="planilla-fichajes-row-actions">
                  <button
                    type="button"
                    className="primary btn-xs"
                    disabled={busy}
                    onClick={() => savePunch(p)}
                  >
                    Guardar
                  </button>
                  <button
                    type="button"
                    className="secondary btn-xs danger-text"
                    disabled={busy}
                    onClick={() => deletePunch(p.id)}
                  >
                    Borrar
                  </button>
                </div>
                {p.no_pay ? (
                  <span className="muted small planilla-fichajes-nopay">Sin cobro</span>
                ) : null}
              </li>
            ))
          )}
        </ul>

        <div className="planilla-fichajes-add card subpanel">
          <p className="label-up">Añadir fichaje manual (olvidó picar)</p>
          <p className="muted small" style={{ marginTop: 0 }}>
            Elige día y hora y pulsa <strong>Guardar fichaje</strong> (no se guarda al cerrar fuera).
          </p>
          <div className="planilla-fichajes-add-row">
            <select
              className="table-input"
              value={newType}
              disabled={busy}
              onChange={(e) => setNewType(e.target.value)}
            >
              <option value="in">Entrada</option>
              <option value="out">Salida</option>
            </select>
            <input
              type="datetime-local"
              className="table-input planilla-fichajes-dt"
              value={newTime}
              disabled={busy}
              onChange={(e) => setNewTime(e.target.value)}
            />
            <button type="button" className="primary" disabled={busy} onClick={guardarNuevoFichaje}>
              {busy ? 'Guardando…' : 'Guardar fichaje'}
            </button>
          </div>
        </div>

        {msg ? (
          <p className={`hint ${msg.type === 'error' ? 'error' : 'ok'}`}>{msg.text}</p>
        ) : null}
      </div>
    </div>
  )
}