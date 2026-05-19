/** Barra admin: informes Excel, mostrar/ocultar días pasados y futuros. */
export default function DayViewToolbar({
  reportDate,
  onReportDateChange,
  minDate,
  maxDate,
  showPastDays,
  onTogglePast,
  pastCount = 0,
  showFutureDays = false,
  onToggleFuture,
  futureCount = 0,
  onDownloadDaily,
  onDownloadWeekly,
  downloadBusy = false,
  downloadLabel = 'Informe del día (Excel)',
  weeklyDownloadLabel = 'Informe semana (Excel)',
  showReportDownload = true,
  showWeekDownload = true,
  children,
}) {
  return (
    <div className="day-view-toolbar card subpanel">
      <div className="day-view-toolbar-row">
        {showReportDownload ? (
          <label className="day-view-label">
            Día del informe
            <input
              type="date"
              className="table-input day-view-date-input"
              value={reportDate}
              min={minDate}
              max={maxDate}
              onChange={(e) => onReportDateChange(e.target.value)}
            />
          </label>
        ) : null}
        {showReportDownload ? (
          <button
            type="button"
            className="secondary"
            disabled={downloadBusy}
            onClick={onDownloadDaily}
          >
            {downloadBusy ? 'Generando…' : downloadLabel}
          </button>
        ) : null}
        {showWeekDownload && onDownloadWeekly ? (
          <button
            type="button"
            className="secondary"
            disabled={downloadBusy}
            onClick={onDownloadWeekly}
          >
            {downloadBusy ? 'Generando…' : weeklyDownloadLabel}
          </button>
        ) : null}
        {children}
      </div>
      <div className="day-view-toggles">
        {pastCount > 0 ? (
          <button
            type="button"
            className="link-like day-view-toggle-past"
            onClick={onTogglePast}
            aria-expanded={showPastDays}
          >
            {showPastDays
              ? '− Ocultar días anteriores'
              : `+ Ver ${pastCount} día(s) anterior(es)`}
          </button>
        ) : null}
        {futureCount > 0 ? (
          <button
            type="button"
            className="link-like day-view-toggle-future"
            onClick={onToggleFuture}
            aria-expanded={showFutureDays}
          >
            {showFutureDays
              ? '− Ocultar días posteriores'
              : `+ Ver ${futureCount} día(s) posterior(es)`}
          </button>
        ) : null}
      </div>
      <p className="muted small day-view-toolbar-hint">
        Por defecto solo el día de hoy. Puedes mostrar días anteriores o posteriores
        con los botones de arriba.
      </p>
    </div>
  )
}
