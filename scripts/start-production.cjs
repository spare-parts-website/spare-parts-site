process.env.NODE_ENV = 'production'

const fs = require('node:fs')
const path = require('node:path')
const { spawn } = require('node:child_process')
const standaloneServer = path.join(__dirname, '..', '.next', 'standalone', 'server.js')

if (fs.existsSync(standaloneServer)) {
  require(standaloneServer)
} else {
  // `next build` without `output: 'standalone'` is the default Vercel shape.
  // Keep `npm start` useful for that artifact instead of failing with a
  // misleading missing-module error.
  const nextCli = require.resolve('next/dist/bin/next')
  const child = spawn(process.execPath, [nextCli, 'start', ...process.argv.slice(2)], { stdio: 'inherit', env: process.env })
  child.on('exit', (code, signal) => process.exit(code ?? (signal ? 1 : 0)))
}
