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
        </div>
      </header>

      <p className="muted small admin-email">
        Conectado como <strong>{email}</strong>
      </p>

      <AdminPlanillaPanel />

      <AdminHorarioAvisos />

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
