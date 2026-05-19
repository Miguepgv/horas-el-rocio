import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { friendlySupabaseError, isMissingTableError } from '../lib/dbErrors.js'

const EMPTY_DRAFT = { nombre: '', num_personas: '2', telefono: '' }

function emptyDraft() {
  return { ...EMPTY_DRAFT }
}

function parsePersonas(v) {
  const n = Number.parseInt(String(v ?? '').trim(), 10)
  if (!Number.isFinite(n) || n < 1) return null
  if (n > 99) return 99
  return n
}

export default function AdminListaEspera() {
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const [draft, setDraft] = useState(() => emptyDraft())
  const [editingId, setEditingId] = useState(null)
  const [editDraft, setEditDraft] = useState(() => emptyDraft())

  const refresh = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('rocio_lista_espera')
      .select('id, nombre, num_personas, telefono, created_at')
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
    setLoading(false)
    if (error) {
      setEntries([])
      setMsg({
        type: 'error',
        text:
          friendlySupabaseError(error) +
          (isMissingTableError(error)
            ? ' · Ejecuta scripts/supabase_lista_espera.sql en Supabase.'
            : ''),
      })
      return
    }
    setEntries(data ?? [])
    setMsg(null)
  }, [])

  useEffect(() => {
    let cancelled = false
    let channel = null

    ;(async () => {
      await refresh()
      if (cancelled) return
      try {
        channel = supabase
          .channel('rocio_lista_espera_changes')
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'rocio_lista_espera' },
            () => {
              refresh()
            },
          )
          .subscribe()
      } catch (e) {
        console.warn('lista espera realtime:', e)
      }
    })()

    return () => {
      cancelled = true
      if (channel) supabase.removeChannel(channel)
    }
  }, [refresh])

  async function addEntry(e) {
    e.preventDefault()
    setMsg(null)
    const nombre = draft.nombre.trim()
    const telefono = draft.telefono.trim()
    const num_personas = parsePersonas(draft.num_personas)
    if (!nombre) {
      setMsg({ type: 'error', text: 'Indica el nombre.' })
      return
    }
    if (num_personas == null) {
      setMsg({ type: 'error', text: 'Número de personas no válido (1–99).' })
      return
    }
    setBusy(true)
    const { error } = await supabase.from('rocio_lista_espera').insert({
      nombre,
      num_personas,
      telefono,
    })
    setBusy(false)
    if (error) {
      setMsg({ type: 'error', text: friendlySupabaseError(error) })
      return
    }
    setDraft(emptyDraft())
    setMsg({ type: 'ok', text: 'Añadido a la lista.' })
    await refresh()
  }

  async function removeEntry(id) {
    setMsg(null)
    setBusy(true)
    const { error } = await supabase.from('rocio_lista_espera').delete().eq('id', id)
    setBusy(false)
    if (error) {
      setMsg({ type: 'error', text: friendlySupabaseError(error) })
      return
    }
    if (editingId === id) setEditingId(null)
    await refresh()
  }

  function startEdit(row) {
    setEditingId(row.id)
    setEditDraft({
      nombre: row.nombre ?? '',
      num_personas: String(row.num_personas ?? ''),
      telefono: row.telefono ?? '',
    })
    setMsg(null)
  }

  async function saveEdit(id) {
    setMsg(null)
    const nombre = editDraft.nombre.trim()
    const telefono = editDraft.telefono.trim()
    const num_personas = parsePersonas(editDraft.num_personas)
    if (!nombre) {
      setMsg({ type: 'error', text: 'Indica el nombre.' })
      return
    }
    if (num_personas == null) {
      setMsg({ type: 'error', text: 'Número de personas no válido (1–99).' })
      return
    }
    setBusy(true)
    const { error } = await supabase
      .from('rocio_lista_espera')
      .update({ nombre, num_personas, telefono })
      .eq('id', id)
    setBusy(false)
    if (error) {
      setMsg({ type: 'error', text: friendlySupabaseError(error) })
      return
    }
    setEditingId(null)
    setMsg({ type: 'ok', text: 'Cambios guardados.' })
    await refresh()
  }

  const totalPersonas = entries.reduce((s, r) => s + (r.num_personas ?? 0), 0)

  return (
    <section className="card admin-card lista-espera-card">
      <p className="label-up">Lista de espera (hostess)</p>
      <p className="muted small lista-espera-hint">
        Anota quien espera mesa. Los nuevos entran al final. «Sentar» quita la fila cuando ya
        tienen mesa.
      </p>

      <form className="lista-espera-add-form" onSubmit={addEntry}>
        <label htmlFor="le-nombre">Nombre</label>
        <input
          id="le-nombre"
          className="table-input"
          placeholder="Nombre o apodo"
          value={draft.nombre}
          onChange={(e) => setDraft((d) => ({ ...d, nombre: e.target.value }))}
          disabled={busy}
          autoComplete="name"
        />
        <label htmlFor="le-personas">Personas</label>
        <input
          id="le-personas"
          className="table-input"
          type="number"
          min={1}
          max={99}
          inputMode="numeric"
          value={draft.num_personas}
          onChange={(e) => setDraft((d) => ({ ...d, num_personas: e.target.value }))}
          disabled={busy}
        />
        <label htmlFor="le-tel">Teléfono</label>
        <input
          id="le-tel"
          className="table-input"
          type="tel"
          placeholder="600 000 000"
          value={draft.telefono}
          onChange={(e) => setDraft((d) => ({ ...d, telefono: e.target.value }))}
          disabled={busy}
          autoComplete="tel"
        />
        <button type="submit" className="lista-espera-add-btn" disabled={busy}>
          {busy ? 'Guardando…' : '+ Añadir a la lista'}
        </button>
      </form>

      <p className="lista-espera-summary muted small">
        {loading
          ? 'Cargando lista…'
          : entries.length === 0
            ? 'Nadie en espera.'
            : `${entries.length} grupo${entries.length === 1 ? '' : 's'} · ${totalPersonas} persona${totalPersonas === 1 ? '' : 's'} en total`}
      </p>

      {!loading && entries.length > 0 ? (
        <ul className="lista-espera-queue">
          {entries.map((row, index) => {
            const isEditing = editingId === row.id
            return (
              <li key={row.id} className="lista-espera-item">
                <span className="lista-espera-pos" aria-hidden>
                  {index + 1}
                </span>
                {isEditing ? (
                  <div className="lista-espera-edit-fields">
                    <input
                      className="table-input"
                      value={editDraft.nombre}
                      onChange={(e) =>
                        setEditDraft((d) => ({ ...d, nombre: e.target.value }))
                      }
                      disabled={busy}
                      aria-label="Nombre"
                    />
                    <input
                      className="table-input lista-espera-personas-input"
                      type="number"
                      min={1}
                      max={99}
                      value={editDraft.num_personas}
                      onChange={(e) =>
                        setEditDraft((d) => ({ ...d, num_personas: e.target.value }))
                      }
                      disabled={busy}
                      aria-label="Personas"
                    />
                    <input
                      className="table-input"
                      type="tel"
                      value={editDraft.telefono}
                      onChange={(e) =>
                        setEditDraft((d) => ({ ...d, telefono: e.target.value }))
                      }
                      disabled={busy}
                      aria-label="Teléfono"
                    />
                    <div className="lista-espera-actions">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => saveEdit(row.id)}
                      >
                        Guardar
                      </button>
                      <button
                        type="button"
                        className="secondary"
                        disabled={busy}
                        onClick={() => setEditingId(null)}
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="lista-espera-body">
                      <strong className="lista-espera-nombre">{row.nombre}</strong>
                      <span className="lista-espera-meta">
                        {row.num_personas} pers.
                        {row.telefono ? (
                          <>
                            {' · '}
                            <a href={`tel:${String(row.telefono ?? '').replace(/\s/g, '')}`}>
                              {row.telefono}
                            </a>
                          </>
                        ) : null}
                      </span>
                    </div>
                    <div className="lista-espera-actions">
                      <button
                        type="button"
                        className="lista-espera-seat-btn"
                        disabled={busy}
                        onClick={() => removeEntry(row.id)}
                      >
                        Sentar
                      </button>
                      <button
                        type="button"
                        className="secondary btn-xs"
                        disabled={busy}
                        onClick={() => startEdit(row)}
                      >
                        Modificar
                      </button>
                      <button
                        type="button"
                        className="secondary btn-xs danger-text"
                        disabled={busy}
                        onClick={() => removeEntry(row.id)}
                      >
                        Eliminar
                      </button>
                    </div>
                  </>
                )}
              </li>
            )
          })}
        </ul>
      ) : null}

      {msg ? (
        <p className={`hint ${msg.type === 'error' ? 'error' : 'ok'}`}>{msg.text}</p>
      ) : null}
    </section>
  )
}
