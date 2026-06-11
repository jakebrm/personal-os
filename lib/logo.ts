// The personal-os mark v3 — "machined steel" chevron-J. Pure neutrals so it
// sits next to any accent color: matte off-white J, polished-silver
// chevron blade (vertical light-catch gradient), gunmetal base with a
// 22° facet highlight echoing the dashboard's chevron sweep. Squared
// cuts, matte surfaces, no gloss-candy. Shared by the rail avatar,
// favicon, apple icon, and PWA manifest icons so every surface renders
// the identical artwork. ViewBox is 0 0 100 100.

// J body — squared caps, stem under the chevron, hook sweeping left
export const J_PATH   = 'M62 38 L62 58 A15 15 0 0 1 32 58 L32 51';
export const J_STROKE = 13;
export const J_COLOR  = '#e9ecf1';   // matte off-white

// Upward chevron riding the stem top — polished steel blade,
// light falling from above
export const ACCENT_PATH   = 'M48 30 L62 16 L76 30';
export const ACCENT_STROKE = 10;
export const ACCENT_GRAD: [string, string] = ['#f8fafc', '#99a3b3'];

// Angular facet band across the base — same 22° angle as the dashboard's
// background chevron sweep, a matte catch-light rather than a gloss
export const FACET_PATH    = 'M0 79 L100 39 L100 26 L0 66 Z';
export const FACET_OPACITY = 0.055;

// Gunmetal diagonal base
export const LOGO_GRAD_STOPS: [string, string, string] = ['#2e3540', '#161b22', '#07090d'];
export const LOGO_GRAD_CSS =
  `linear-gradient(135deg, ${LOGO_GRAD_STOPS[0]} 0%, ${LOGO_GRAD_STOPS[1]} 48%, ${LOGO_GRAD_STOPS[2]} 100%)`;

export const LOGO_BG_DARK = '#0d0f14'; // manifest background/theme color
