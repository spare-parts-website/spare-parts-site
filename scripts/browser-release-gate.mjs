import { spawn } from 'node:child_process'
import { chromium } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const port = 3100
const baseURL = `http://127.0.0.1:${port}`
const server = spawn(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['start'], {
  env: { ...process.env, PORT: String(port), HOSTNAME: '127.0.0.1' },
  stdio: ['ignore', 'pipe', 'pipe'],
})
server.stdout.on('data', (chunk) => process.stdout.write(chunk))
server.stderr.on('data', (chunk) => process.stderr.write(chunk))

async function waitForServer() {
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    try {
      const response = await fetch(baseURL, { redirect: 'manual' })
      if (response.status < 500) return
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  throw new Error('production server did not become ready')
}

try {
  await waitForServer()
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext()
  try {
    for (const path of ['/', '/parts', '/parts?search=brake', '/stores', '/login']) {
      const page = await context.newPage()
      const browserErrors = []
      page.on('pageerror', (error) => browserErrors.push(`pageerror: ${error.message}`))
      page.on('console', (message) => {
        if (message.type() !== 'error') return
        const text = message.text()
        if (/hydration|content security policy|refused to execute|uncaught/i.test(text)) browserErrors.push(`console: ${text}`)
      })
      const response = await page.goto(`${baseURL}${path}`, { waitUntil: 'domcontentloaded' })
      if (!response || response.status() >= 500) throw new Error(`${path} returned ${response?.status() ?? 'no response'}`)
      const csp = (await response.headerValue('content-security-policy')) || ''
      const scriptDirective = csp.split(';').find((part) => part.trim().startsWith('script-src')) || ''
      if (!/nonce-[^'\s;]+/.test(scriptDirective) || /unsafe-inline/.test(scriptDirective)) throw new Error(`${path} has an invalid nonce script CSP: ${scriptDirective}`)
      await page.waitForTimeout(500)
      if (browserErrors.length) throw new Error(`${path} browser errors:\n${browserErrors.join('\n')}`)
      const accessibility = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
      const blocking = accessibility.violations.filter((violation) => violation.impact === 'critical' || violation.impact === 'serious')
      if (blocking.length) throw new Error(`${path} serious accessibility violations: ${blocking.map((v) => `${v.id}(${v.nodes.length})`).join(', ')}`)
      await page.close()
    }
  } finally {
    await context.close()
    await browser.close()
  }
  console.log('Browser release gate passed')
} finally {
  server.kill('SIGTERM')
}
