// Requires explicit authorization to operate this Windows desktop over SSH.
// Uses its installed Edge and OS certificate trust; no certificate bypass.
import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { once } from 'node:events'
import { chromium } from '@playwright/test'

const alias = process.env.WINDOWS_SSH_ALIAS ?? 'opensonic-windows-runner'
const url = process.env.WINDOWS_SITE_URL ?? 'https://192.168.1.8:8443'
const port = Number(process.env.WINDOWS_CDP_PORT ?? 19383)
assert.ok(Number.isInteger(port) && port > 1024 && port < 65536)
const name = `AllflameEdgeAcceptance-${randomUUID().replaceAll('-', '')}`
const remote = (script) => {
  const wrapper = `[Console]::OutputEncoding=[Text.UTF8Encoding]::new(); $ErrorActionPreference='Stop'; $ProgressPreference='SilentlyContinue'; Invoke-Expression ([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String([Console]::In.ReadToEnd())))`
  const encoded = Buffer.from(wrapper, 'utf16le').toString('base64')
  return execFileSync('ssh', ['-o', 'BatchMode=yes', alias, `powershell.exe -NoProfile -EncodedCommand ${encoded}`], { input: Buffer.from(script, 'utf8').toString('base64'), encoding: 'utf8', timeout: 30000 }).trim()
}
let browser
let tunnel
let info
const report = { deployedIntegration: process.env.DEPLOYED_INTEGRATION ?? null, runnerSha256: createHash('sha256').update(readFileSync(new URL(import.meta.url))).digest('hex'), url, startedUtc: new Date().toISOString(), targetWindows: true, certificateBypass: false }
try {
  info = JSON.parse(remote(`
    $edge = @("\${env:ProgramFiles(x86)}\\Microsoft\\Edge\\Application\\msedge.exe", "$env:ProgramFiles\\Microsoft\\Edge\\Application\\msedge.exe") | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
    if (!$edge) { throw 'Installed Microsoft Edge not found' }
    if (Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue) { throw 'Requested CDP port is already in use' }
    $edgeProfileDir = Join-Path $env:TEMP '${name}'
    $arguments = '--remote-debugging-port=${port} --remote-debugging-address=127.0.0.1 --user-data-dir="' + $edgeProfileDir + '" --no-first-run --no-default-browser-check --new-window about:blank'
    $action = New-ScheduledTaskAction -Execute $edge -Argument $arguments
    $principal = New-ScheduledTaskPrincipal -UserId (whoami) -LogonType Interactive -RunLevel Limited
    Register-ScheduledTask -TaskName '${name}' -Action $action -Principal $principal | Out-Null
    Start-ScheduledTask -TaskName '${name}'
    $version = $null
    for ($i=0; $i -lt 40; $i++) {
      Start-Sleep -Milliseconds 250
      try { $version = Invoke-RestMethod -Uri 'http://127.0.0.1:${port}/json/version'; break } catch {}
    }
    if (!$version) { throw 'Temporary Edge CDP did not start' }
    $addresses = @(Get-NetTCPConnection -LocalPort ${port} -State Listen | ForEach-Object { $_.LocalAddress })
    if (@($addresses | Where-Object { $_ -ne '127.0.0.1' -and $_ -ne '::1' }).Count) { throw 'CDP is not restricted to loopback' }
    @{ Edge=$version.Browser; UserAgent=$version.'User-Agent'; Loopback=$addresses; Profile=$edgeProfileDir } | ConvertTo-Json -Compress
  `))
  tunnel = spawn('ssh', ['-o', 'BatchMode=yes', '-o', 'ExitOnForwardFailure=yes', '-N', '-L', `127.0.0.1:${port}:127.0.0.1:${port}`, alias], { stdio: ['ignore', 'ignore', 'pipe'] })
  let tunnelError = ''
  tunnel.stderr.on('data', (data) => { tunnelError += data })
  for (let attempt = 0; attempt < 40; attempt++) {
    await new Promise((done) => setTimeout(done, 250))
    if (tunnel.exitCode !== null) throw Error(`SSH tunnel exited: ${tunnelError}`)
    try { browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`, { timeout: 1500 }); break } catch { /* wait for tunnel */ }
  }
  assert.ok(browser, 'Unable to connect to the isolated Windows Edge')
  const context = browser.contexts()[0]
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(url).origin })
  const page = context.pages()[0] ?? await context.newPage()
  const failures = []
  const badResponses = []
  page.on('requestfailed', (request) => failures.push(`${request.url()}: ${request.failure()?.errorText}`))
  page.on('response', (response) => { if (response.status() >= 400) badResponses.push(`${response.status()} ${response.url()}`) })
  const response = await page.goto(url, { waitUntil: 'networkidle' })
  assert.equal(response.status(), 200)
  const environment = await page.evaluate(() => ({ origin: location.origin, secureContext: window.isSecureContext, clipboardWrite: typeof navigator.clipboard?.writeText, userAgent: navigator.userAgent }))
  assert.equal(environment.origin, new URL(url).origin)
  assert.equal(environment.secureContext, true)
  assert.equal(environment.clipboardWrite, 'function')
  assert.match(environment.userAgent, /Windows NT.*Edg\//)
  await page.locator('.onboard-actions button').last().click()
  const samples = readFileSync(new URL('../../samples/charted.zh-CN.txt', import.meta.url), 'utf8')
  const extraSamples = readFileSync(new URL('../../samples/charted-extra-shapes.zh-CN.txt', import.meta.url), 'utf8')
  await page.locator('.import-panel textarea[placeholder]').fill(`${samples}\n${extraSamples}`)
  await page.locator('.import-actions button').first().click()
  await page.locator('.chart-grid .chart-sq').nth(4).waitFor()
  assert.equal(await page.locator('.chart-grid .chart-sq').count(), 5)
  // Select the original chart by its visible name, independent of value sorting.
  await page.locator('.library-tools button').click()
  const shapeLabels = await page.locator('.chart-location').allTextContents()
  assert.deepEqual(shapeLabels.map((text) => text.trim()).sort(), [
    '蛤蜊海架 · 端点', '深渊平原 · 直线', '海底山脊 · 角落', '深渊平原 · 节点', '海底林地 · 交叉',
  ].sort())
  const chosen = page.locator('.chart-card').filter({ hasText: '航海 冒险 珊瑚暗礁海图' })
  await chosen.click()
  assert.ok((await chosen.getAttribute('class')).split(/\s+/).includes('selected'))
  const selectedChartName = await chosen.locator('.chart-name').textContent()
  assert.equal(selectedChartName, '航海 冒险 珊瑚暗礁海图')
  await page.locator('.library-tools button').click()
  await page.locator('.tile').first().click()
  await page.locator('.copy-into-game').click()
  const guideChartName = await page.locator('.copyseq .pc-name').textContent()
  assert.equal(guideChartName, selectedChartName)
  await page.evaluate(() => {
    window.clipboardNativeBeforeProbe = navigator.clipboard.writeText.toString().includes('[native code]') && navigator.clipboard.readText.toString().includes('[native code]')
    const original = navigator.clipboard.writeText.bind(navigator.clipboard)
    window.clipboardAcknowledgement = { state: 'not-called' }
    Object.defineProperty(navigator.clipboard, 'writeText', { configurable: true, value: (text) => {
      const attempt = { text, state: 'pending', focused: document.hasFocus() }
      window.clipboardAcknowledgement = attempt
      const result = original(text)
      result.then(() => { attempt.state = 'fulfilled' }, (error) => { attempt.state = 'rejected'; attempt.error = `${error.name}: ${error.message}` })
      return result
    } })
  })
  assert.equal(await page.evaluate(() => window.clipboardNativeBeforeProbe), true, 'Clipboard reads and writes must use the real native API')
  await page.bringToFront()
  await page.locator('.copyseq-go').click()
  await page.waitForFunction(() => ['fulfilled', 'rejected'].includes(window.clipboardAcknowledgement.state), { timeout: 3000 })
  const acknowledgement = await page.evaluate(() => window.clipboardAcknowledgement)
  assert.equal(acknowledgement.state, 'fulfilled', `Native clipboard write failed: ${acknowledgement.error ?? acknowledgement.state}`)
  assert.equal(acknowledgement.focused, true)
  const expectedSearch = '航海 冒险 珊瑚暗礁海图 相邻区域包含 8(8-10) 个额外的螃蟹群 — 数值不可调整 区域等级 83'
  assert.equal(acknowledgement.text, expectedSearch)
  let chartSearch = ''
  let readAttempts = 0
  for (; readAttempts < 30; readAttempts++) {
    chartSearch = await page.evaluate(() => navigator.clipboard.readText())
    if (chartSearch === expectedSearch) break
    await page.waitForTimeout(100)
  }
  assert.equal(chartSearch, expectedSearch, 'The real native browser read must return the exact independently expected text')
  const attemptedText = expectedSearch
  const taskProbeName = `${name}-ClipboardProbe`
  const probeFile = `${info.Profile.replaceAll('\\', '/')}/clipboard-probe.json`
  const expectedBase64 = Buffer.from(attemptedText, 'utf8').toString('base64')
  const nativeCode = String.raw`using System;
using System.IO;
using System.Text;
using System.Diagnostics;
using System.Runtime.InteropServices;
public static class ClipboardProbe {
 [DllImport("user32.dll")] static extern bool OpenClipboard(IntPtr owner);
 [DllImport("user32.dll")] static extern bool CloseClipboard();
 [DllImport("user32.dll")] static extern IntPtr GetClipboardData(uint format);
 [DllImport("user32.dll")] static extern IntPtr GetClipboardOwner();
 [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint pid);
 [DllImport("kernel32.dll")] static extern IntPtr GlobalLock(IntPtr memory);
 [DllImport("kernel32.dll")] static extern bool GlobalUnlock(IntPtr memory);
 static string J(string text) { return "\"" + text.Replace("\\", "\\\\").Replace("\"", "\\\"").Replace("\r", "\\r").Replace("\n", "\\n").Replace("\t", "\\t") + "\""; }
 [STAThread] static void Main(string[] args) {
  string file=args[1]; int session=Process.GetCurrentProcess().SessionId;
  File.WriteAllText(file,"{\"Stage\":\"started\",\"Session\":"+session+"}",new UTF8Encoding(false));
  try {
   string expected=Encoding.UTF8.GetString(Convert.FromBase64String(args[0]));
   bool opened=false; for(int i=0;i<20;i++) { if(OpenClipboard(IntPtr.Zero)) {opened=true;break;} System.Threading.Thread.Sleep(50); }
   if(!opened) throw new Exception("OpenClipboard busy");
   string text=""; uint ownerPid=0; string ownerName="";
   try {
    GetWindowThreadProcessId(GetClipboardOwner(),out ownerPid);
    if(ownerPid!=0) try { ownerName=Process.GetProcessById((int)ownerPid).ProcessName; } catch {}
    IntPtr handle=GetClipboardData(13);
    if(handle!=IntPtr.Zero) { IntPtr memory=GlobalLock(handle); if(memory!=IntPtr.Zero) { try {text=Marshal.PtrToStringUni(memory)??"";} finally {GlobalUnlock(handle);} } }
   } finally {CloseClipboard();}
   bool matches=text==expected;
   File.WriteAllText(file,"{\"Stage\":\"completed\",\"MatchesExpected\":"+(matches?"true":"false")+",\"Empty\":"+(text.Length==0?"true":"false")+",\"Length\":"+text.Length+",\"Session\":"+session+",\"OwnerPid\":"+ownerPid+",\"ClipboardOwner\":"+J(ownerName)+",\"OwnText\":"+(matches?J(text):"null")+"}",new UTF8Encoding(false));
  } catch(Exception error) { File.WriteAllText(file,"{\"Stage\":\"error\",\"ProbeError\":"+J(error.Message)+"}",new UTF8Encoding(false)); }
 }
}`
  const sourceBase64 = Buffer.from(nativeCode, 'utf8').toString('base64')
  const nativeExe = `${info.Profile}\\clipboard-probe.exe`
  const nativeCs = `${info.Profile}\\clipboard-probe.cs`
  const desktopClipboard = JSON.parse(remote(`
    [IO.File]::WriteAllText('${nativeCs}', [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${sourceBase64}')))
    $compiler=Join-Path $env:SystemRoot 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
    $compileOutput=& $compiler '/nologo' '/target:winexe' '/out:${nativeExe}' '${nativeCs}'
    if ($LASTEXITCODE -ne 0) { throw ($compileOutput -join ' ') }
    $action=New-ScheduledTaskAction -Execute '${nativeExe}' -Argument '${expectedBase64} "${probeFile}"'
    $principal=New-ScheduledTaskPrincipal -UserId (whoami) -LogonType Interactive -RunLevel Limited
    Register-ScheduledTask -TaskName '${taskProbeName}' -Action $action -Principal $principal | Out-Null
    try {
      Start-ScheduledTask -TaskName '${taskProbeName}'
      $output='${probeFile}'
      for ($i=0; $i -lt 100; $i++) { Start-Sleep -Milliseconds 100; if (Test-Path -LiteralPath $output) { try { $progress=Get-Content -LiteralPath $output -Raw -Encoding UTF8 | ConvertFrom-Json; if ($progress.Stage -ne 'started') { break } } catch {} } }
      if (!(Test-Path -LiteralPath $output)) { @{ ProbeError='did not complete'; LastResult=(Get-ScheduledTaskInfo -TaskName '${taskProbeName}').LastTaskResult; State=(Get-ScheduledTask -TaskName '${taskProbeName}').State } | ConvertTo-Json -Compress }
      else { Get-Content -LiteralPath $output -Raw -Encoding UTF8 }
    } finally {
      Stop-ScheduledTask -TaskName '${taskProbeName}' -ErrorAction SilentlyContinue
      Get-CimInstance Win32_Process -Filter "Name='clipboard-probe.exe'" | Where-Object { $_.ExecutablePath -and $_.ExecutablePath -eq '${nativeExe}' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
      Unregister-ScheduledTask -TaskName '${taskProbeName}' -Confirm:$false
      Remove-Item -LiteralPath '${probeFile}','${nativeExe}','${nativeCs}' -Force -ErrorAction SilentlyContinue
      if (Get-ScheduledTask -TaskName '${taskProbeName}' -ErrorAction SilentlyContinue) { throw 'Owned clipboard probe task remained' }
      if (Get-CimInstance Win32_Process -Filter "Name='clipboard-probe.exe'" | Where-Object { $_.ExecutablePath -eq '${nativeExe}' }) { throw 'Owned clipboard probe process remained' }
    }
  `))
  assert.equal(desktopClipboard.Stage, 'completed', 'The desktop clipboard probe must actually execute')
  assert.equal(desktopClipboard.MatchesExpected, true, 'The Windows OS clipboard must contain the exact expected text')
  assert.equal(desktopClipboard.OwnText, expectedSearch)
  assert.equal(desktopClipboard.ClipboardOwner, 'msedge')
  const clipboardOwner = JSON.parse(remote(`
    $owner=Get-CimInstance Win32_Process -Filter "ProcessId=${desktopClipboard.OwnerPid}"
    @{ OwnEdge=($owner.Name -eq 'msedge.exe' -and $owner.CommandLine.Contains('${name}')); Session=$owner.SessionId } | ConvertTo-Json -Compress
  `))
  assert.equal(clipboardOwner.OwnEdge, true, 'Clipboard ownership must belong to this temporary Edge, not another application')
  assert.equal(clipboardOwner.Session, desktopClipboard.Session)
  await page.waitForTimeout(1000)
  await page.reload({ waitUntil: 'networkidle' })
  assert.equal(await page.locator('.chart-grid .chart-sq').count(), 5)
  const calibration = await context.newPage()
  await calibration.goto(url + '/?view=calibration&entry=border%3Ab-sulphdrop', { waitUntil: 'networkidle' })
  assert.equal(await calibration.getByRole('row').count(), 2)
  await calibration.getByLabel('建议中文').fill('Windows 独立验收：亡者硫磺待核对')
  await calibration.getByRole('button', { name: '需要修改', exact: true }).click()
  await calibration.getByRole('button', { name: '保存本条', exact: true }).click()
  await calibration.reload({ waitUntil: 'networkidle' })
  assert.equal(await calibration.getByLabel('建议中文').inputValue(), 'Windows 独立验收：亡者硫磺待核对')
  assert.equal(await calibration.locator('.cal-inspector .cal-badge').first().textContent(), '来源冲突')
  assert.ok((await calibration.locator('.cal-comparison').textContent()).includes('相邻区域的稀有怪物掉落死者硫磺'))
  await calibration.close()
  assert.equal(await page.locator('.chart-grid .chart-sq').count(), 5)
  report.calibration = { singleEntryLocated: true, savedAndRefreshed: true, sourceEvidenceUnchanged: true, inventoryUnchanged: true, isolatedProfile: true }
  assert.deepEqual(failures, [])
  assert.deepEqual(badResponses, [])
  Object.assign(report, { edge: info.Edge, userAgent: environment.userAgent, cdpLoopbackOnly: info.Loopback, secureContext: true, importedRealCharts: 5, displayedDestinationsAndShapes: shapeLabels, actualWindowsClipboardWrite: true, nativeClipboardImplementation: true, clipboardWriteAcknowledgement: acknowledgement.state, browserReadAttempts: readAttempts + 1, windowsDesktopClipboard: desktopClipboard, placementGuideClipboard: chartSearch, refreshedInventory: 5, failedResources: 0, gameSearch: 'not exercised' })
} finally {
  if (browser) await browser.close().catch(() => {})
  if (tunnel && tunnel.exitCode === null && tunnel.signalCode === null) {
    const stopped = once(tunnel, 'exit')
    tunnel.kill('SIGTERM')
    await stopped
  }
  const cleanup = JSON.parse(remote(`
    Get-CimInstance Win32_Process -Filter "Name='msedge.exe'" | Where-Object { $_.CommandLine -and $_.CommandLine.Contains('${name}') } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
    if (Get-ScheduledTask -TaskName '${name}' -ErrorAction SilentlyContinue) { Unregister-ScheduledTask -TaskName '${name}' -Confirm:$false }
    $edgeProfileDir = Join-Path $env:TEMP '${name}'
    for ($i=0; $i -lt 20 -and (Test-Path -LiteralPath $edgeProfileDir); $i++) {
      try { Remove-Item -LiteralPath $edgeProfileDir -Recurse -Force } catch { Start-Sleep -Milliseconds 250 }
    }
    @{ TaskRemoved=!(Get-ScheduledTask -TaskName '${name}' -ErrorAction SilentlyContinue); ProfileRemoved=!(Test-Path -LiteralPath $edgeProfileDir); RemainingOwnProcesses=@(Get-CimInstance Win32_Process -Filter "Name='msedge.exe'" | Where-Object { $_.CommandLine -and $_.CommandLine.Contains('${name}') }).Count } | ConvertTo-Json -Compress
  `))
  assert.equal(cleanup.TaskRemoved, true)
  assert.equal(cleanup.ProfileRemoved, true)
  assert.equal(cleanup.RemainingOwnProcesses, 0)
  report.cleanup = cleanup
  report.cleanup.SshTunnelClosed = true
  report.cleanup.NativeClipboardProbeRemoved = true
}
console.log(JSON.stringify(report, null, 2))
