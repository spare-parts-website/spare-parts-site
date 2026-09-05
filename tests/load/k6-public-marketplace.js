import http from 'k6/http'
import { check, sleep } from 'k6'

const BASE_URL = (__ENV.TARGET_URL || 'http://localhost:3000').replace(/\/$/, '')
const IS_PRODUCTION = /(^|\.)ghyarmarket-eg\.com$/i.test(new URL(BASE_URL).hostname)

if (IS_PRODUCTION && __ENV.ALLOW_PRODUCTION_LOAD !== '1') {
  throw new Error('Refusing to stress production. Set ALLOW_PRODUCTION_LOAD=1 only when you intentionally want to load-test ghyarmarket-eg.com.')
}

export const options = {
  discardResponseBodies: true,
  stages: [
    { duration: '30s', target: 1 },
    { duration: '1m', target: 25 },
    { duration: '1m', target: 50 },
    { duration: '1m', target: 100 },
    { duration: '1m', target: 200 },
    { duration: '1m', target: 400 },
    { duration: '2m', target: 800 },
    { duration: '1m', target: 0 },
  ],
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<2000'],
    'http_req_duration{route:home}': ['p(95)<1000'],
    'http_req_duration{route:home-data}': ['p(95)<1000'],
    'http_req_duration{route:parts-page}': ['p(95)<1500'],
    'http_req_duration{route:parts-api}': ['p(95)<1500'],
    'http_req_duration{route:search}': ['p(95)<3000'],
  },
}

function request(path, route) {
  const response = http.get(`${BASE_URL}${path}`, {
    tags: { route },
    timeout: '15s',
    headers: {
      Accept: route.includes('api') || route === 'home-data' || route === 'search'
        ? 'application/json'
        : 'text/html,application/xhtml+xml',
    },
  })
  check(response, {
    [`${route}: status 200`]: (res) => res.status === 200,
  })
}

export default function publicMarketplaceLoad() {
  // Model a mixed anonymous marketplace session rather than 800 tight loops on
  // one endpoint. The distribution still makes the homepage the hottest path.
  const pick = Math.random()
  if (pick < 0.45) {
    request('/', 'home')
  } else if (pick < 0.60) {
    request('/api/home-marketplace', 'home-data')
  } else if (pick < 0.75) {
    request('/parts', 'parts-page')
  } else if (pick < 0.90) {
    request('/api/parts?sort=newest&page=1', 'parts-api')
  } else {
    request('/api/parts?search=toyota&sort=newest&page=1', 'search')
  }

  // Real people read/scroll between requests. This prevents the benchmark from
  // measuring an artificial denial-of-service loop instead of user capacity.
  sleep(1 + Math.random() * 3)
}
