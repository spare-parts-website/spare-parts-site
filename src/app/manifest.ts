import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'غيار ماركت', short_name: 'غيار ماركت', description: 'سوق قطع غيار السيارات في مصر',
    start_url: '/', display: 'standalone', background_color: '#07111f', theme_color: '#00c768',
    lang: 'ar', dir: 'rtl',
    icons: [
      { src: '/ghyar-market-logo.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/ghyar-market-logo.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: 'قطع الغيار', short_name: 'القطع', url: '/parts', icons: [{ src: '/ghyar-market-logo.png', sizes: '512x512' }] },
      { name: 'طلباتي', short_name: 'طلباتي', url: '/account/orders', icons: [{ src: '/ghyar-market-logo.png', sizes: '512x512' }] },
    ],
  }
}
