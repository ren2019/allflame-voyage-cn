#Requires -Version 5.1
[CmdletBinding()]
param(
    [string]$PackageRoot = $PSScriptRoot,
    [string]$InstallRoot = '',
    [switch]$ValidateOnly,
    [switch]$PrepareOnly,
    [switch]$Offline,
    [switch]$AcceptVersionChange
)
$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'collector-install.psm1') -Force -DisableNameChecking
if (-not $InstallRoot) {
    $InstallRoot = Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'voyage-clip-collector-cn'
}
$stage = '检查包'
$prepared = $null
$installationLock = $null
try {
    Write-Host '[检查包] 正在核对候选清单、脚本版本与文件摘要…'
    $package = Get-CollectorPackage $PackageRoot
    Write-Host "包校验通过｜版本 $($package.version)｜目录 $InstallRoot"
    if ($package.PSObject.Properties['changes']) {
        foreach ($change in $package.changes) { Write-Host "[变化说明] $change" }
    }
    if ($ValidateOnly) {
        Write-Host '仅完成候选包校验，尚未安装或确认 Windows 原生组件就绪。'
        exit 0
    }
    if ($env:OS -ne 'Windows_NT' -and -not $PrepareOnly) {
        throw '本安装入口需要 Windows x64。跨平台检查不代表 Windows 安装成功。'
    }
    if (-not $PrepareOnly -and -not [Environment]::Is64BitOperatingSystem) {
        throw '此候选只面向 Windows x64；其他架构未验收。'
    }
    if (-not $PrepareOnly) {
        if ([Environment]::OSVersion.Version.Build -lt 17763 -or
            ($env:PROCESSOR_ARCHITECTURE -ne 'AMD64' -and $env:PROCESSOR_ARCHITEW6432 -ne 'AMD64')) {
            throw '此候选面向 Windows 10 1809 及以上或 Windows 11 的 x64 系统；其他环境未验收。'
        }
        $stage = '检查运行实例'
        if (@(Get-CollectorRunning $InstallRoot).Count -gt 0) {
            throw '采集器仍在运行。请先 F7 结束并导出批次，再从托盘选择“退出”，之后重试安装；不会替换当前实例。'
        }
    }
    Write-Host "[安装前] 工具 $($package.version)；固定依赖最大下载 $([Math]::Round($package.maximumDependencyBytes / 1MB, 2)) MiB。"
    Write-Host 'AHK/Python 为本工具便携组件；如缺少微软 VC++ 运行库，将另行显示微软许可窗口和正常管理员授权。'
    New-Item -ItemType Directory -Path $InstallRoot -Force | Out-Null
    $stage = '检查安装锁'
    try {
        $installationLock = [IO.File]::Open((Join-Path $InstallRoot 'installation.lock'), [IO.FileMode]::OpenOrCreate, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None)
    } catch { throw '另一个安装或修复窗口可能仍在运行，或目录权限不足。请保留现有窗口并稍后重试。' }
    if (Test-Path -LiteralPath (Join-Path $InstallRoot 'transaction.json')) {
        if ($PrepareOnly) { throw '有尚未恢复的维护事务，请先在维护入口恢复；只准备组件不会改动原版本登记。' }
        $recoveryLock = [IO.File]::Open((Join-Path $InstallRoot 'collector.running.lock'), [IO.FileMode]::OpenOrCreate, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None)
        try { Restore-CollectorTransaction $InstallRoot } finally { $recoveryLock.Dispose() }
    }
    if (Test-Path -LiteralPath (Join-Path $InstallRoot 'current.json')) {
        $current = Get-CollectorRegistration $InstallRoot
        Write-Host "[版本] 当前 $($current.version) → 目标 $($package.version)"
        if ([version]$package.version -lt [version]$current.version) { throw '所选候选版本较旧。未切换；请选择当前版本的修复包或更高版本。' }
        if ($current.version -eq $package.version) {
            Write-Host '同版本进入检查/修复，不重复增加快捷方式。'
            if (-not $PrepareOnly) {
                try {
                    $installed = Get-CollectorInstallation $InstallRoot
                    foreach ($name in Get-CollectorStableNames) {
                        $expected = @($package.files | Where-Object { $_.path -eq $name })
                        if (-not $expected.Count) { throw "候选缺少入口：$name" }
                        Assert-CollectorFile (Join-Path $InstallRoot $name) $expected[0]
                    }
                    if (-not $current.PSObject.Properties['shortcuts']) { throw '旧登记的快捷方式需要补齐。' }
                    foreach ($shortcut in $current.shortcuts) {
                        $target = Get-CollectorTransactionTarget $InstallRoot $current ([pscustomobject]@{ scope = 'desktop'; path = $shortcut.name })
                        Assert-CollectorFile $target $shortcut
                    }
                    $null = Test-CollectorModels $installed.ReleaseRoot
                    Write-Host "同版本检查通过｜$($current.version)。现有组件与模型可运行，未重建快捷方式。"
                    exit 0
                } catch { Write-Host '发现缺失/损坏或不能加载的组件，准备独立修复候选。' }
            }
        } elseif (-not $PrepareOnly -and -not $AcceptVersionChange) {
            if ((Read-Host '输入“更新”确认目标版本；直接 Enter 取消') -ne '更新') {
                Write-Host '已取消更新，旧版本未改变。'
                exit 0
            }
        }
    }
    $stage = '下载、校验与准备组件'
    $prepared = New-CollectorPreparedRelease $PackageRoot $InstallRoot $package ([bool]$Offline)
    if ($PrepareOnly) {
        Write-Host '组件已准备，尚未完成 Windows 自检或安装登记；此结果不能称为已就绪。'
        Write-Host "PREPARED_PATH=$prepared"
        exit 0
    }
    $stage = '本机模型自检'
    try {
        $null = Test-CollectorModels $prepared
    } catch {
        if ($_.Exception.Message -notmatch 'DLL load failed|MSVCP140|VCRUNTIME|WinError (126|127)|找不到指定的模块|找不到指定的程序') { throw }
        $stage = '准备微软原生运行库'
        Install-CollectorVisualCpp $PackageRoot $InstallRoot $package ([bool]$Offline)
        $stage = '再次检查本机模型'
        $null = Test-CollectorModels $prepared
    }
    $stage = '登记安装与创建快捷方式'
    if (@(Get-CollectorRunning $InstallRoot).Count -gt 0) { throw '准备组件期间采集器已启动。请先 F7 导出并从托盘退出，再重试；当前运行实例未被替换。' }
    Complete-CollectorInstallation $PackageRoot $InstallRoot $prepared $package
    $prepared = $null
    Write-Host "安装完成｜版本 $($package.version)。请双击桌面的‘国服海图采集器’开始使用。" -ForegroundColor Green
    Write-Host '安装不等于游戏验收通过；退出入口在任务栏右下角采集器图标 → 退出。'
    Write-Host '使用说明：桌面的“国服海图采集器使用说明”。首次启动将请求正常 Windows 管理员授权；选择否时未启动，可重试。'
    exit 0
} catch {
    if ($prepared -and (Test-Path -LiteralPath $prepared)) {
        Remove-Item -LiteralPath $prepared -Recurse -Force -ErrorAction SilentlyContinue
    }
    Write-CollectorFailure $InstallRoot $stage $_.Exception.Message
    exit 1
} finally {
    if ($installationLock) { $installationLock.Dispose() }
}
