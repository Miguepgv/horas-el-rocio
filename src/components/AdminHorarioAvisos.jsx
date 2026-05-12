import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { friendlySupabaseError } from '../lib/dbErrors.js'

export default function AdminHorarioAvisos() {
  const [text, setText] = useState(
    'Han habido cambios en el horario. Revisa tu planificación.',
  )
  const [target, setTarget] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)

  async function send(e) {
    e.preventDefault()
    setMsg(null)
    setBusy(true)
    const para = target.trim().toLowerCase() || null
    const { error } = await supabase.from('horario_avisos').insert({
      mensaje: text.trim(),
      para_email: para,
    })
    setBusy(false)
    if (error) {
      setMsg({
        type: 'error',
        text:
          friendlySupabaseError(error) +
          ' · Ejecuta el SQL de la tabla horario_avisos (mensaje del asistente).',
      })
      return
    }
    setMsg({
      type: 'ok',
      text: para
        ? `Aviso registrado para ${para}. Lo verá al abrir la app.`
        : 'Aviso para todos registrado.',
    })
  }

  return (
    <section className="card admin-card">
      <p className="label-up">Aviso de cambios de horario</p>
      <form className="worker-fin-form" onSubmit={send}>
        <label htmlFor="av-text">Mensaje</label>
        <textarea
          id="av-text"
          rows={3}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <label htmlFor="av-target">Correo (opcional)</label>
        <input
          id="av-target"
          type="email"
          placeholder="correo@ejemplo.com"
          value={target}
          onChange={(e) => setTarget(e.target.value)}
        />
        <button type="submit" disabled={busy}>
          {busy ? 'Enviando…' : 'Registrar aviso'}
        </button>
      </form>
      {msg && (
        <p className={`hint ${msg.type === 'error' ? 'error' : 'ok'}`}>{msg.text}</p>
      )}
    </section>
  )
}
