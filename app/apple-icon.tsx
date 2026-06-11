import { ImageResponse } from 'next/og';
import {
  J_PATH, J_STROKE, J_COLOR,
  ACCENT_PATH, ACCENT_STROKE, ACCENT_GRAD,
  FACET_PATH, FACET_OPACITY, LOGO_GRAD_CSS,
} from '@/lib/logo';

// iOS home-screen icon — full-bleed square (iOS applies its own mask),
// same machined-steel chevron-J artwork as the favicon and rail avatar.
export const size        = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: LOGO_GRAD_CSS,
        }}
      >
        <svg width="180" height="180" viewBox="0 0 100 100">
          <defs>
            <linearGradient id="steel" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={ACCENT_GRAD[0]} />
              <stop offset="1" stopColor={ACCENT_GRAD[1]} />
            </linearGradient>
          </defs>
          <path d={FACET_PATH} fill="#ffffff" fillOpacity={FACET_OPACITY} />
          <path d={ACCENT_PATH} fill="none" stroke="url(#steel)" strokeWidth={ACCENT_STROKE} />
          <path d={J_PATH} fill="none" stroke={J_COLOR} strokeWidth={J_STROKE} />
        </svg>
      </div>
    ),
    { ...size },
  );
}
