import { readFileSync, writeFileSync, unlinkSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

const scriptPath = fileURLToPath(import.meta.url)
const repoRoot = resolve(scriptPath, '..', '..', '..')
const outputPath = resolve(repoRoot, 'src/lib/lxmf-api/generated/tauriIpcV2.ts')
const backupPath = `${outputPath}.bak`
const contractPath = resolve(repoRoot, 'docs/contracts/tauri-ipc.v2.json')
const tauriModPath = resolve(repoRoot, 'src-tauri/src/tauri_backend/mod.rs')

const original = readFileSync(outputPath, 'utf8')
writeFileSync(backupPath, original)

execFileSync('bun', ['scripts/contracts/generate-tauri-ipc-bindings.mjs'], {
  cwd: repoRoot,
  stdio: 'inherit',
})

const regenerated = readFileSync(outputPath, 'utf8')
const baseline = readFileSync(backupPath, 'utf8')
unlinkSync(backupPath)

if (baseline !== regenerated) {
  throw new Error('Generated IPC bindings are out of date. Run `bun run contract:generate`.')
}

const contract = JSON.parse(readFileSync(contractPath, 'utf8'))
const tauriMod = readFileSync(tauriModPath, 'utf8')
const registered = collectRegisteredCommands(tauriMod)

const contractLegacy = new Set(normalizeNames(contract?.commands?.legacy ?? []))
const contractV2 = new Set((contract?.commands?.v2 ?? []).map(entry => entry?.name).filter(Boolean))

for (const command of contractLegacy) {
  if (!registered.legacy.has(command)) {
    throw new Error(`Missing legacy command registration in mod.rs: ${command}`)
  }
}

for (const command of contractV2) {
  if (!registered.v2.has(command)) {
    throw new Error(`Missing v2 command registration in mod.rs: ${command}`)
  }
}

for (const command of registered.legacy) {
  if (!contractLegacy.has(command)) {
    throw new Error(`Untracked legacy command in mod.rs handler list: ${command}`)
  }
}

for (const command of registered.v2) {
  if (!contractV2.has(command)) {
    throw new Error(`Untracked v2 command in mod.rs handler list: ${command}`)
  }
}

console.log('IPC bindings are up to date.')

function collectRegisteredCommands(source) {
  const invokeHandlerBlock = source.match(
    /invoke_handler\(tauri::generate_handler!\[([\s\S]*?)\]\)/m
  )
  if (!invokeHandlerBlock) {
    throw new Error('Could not locate tauri::generate_handler! invocation')
  }

  const commandMatches = [
    ...invokeHandlerBlock[1].matchAll(/commands::(?:[a-z_]+::)?([a-zA-Z0-9_]+)/g),
  ]
  const legacy = new Set()
  const v2 = new Set()
  for (const match of commandMatches) {
    const name = match[1]
    if (name.startsWith('v2_')) {
      v2.add(name)
    } else {
      legacy.add(name)
    }
  }
  return { legacy, v2 }
}

function normalizeNames(commands) {
  return commands.map(command => {
    if (typeof command !== 'string') {
      return ''
    }
    return command.includes('::') ? command.split('::').at(-1) : command
  }).filter(Boolean)
}
