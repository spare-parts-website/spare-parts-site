const fs = require('fs/promises')
const path = require('path')

async function main() {
  const root = process.cwd()
  const standalone = path.join(root, '.next', 'standalone')
  await fs.cp(path.join(root, '.next', 'static'), path.join(standalone, '.next', 'static'), {
    recursive: true,
    force: true,
  })
  await fs.cp(path.join(root, 'public'), path.join(standalone, 'public'), {
    recursive: true,
    force: true,
  })
  console.log('Standalone assets copied.')
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
