import { BRAND_LOGO_URL, BRAND_NAME } from '../lib/brand'

export default function BrandLogo({ className = '' }) {
  return (
    <img
      src={BRAND_LOGO_URL}
      alt={BRAND_NAME}
      className={`brand-logo ${className}`.trim()}
      loading="lazy"
      decoding="async"
    />
  )
}
