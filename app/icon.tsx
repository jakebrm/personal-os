import { ImageResponse } from 'next/og';
import {
  J_PATH, J_STROKE, J_COLOR,
  ACCENT_PATH, ACCENT_STROKE, ACCENT_GRAD,
  FACET_PATH, FACET_OPACITY, LOGO_GRAD_CSS,
} from '@/lib/logo';

// Favicon / manifest 512 — the machined-steel chevron-J (same paths as
// LogoMark). Rounded with transparent corners so the browser tab shows
// a squircle.
export const size        = { width: 512, height: 512 };
export const contentType = 'image/png';

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'transparent',
        }}
      >
        <div
          style={{
            width: 512,
            height: 512,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 150,
            overflow: 'hidden',
            background: LOGO_GRAD_CSS,
          }}
        >
          <svg width="512" height="512" viewBox="0 0 100 100">
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
      </div>
    ),
    { ...size },
  );
}
