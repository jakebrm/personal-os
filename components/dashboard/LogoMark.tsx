import {
  J_PATH, J_STROKE, J_COLOR,
  ACCENT_PATH, ACCENT_STROKE, ACCENT_GRAD,
  FACET_PATH, FACET_OPACITY, LOGO_GRAD_STOPS,
} from '@/lib/logo';

// In-app rendering of the machined-steel chevron-J mark (rail avatar etc.).
// The icon generators (app/icon.tsx, app/apple-icon.tsx) draw the same
// paths from lib/logo.ts, so browser tab, home screen, and rail all match.
export function LogoMark({ size = 38, radius = 30 }: { size?: number; radius?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-label="Personal OS" role="img">
      <defs>
        <linearGradient id="jos-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0"   stopColor={LOGO_GRAD_STOPS[0]} />
          <stop offset=".48" stopColor={LOGO_GRAD_STOPS[1]} />
          <stop offset="1"   stopColor={LOGO_GRAD_STOPS[2]} />
        </linearGradient>
        <linearGradient id="jos-steel" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={ACCENT_GRAD[0]} />
          <stop offset="1" stopColor={ACCENT_GRAD[1]} />
        </linearGradient>
        <clipPath id="jos-clip">
          <rect width="100" height="100" rx={radius} />
        </clipPath>
      </defs>
      <rect width="100" height="100" rx={radius} fill="url(#jos-bg)" />
      {/* 22° matte facet band, clipped to the squircle */}
      <path d={FACET_PATH} fill="#ffffff" fillOpacity={FACET_OPACITY} clipPath="url(#jos-clip)" />
      {/* hairline steel edge */}
      <rect x="1" y="1" width="98" height="98" rx={radius - 1} fill="none" stroke="#ffffff" strokeOpacity=".09" strokeWidth="2" />
      <path d={ACCENT_PATH} fill="none" stroke="url(#jos-steel)" strokeWidth={ACCENT_STROKE} />
      <path d={J_PATH} fill="none" stroke={J_COLOR} strokeWidth={J_STROKE} />
    </svg>
  );
}
