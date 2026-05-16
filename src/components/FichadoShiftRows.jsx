import { formatHoursMinutes } from '../lib/payCompute.js'

function fmtClock(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleTimeString('es-ES', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** @param {{ shifts: Array<{ inAt: Date, outAt: Date|null, open?: boolean, hoursOnDay: number }> }} props */
export default function FichadoShiftRows({ shifts }) {
  if (!shifts?.length) return null
  return (
    <div className="fichado-stack">
      {shifts.map((seg, i) => (
        <ShiftRow key={i} seg={seg} />
      ))}
    </div>
  )
}

function ShiftRow({ seg }) {
  return (
    <div className={`fichado-shift-row${seg.open ? ' fichado-shift-row--open' : ''}`}>
      <span>
        <span className="badge-in badge-fich-in">E</span>{' '}
        <span className="time-strong">{fmtClock(seg.inAt.toISOString())}</span>
      </span>
      <span className="fichado-shift-mid muted">→</span>
      {seg.open ? (
        <span className="fichado-shift-open">
          <span className="badge-out badge-fich-out badge-fich-pending">S</span>{' '}
          <span className="muted small">pendiente (falta picar salida)</span>
        </span>
      ) : (
        <>
          <span>
            <span className="badge-out badge-fich-out">S</span>{' '}
            <span className="time-strong">{fmtClock(seg.outAt.toISOString())}</span>
          </span>
          <span className="fichado-shift-hours">
            <strong>{formatHoursMinutes(seg.hoursOnDay)}</strong>
          </span>
        </>
      )}
    </div>
  )
}
