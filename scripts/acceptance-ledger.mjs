import { verificationInputDigest } from './verification-inputs.mjs'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { createHash } from 'node:crypto'

/** Public acceptance boundary: absent data/reports and skipped/failed cases are
 * failures. This validates observed execution, never marks game fieldwork done. */
export function validateAcceptanceCoverage(root, reportDir) {
  const issues = []
  const read = (path, label) => {
    if (!existsSync(path)) { issues.push(`Missing ${label}: ${path}`); return null }
    try { return JSON.parse(readFileSync(path, 'utf8')) } catch { issues.push(`Invalid ${label}: ${path}`); return null }
  }
  const contract = read(resolve(root, 'docs/acceptance/coverage.json'), 'coverage contract')
  if (!contract) return { ok: false, issues }
  const featurePath = resolve(root, 'docs/acceptance/port.feature')
  const titles = existsSync(featurePath) ? [...readFileSync(featurePath, 'utf8').matchAll(/^  场景(?:大纲)?: (.+)$/gm)].map((match) => match[1]) : []
  if (titles.length !== 27 || JSON.stringify(titles) !== JSON.stringify(contract.groups.map((group) => group.title))) issues.push('27 scenario-group contract mismatch')
  const stories = contract.stories.map((story) => story.id)
  if (stories.length !== 7 || new Set(stories).size !== 7 || stories.some((id) => !contract.groups.some((group) => group.stories.includes(id)))) issues.push('Seven-story coverage mismatch')
  const files = new Set([...contract.requiredFixtures, ...contract.groups.flatMap((group) => [...group.fixtures, ...group.tests.map((ref) => ref.file)])])
  for (const file of files) if (!existsSync(resolve(root, file))) issues.push(`Missing required fixture/test: ${file}`)
  const unit = read(resolve(reportDir, 'unit.json'), 'execution report')
  const browser = read(resolve(reportDir, 'browser.json'), 'execution report')
  const stages = read(resolve(reportDir, 'stages.json'), 'execution report')
  if (stages) {
    try { if (stages.inputSha256 !== verificationInputDigest(root)) issues.push('Stale execution reports: verification inputs changed') }
    catch { issues.push('Cannot fingerprint required verification inputs') }
  }
  for (const name of contract.requiredStages) if (!stages?.stages?.some((stage) => stage.name === name && stage.status === 'passed')) issues.push(`Stage did not pass: ${name}`)
  const observations = []
  for (const suite of unit?.testResults ?? []) for (const assertion of suite.assertionResults ?? []) observations.push({ suite: 'unit', file: suite.name, title: assertion.fullName, passed: assertion.status === 'passed' })
  const browserCases = (suites) => {
    for (const suite of suites ?? []) {
      for (const spec of suite.specs ?? []) observations.push({ suite: 'browser', file: resolve(browser.config?.rootDir ?? resolve(root, 'tests/browser'), spec.file ?? suite.file), title: spec.title, passed: spec.tests?.length > 0 && spec.tests.every((test) => test.status === 'expected' && test.expectedStatus === 'passed' && test.results?.length > 0 && test.results.every((result) => result.status === 'passed')) })
      browserCases(suite.suites)
    }
  }
  browserCases(browser?.suites)
  issues.push(...validateCoreFiles(root, contract, observations))
  if (!observations.length || observations.some((item) => !item.passed)) issues.push('Absent, failed or skipped observed unit/browser test')
  if (!unit?.success || unit.numPendingTests || unit.numFailedTests) issues.push('Unit execution incomplete')
  if (!browser?.stats || browser.stats.unexpected || browser.stats.skipped || browser.stats.flaky || browser.errors?.length) issues.push('Browser execution incomplete')
  const windows = read(resolve(root, contract.windowsEvidence), 'Windows evidence')
  const desktop = windows?.windowsDesktopClipboard
  const windowsComplete = !!(
    windows?.targetWindows === true && windows.certificateBypass === false && windows.secureContext === true
    && windows.importedRealCharts === contract.requiredWindowsImportedCharts
    && windows.refreshedInventory === contract.requiredWindowsImportedCharts
    && windows.failedResources === 0 && windows.actualWindowsClipboardWrite === true
    && windows.nativeClipboardImplementation === true && windows.clipboardWriteAcknowledgement === 'fulfilled'
    && desktop?.MatchesExpected === true && desktop.Empty === false && desktop.Session > 0
    && desktop.ClipboardOwner === 'msedge' && desktop.OwnerPid > 0
    && typeof desktop.OwnText === 'string' && desktop.OwnText.length > 0 && desktop.OwnText === windows.placementGuideClipboard
    && windows.cleanup?.TaskRemoved === true && windows.cleanup.ProfileRemoved === true
    && windows.cleanup.RemainingOwnProcesses === 0 && windows.cleanup.SshTunnelClosed === true
    && windows.cleanup.NativeClipboardProbeRemoved === true
  )
  if (!windowsComplete) issues.push('Windows target evidence incomplete')
  const groups = contract.groups.map((group) => {
    const verified = group.tests.every((ref) => {
      if (ref.suite === 'deployment') return stages?.stages?.some((stage) => stage.name === 'deployment' && stage.status === 'passed' && stage.testCount >= 4)
      if (ref.suite === 'windows') return windowsComplete && !!windows?.[ref.nameIncludes]
      const matches = observations.filter((test) => test.suite === ref.suite && test.file?.endsWith(ref.file) && test.title?.includes(ref.nameIncludes))
      if (matches.length < (ref.minCases ?? 1) || matches.some((test) => !test.passed)) { issues.push(`Missing passing evidence ${group.id}: ${ref.file} / ${ref.nameIncludes}`); return false }
      return true
    })
    return { id: group.id, title: group.title, automated: verified ? 'passed' : 'incomplete', field: group.fieldStatus }
  })
  if (groups.some((group) => group.automated !== 'passed')) issues.push('Scenario group evidence incomplete')
  return { ok: issues.length === 0, status: issues.length ? 'automated-incomplete; field-pending' : 'automated-passed; field-pending', issues, groups, stories, observedTests: observations.length, fieldCheckpoint: contract.fieldCheckpoint, windows: { startedUtc: windows?.startedUtc, deployedIntegration: windows?.deployedIntegration, gameSearch: windows?.gameSearch } }
}

/** A reviewed revision supplements the immutable historical fingerprint only
 * when both its exact bytes and independent passing regressions are present. */
export function validateCoreFiles(root, contract, observations) {
  return contract.coreFiles.flatMap((file) => {
    const path = resolve(root, file.path)
    const digest = existsSync(path) ? createHash('sha256').update(readFileSync(path)).digest('hex') : null
    if (digest === file.sha256) return []
    const revision = (contract.coreFileRevisions ?? []).find((entry) =>
      entry.path === file.path && entry.previousSha256 === file.sha256 && entry.sha256 === digest)
    const supported = revision?.version && revision.authorization && revision.tests?.length > 0 && revision.tests.every((ref) => {
      const cases = observations.filter((test) => test.suite === ref.suite && test.file?.endsWith(ref.file) && test.title?.includes(ref.nameIncludes))
      return cases.length > 0 && cases.every((test) => test.passed)
    })
    return supported ? [] : [`Core algorithm changed: ${file.path}`]
  })
}
