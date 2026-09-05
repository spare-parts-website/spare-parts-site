import type { NextConfig } from "next";

const publicStaticCsp = [
  "default-src 'self'",
  // Next 16 SRI keeps these prerendered pages compatible with a strict static
  // policy without requiring a unique nonce (and therefore SSR) per request.
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.supabase.co",
  "font-src 'self'",
  "connect-src 'self' https://*.supabase.co",
  "frame-src 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
  "report-to csp-endpoint",
].join('; ')

const staticPublicSecurityHeaders = [
  { key: 'Content-Security-Policy', value: publicStaticCsp },
  { key: 'Reporting-Endpoints', value: 'csp-endpoint="/api/csp-report"' },
]

const nextConfig: NextConfig = {
  reactStrictMode: false,
  compress: true,
  poweredByHeader: false,
  images: {
    formats: ['image/avif', 'image/webp'],
    minimumCacheTTL: 60 * 60 * 24,
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },
  experimental: {
    // SRI is the strict-CSP path that still permits static generation. Dynamic
    // and private routes keep their request nonce in src/proxy.ts.
    sri: {
      algorithm: 'sha256',
    },
    optimizePackageImports: ['lucide-react', 'date-fns', 'recharts'],
    // Keep already-rendered/prefetched segments in the client router cache so
    // revisiting common pages does not create avoidable RSC round trips.
    staleTimes: {
      dynamic: 300,
      static: 300,
    },
  },
  async headers() {
    return [
      // These exact anonymous routes are safe to prerender and CDN-serve. Their
      // CSP is build-stable, unlike the per-request nonce used elsewhere.
      { source: '/', headers: staticPublicSecurityHeaders },
      { source: '/parts', headers: staticPublicSecurityHeaders },
      { source: '/stores', headers: staticPublicSecurityHeaders },
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
        ],
      },
    ]
  },
  async rewrites() {
    return [
      { source: '/favicon.ico', destination: '/ghyar-market-logo.png' },
      { source: '/ghyar-market-hero.png', destination: '/ghyar-market-hero.webp' },
      { source: '/profile-avatars/classic-car.png', destination: '/profile-avatars/classic-car.webp' },
      { source: '/profile-avatars/electric-car.png', destination: '/profile-avatars/electric-car.webp' },
      { source: '/profile-avatars/fuel-gauge-car.png', destination: '/profile-avatars/fuel-gauge-car.webp' },
      { source: '/profile-avatars/turbocharger.png', destination: '/profile-avatars/turbocharger.webp' },
    ]
  },
};

export default nextConfig;
