import { createHash } from 'node:crypto'
import { expect, it } from 'vitest'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { validateAcceptanceCoverage, validateCoreFiles } from '../scripts/acceptance-ledger.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))
it('reports missing execution evidence instead of declaring a covered contract passed', () => {
  const reports = mkdtempSync(join(tmpdir(), 'allflame-absent-evidence-'))
  try {
    const result = validateAcceptanceCoverage(root, reports)
    expect(result.ok).toBe(false)
    expect(result.issues.join('\n')).toContain('Missing execution report')
  } finally { rmSync(reports, { recursive: true, force: true }) }
})
it('reports absent required fixtures rather than skipping the affected scenario', () => {
  const emptyRoot = mkdtempSync(join(tmpdir(), 'allflame-absent-fixtures-'))
  try {
    mkdirSync(join(emptyRoot, 'docs/acceptance'), { recursive: true })
    for (const file of ['coverage.json', 'port.feature']) copyFileSync(join(root, 'docs/acceptance', file), join(emptyRoot, 'docs/acceptance', file))
    const result = validateAcceptanceCoverage(emptyRoot, emptyRoot)
    expect(result.ok).toBe(false)
    expect(result.issues.join('\n')).toContain('Missing required fixture/test: tests/fixtures/acceptance/strategy-alc.json')
  } finally { rmSync(emptyRoot, { recursive: true, force: true }) }
})

it.each([
  { importedRealCharts: 2, incomplete: true },
  { importedRealCharts: 5, incomplete: false },
])('requires current five-chart Windows evidence, not historical two-chart proof: $importedRealCharts', ({ importedRealCharts, incomplete }) => {
  const isolatedRoot = mkdtempSync(join(tmpdir(), 'allflame-windows-scope-'))
  try {
    mkdirSync(join(isolatedRoot, 'docs/acceptance/evidence'), { recursive: true })
    const contract = JSON.parse(readFileSync(join(root, 'docs/acceptance/coverage.json'), 'utf8'))
    contract.requiredWindowsImportedCharts = 5
    writeFileSync(join(isolatedRoot, 'docs/acceptance/coverage.json'), JSON.stringify(contract))
    copyFileSync(join(root, 'docs/acceptance/port.feature'), join(isolatedRoot, 'docs/acceptance/port.feature'))
    const evidence = JSON.parse(readFileSync(join(root, contract.windowsEvidence), 'utf8'))
    evidence.importedRealCharts = importedRealCharts
    writeFileSync(join(isolatedRoot, contract.windowsEvidence), JSON.stringify(evidence))
    // Supply the group's independent local deployment stage, so its badge
    // depends on whether Windows evidence matches the required client scope.
    writeFileSync(join(isolatedRoot, 'stages.json'), JSON.stringify({ stages: [{ name: 'deployment', status: 'passed', testCount: 4 }] }))
    const result = validateAcceptanceCoverage(isolatedRoot, isolatedRoot)
    expect(result.issues.includes('Windows target evidence incomplete')).toBe(incomplete)
    expect(result.groups.find((group) => group.id === 'G27')?.automated).toBe(incomplete ? 'incomplete' : 'passed')
    if (!incomplete) {
      const firstRun = JSON.parse(readFileSync(join(root, 'docs/acceptance/evidence/windows-five-green-1.json'), 'utf8'))
      writeFileSync(join(isolatedRoot, contract.windowsEvidence), JSON.stringify(firstRun))
      expect(validateAcceptanceCoverage(isolatedRoot, isolatedRoot).issues).not.toContain('Windows target evidence incomplete')
      delete evidence.windowsDesktopClipboard
      writeFileSync(join(isolatedRoot, contract.windowsEvidence), JSON.stringify(evidence))
      const missingDesktopProof = validateAcceptanceCoverage(isolatedRoot, isolatedRoot)
      expect(missingDesktopProof.issues).toContain('Windows target evidence incomplete')
      expect(missingDesktopProof.groups.find((group) => group.id === 'G27')?.automated).toBe('incomplete')
    }
  } finally { rmSync(isolatedRoot, { recursive: true, force: true }) }
})

it('accepts reviewed solver bytes only with passing revision regressions and never replaces the scoring baseline', () => {
  const isolatedRoot = mkdtempSync(join(tmpdir(), 'allflame-core-revision-'))
  try {
    writeFileSync(join(isolatedRoot, 'solver.ts'), 'reviewed solver')
    writeFileSync(join(isolatedRoot, 'scoring.ts'), 'changed scoring')
    const sha = (text: string) => createHash('sha256').update(text).digest('hex')
    const contract = { coreFiles: [{ path: 'solver.ts', sha256: sha('old solver') }, { path: 'scoring.ts', sha256: sha('old scoring') }],
      coreFileRevisions: [{ version: 'v1', path: 'solver.ts', previousSha256: sha('old solver'), sha256: sha('reviewed solver'), authorization: 'explicit user authorization',
        tests: [{ suite: 'unit', file: 'regression.ts', nameIncludes: 'independent behavior' }] }] }
    const proof = [{ suite: 'unit', file: 'regression.ts', title: 'independent behavior', passed: true }]
    expect(validateCoreFiles(isolatedRoot, contract, proof)).toEqual(['Core algorithm changed: scoring.ts'])
    for (const missing of [[], [{ ...proof[0], passed: false }]]) expect(validateCoreFiles(isolatedRoot, contract, missing)).toContain('Core algorithm changed: solver.ts')
    writeFileSync(join(isolatedRoot, 'solver.ts'), 'unreviewed solver')
    expect(validateCoreFiles(isolatedRoot, contract, proof)).toContain('Core algorithm changed: solver.ts')
    expect(contract.coreFiles[0].sha256).toBe(sha('old solver'))
  } finally { rmSync(isolatedRoot, { recursive: true, force: true }) }
})
