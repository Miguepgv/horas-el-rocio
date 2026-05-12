import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export default function ManageAdminsModal({ open, onClose }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [email, setEmail] = useState('')
  const [msg, setMsg] = useState(null)

  async function refresh() {
    setLoading(true)
    const { data, error } = await supabase
      .from('app_admins')
      .select('email, created_at')
      .order('created_at', { ascending: true })
    setLoading(false)
    if (error) {
      setMsg({ type: 'error', text: error.message })
      return
    }
    setRows(data ?? [])
  }

  useEffect(() => {
    if (open) {
      setMsg(null)
      refresh()
    }
  }, [open])

  async function addAdmin(e) {
    e.preventDefault()
    setMsg(null)
    const em = email.trim().toLowerCase()
    if (!em) return
    const { error } = await supabase.from('app_admins').insert({
      email: em,
      created_by: 'app',
    })
    if (error) {
      setMsg({ type: 'error', text: error.message })
      return
    }
    setEmail('')
    setMsg({ type: 'ok', text: 'Administrador añadido.' })
    refresh()
  }

  async function removeAdmin(em) {
    const superEmail = import.meta.env.VITE_SUPER_ADMIN_EMAIL?.trim().toLowerCase()
    if (em.trim().toLowerCase() === superEmail) {
      setMsg({
        type: 'error',
        text: 'No puedes quitar al super administrador desde aquí.',
      })
      return
    }
    setMsg(null)
    const { error } = await supabase.from('app_admins').delete().eq('email', em)
    if (error) {
      setMsg({ type: 'error', text: error.message })
      return
    }
    refresh()
  }

  if (!open) return null

  return (
    <div className="modal-root" role="dialog" aria-modal="true" aria-label="Administradores">
      <button type="button" className="modal-backdrop" onClick={onClose} aria-hidden />
      <div className="modal-panel card">
        <div className="modal-head">
          <h2>Administradores</h2>
          <button type="button" className="secondary btn-close" onClick={onClose}>
            Cerrar
          </button>
        </div>
        <p className="muted small">
          Solo el super administrador puede añadir o quitar correos con acceso a la zona
          de administración.
        </p>

        <form className="admin-add-form" onSubmit={addAdmin}>
          <label htmlFor="new-admin-email">Correo nuevo admin</label>
          <div className="admin-add-row">
            <input
              id="new-admin-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="correo@ejemplo.com"
              autoComplete="email"
            />
            <button type="submit" disabled={loading}>
              Añadir
            </button>
          </div>
        </form>

        {msg && (
          <p className={`hint ${msg.type === 'error' ? 'error' : 'ok'}`}>{msg.text}</p>
        )}

        <div className="table-wrap">
          <table className="rules-table">
            <thead>
              <tr>
                <th>Correo</th>
                <th>Alta</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.email}>
                  <td>{r.email}</td>
                  <td className="muted small">
                    {r.created_at
                      ? new Date(r.created_at).toLocaleString('es-ES')
                      : '—'}
                  </td>
                  <td>
                    <button
                      type="button"
                      className="secondary btn-xs"
                      onClick={() => removeAdmin(r.email)}
                    >
                      Quitar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {loading && <p className="muted small">Cargando…</p>}
      </div>
    </div>
  )
}
