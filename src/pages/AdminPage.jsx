import { Link } from 'react-router-dom'
import BrandLogo from '../components/BrandLogo.jsx'
import AdminPlanillaPanel from '../components/AdminPlanillaPanel.jsx'
import AdminHorarioAvisos from '../components/AdminHorarioAvisos.jsx'

export default function AdminPage({ session, onSignOut }) {
  const email = session?.user?.email ?? ''

  return (
    <div className="shell admin-shell">
      <header className="header admin-head admin-head-row">
        <Link to="/inicio" className="link-btn admin-back">
          ← Atrás
        </Link>
        <BrandLogo className="brand-logo-lg" />
        <div className="admin-head-text">
          <h1>Administración</h1>
          <p className="muted">Planilla, plantilla del evento y avisos de horario.</p>
        </div>
      </header>

      <p className="muted small admin-email">
        Conectado como <strong>{email}</strong>
      </p>

      <AdminPlanillaPanel />

      <AdminHorarioAvisos />

      <section className="card admin-card">
        <p className="label-up">Resumen cobros global</p>
        <p className="muted small">
          El detalle con tarifas por minuto y días del evento sigue en la pestaña{' '}
          <strong>Resumen cobro</strong> de cada trabajador. Aquí puedes gestionar la planilla y
          los avisos; si más adelante quieres una tabla maestra editable por encargado con todos
          los nombres y euros por día, la añadimos encima de los datos ya guardados en Supabase.
        </p>
      </section>

      <nav className="admin-nav">
        <Link to="/inicio" className="link-btn">
          Volver al inicio
        </Link>
        <button type="button" className="secondary" onClick={onSignOut}>
          Cerrar sesión
        </button>
      </nav>
    </div>
  )
}
