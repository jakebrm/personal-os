import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'the owner\'s OS',
    short_name: 'personal-os',
    description: 'Personal operating system',
    start_url: '/dashboard',
    display: 'standalone',
    background_color: '#0d0f14',
    theme_color: '#0d0f14',
    icons: [
      {
        src: '/icon',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        // Full-bleed square variant — Android crops this into its own mask
        src: '/apple-icon',
        sizes: '180x180',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
