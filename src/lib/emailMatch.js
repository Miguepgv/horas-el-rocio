/**
 * PostgREST ILIKE trata % y _ como comodines; escapamos para coincidencia literal.
 * @param {string} s
 */
export function escapeForILikeExact(s) {
  return String(s ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/%/g, '\\%')
    .replace(/_/g, '\\_')
}
