import type { NextConfig } from "next";

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
    optimizePackageImports: ['lucide-react', 'date-fns', 'recharts'],
    // Top-level pages are dynamic because the root layout carries a per-request
    // CSP nonce. Keep already-rendered/prefetched page segments in the client
    // router cache so revisiting Home/Parts/Stores/Support does not trigger a
    // fresh server round-trip on every click.
    staleTimes: {
      dynamic: 300,
      static: 300,
    },
  },
  async headers() {
    return [
      {
        source: '/parts/:path*',
        headers: [{ key: 'Cache-Control', value: 'public, s-maxage=30, stale-while-revalidate=120' }],
      },
      {
        source: '/stores/:path*',
        headers: [{ key: 'Cache-Control', value: 'public, s-maxage=30, stale-while-revalidate=120' }],
      },
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
