#Requires -Version 5.1
[CmdletBinding()]
param([string]$InstallRoot = '', [switch]$Elevated, [switch]$ValidateOnly)
$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'collector-install.psm1') -Force -DisableNameChecking
if (-not $InstallRoot) {
    $InstallRoot = Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'voyage-clip-collector-cn'
}
$stage = '启动文件校验'
try {
    Write-Host '[检查组件] 正在核对固定版本、安装登记与文件摘要，请稍候…'
    $installed = Get-CollectorInstallation $InstallRoot
    Write-Host "文件校验通过｜版本 $($installed.Registration.version)｜登记目录 $InstallRoot"
    if ($ValidateOnly) {
        Write-Host '仅核对登记与文件，尚未执行 Windows 原生自检或启动采集器。'
        exit 0
    }
    if ($env:OS -ne 'Windows_NT') { throw '采集器需要 Windows x64。此环境未启动。' }
    $stage = '管理员授权'
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $admin = (New-Object Security.Principal.WindowsPrincipal($identity)).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
    if (-not $admin) {
        if ($Elevated) { throw '未取得管理员权限。请联系设备管理员；不要向工具提供密码。' }
        Write-Host '将请求正常 Windows 管理员授权。显示的程序为 Windows PowerShell（Microsoft Windows）；本项目脚本没有受信任发布者签名。'
        # Capture the ORIGINAL install path before elevation. A different admin
        # account must never replace it with its own LocalAppData directory.
        $scriptPath = (Join-Path $PSScriptRoot 'launch-voyage-clip-collector-cn.ps1').Replace("'", "''")
        $rootPath = ([IO.Path]::GetFullPath($InstallRoot)).Replace("'", "''")
        $command = "& '$scriptPath' -InstallRoot '$rootPath' -Elevated"
        $encoded = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($command))
        try {
            $child = Start-Process -FilePath (Join-Path $env:SystemRoot 'System32/WindowsPowerShell/v1.0/powershell.exe') -ArgumentList @('-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', $encoded) -Verb RunAs -Wait -PassThru
        } catch {
            if ((Get-CollectorNativeErrorCode $_.Exception) -eq 1223) { throw '未启动：管理员授权已取消。请重新双击桌面入口重试。' }
            throw "未启动：管理员授权失败。请联系设备管理员并附诊断；不要关闭防护。$($_.Exception.Message)"
        }
        if ($child.ExitCode -ne 0) { throw '未启动：管理员窗口中的组件检查或启动失败。请保留其错误并修复安装后重试。' }
        exit 0
    }
    $stage = '检查运行实例'
    if (@(Get-CollectorRunning $InstallRoot).Count -gt 0) {
        Write-Host '采集器已经运行。保留现有实例与未导出的批次；请查看浮窗，或先 F7 导出并从托盘退出后重试。'
        exit 0
    }
    $stage = '本机模型自检'
    $null = Test-CollectorModels $installed.ReleaseRoot
    $stage = '启动采集器'
    $runtime = Join-Path $installed.ReleaseRoot 'runtime/ahk/AutoHotkey64.exe'
    $script = Join-Path $installed.ReleaseRoot 'voyage-clip-collector-cn.ahk'
    $null = Start-Process -FilePath $runtime -ArgumentList ('"' + $script + '" --install-root "' + ([IO.Path]::GetFullPath($InstallRoot)) + '"') -WorkingDirectory $installed.ReleaseRoot -PassThru
    Write-Host '启动已提交，请等待采集器浮窗完成加载并显示版本与权限。退出：任务栏右下角采集器图标 → 退出。'
} catch {
    Write-CollectorFailure $InstallRoot $stage $_.Exception.Message
    if ($env:OS -eq 'Windows_NT' -and -not $ValidateOnly) { $null = Read-Host '请保留上方错误；按 Enter 关闭，之后可从桌面重试' }
    exit 1
}
