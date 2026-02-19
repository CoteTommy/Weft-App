import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(fileURLToPath(import.meta.url), '..', '..', '..')
const allowlistPath = resolve(repoRoot, 'security/audit-allowlist.json')
const allowlist = JSON.parse(readFileSync(allowlistPath, 'utf8'))

const result = spawnSync('bun', ['audit', '--json'], {
  cwd: repoRoot,
  encoding: 'utf8',
})

const output = [result.stdout ?? '', result.stderr ?? ''].join('\n')
const payload = extractJsonPayload(output)
if (!payload) {
  console.error('Unable to parse bun audit JSON output')
  process.exit(1)
}

const findings = flattenFindings(payload)
if (findings.length === 0) {
  console.log('Dependency audit clean: no findings')
  process.exit(0)
}

const failures = []
const warnings = []

for (const finding of findings) {
  const allow = matchAllowlistEntry(finding)
  if (allow) {
    if (isExpired(allow.expiresOn)) {
      failures.push({
        finding,
        reason: `allowlist entry expired on ${allow.expiresOn}`,
      })
      continue
    }
    warnings.push({
      finding,
      reason: `allowlisted until ${allow.expiresOn}: ${allow.reason}`,
    })
    continue
  }

  if (isBlockingSeverity(finding.severity)) {
    failures.push({ finding, reason: 'blocking severity and not allowlisted' })
  } else {
    warnings.push({ finding, reason: 'non-blocking severity' })
  }
}

for (const entry of warnings) {
  console.warn(
    `[WARN] ${entry.finding.package}@${entry.finding.id} (${entry.finding.severity}) ${entry.reason}`
  )
}

if (failures.length > 0) {
  for (const entry of failures) {
    console.error(
      `[FAIL] ${entry.finding.package}@${entry.finding.id} (${entry.finding.severity}) ${entry.reason}`
    )
    console.error(`  ${entry.finding.title}`)
    console.error(`  ${entry.finding.url}`)
  }
  process.exit(1)
}

console.log('Dependency audit policy passed')

function extractJsonPayload(text) {
  const lines = text
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index]
    if (!line.startsWith('{') || !line.endsWith('}')) {
      continue
    }
    try {
      return JSON.parse(line)
    } catch {
      // continue search
    }
  }
  return null
}

function flattenFindings(payload) {
  const findings = []
  for (const [packageName, advisories] of Object.entries(payload)) {
    if (!Array.isArray(advisories)) {
      continue
    }
    for (const advisory of advisories) {
      findings.push({
        package: packageName,
        id: Number(advisory.id),
        severity: String(advisory.severity ?? 'unknown').toLowerCase(),
        title: String(advisory.title ?? 'unknown advisory'),
        url: String(advisory.url ?? ''),
      })
    }
  }
  return findings
}

function matchAllowlistEntry(finding) {
  if (!Array.isArray(allowlist.advisories)) {
    return null
  }
  return (
    allowlist.advisories.find(entry => {
      return Number(entry.id) === finding.id && String(entry.package) === finding.package
    }) ?? null
  )
}

function isBlockingSeverity(severity) {
  return severity === 'critical' || severity === 'high' || severity === 'moderate'
}

function isExpired(expiresOn) {
  if (typeof expiresOn !== 'string') {
    return true
  }
  const expires = new Date(`${expiresOn}T23:59:59Z`)
  if (Number.isNaN(expires.getTime())) {
    return true
  }
  return Date.now() > expires.getTime()
}
