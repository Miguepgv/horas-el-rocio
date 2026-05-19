import { lazy, Suspense, useState } from 'react'
import { Link } from 'react-router-dom'
import BrandLogo from '../components/BrandLogo.jsx'
import AdminPlanillaPanel from '../components/AdminPlanillaPanel.jsx'
import AdminHorarioAvisos from '../components/AdminHorarioAvisos.jsx'

const AdminListaEspera = lazy(() => import('../components/AdminListaEspera.jsx'))

export default function AdminPage({ session, onSignOut }) {
  const email = session?.user?.email ?? ''
  const [adminTab, setAdminTab] = useState('gestion')

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

      <div className="tabs-bar admin-page-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={adminTab === 'gestion'}
          className={adminTab === 'gestion' ? 'tab active' : 'tab'}
          onClick={() => setAdminTab('gestion')}
        >
          Planilla y avisos
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={adminTab === 'lista'}
          className={adminTab === 'lista' ? 'tab active' : 'tab'}
          onClick={() => setAdminTab('lista')}
        >
          Lista de espera
        </button>
      </div>

      {adminTab === 'gestion' ? (
        <>
          <AdminPlanillaPanel />
          <AdminHorarioAvisos />
        </>
      ) : (
        <Suspense fallback={<p className="muted">Cargando lista de espera…</p>}>
          <AdminListaEspera />
        </Suspense>
      )}

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
