#Requires -Version 5.1
[CmdletBinding()]
param(
    [string]$InstallRoot = '',
    [ValidateSet('Menu', 'Status', 'Update', 'Repair', 'Uninstall', 'Recover')][string]$Action = 'Menu',
    [string]$PackageArchive = '',
    [switch]$PrepareOnly,
    [switch]$Offline,
    [switch]$ConfirmUninstall
)
$ErrorActionPreference = 'Stop'
if (-not $InstallRoot) { $InstallRoot = Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'voyage-clip-collector-cn' }
$InstallRoot = [IO.Path]::GetFullPath($InstallRoot).TrimEnd([IO.Path]::DirectorySeparatorChar)
try { Import-Module (Join-Path $PSScriptRoot 'collector-install.psm1') -Force -DisableNameChecking }
catch {
    Write-Host '维护组件缺失或损坏。请重新解压完整候选包，双击“安装或更新国服海图采集器.cmd”；不要猜测命令或关闭防护。' -ForegroundColor Red
    exit 1
}
$lock = $null; $activationLock = $null; $incoming = $null; $incomingFiles = @(); $uninstalled = $false
try {
    if ($Action -eq 'Recover' -or ((Test-Path -LiteralPath (Join-Path $InstallRoot 'transaction.json')) -and -not $PrepareOnly -and $Action -ne 'Status')) {
        if (@(Get-CollectorRunning $InstallRoot).Count) { throw '采集器正在运行，请先 F7 导出并从托盘退出，再恢复维护。' }
        $lock = [IO.File]::Open((Join-Path $InstallRoot 'installation.lock'), [IO.FileMode]::OpenOrCreate, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None)
        $activationLock = [IO.File]::Open((Join-Path $InstallRoot 'collector.running.lock'), [IO.FileMode]::OpenOrCreate, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None)
        Restore-CollectorTransaction $InstallRoot
        $activationLock.Dispose(); $activationLock = $null
        $lock.Dispose(); $lock = $null
        if ($Action -eq 'Recover') { exit 0 }
    }
    $registration = Get-CollectorRegistration $InstallRoot
    Write-Host "当前登记版本：$($registration.version)｜目录：$InstallRoot"
    if ($Action -eq 'Menu') {
        Write-Host "1 查看版本与诊断`n2 更新采集器`n3 修复安装`n4 卸载采集器`n0 退出维护"
        switch (Read-Host '请选择') {
            '1' { $Action = 'Status' }
            '2' { $Action = 'Update' }
            '3' { $Action = 'Repair' }
            '4' { $Action = 'Uninstall' }
            default { Write-Host '已退出维护，现有安装未改变。'; exit 0 }
        }
    }
    if ($Action -eq 'Status') {
        Write-Host "版本组件目录：$(Get-CollectorPath $InstallRoot $registration.release)"
        try {
            $null = Get-CollectorInstallation $InstallRoot
            Write-Host '固定文件校验通过；真实模型与权限仍在启动时检查。'
        } catch {
            Write-Host "组件异常：$($_.Exception.Message)`n请选择“修复安装”；源包也缺失时，重新解压完整候选并双击中文安装入口。" -ForegroundColor Yellow
        }
        if (Test-Path -LiteralPath (Join-Path $InstallRoot 'transaction.json')) { Write-Host '发现中断维护记录；重新打开维护入口将先恢复，当前状态不能当作可运行。' }
        Write-Host "本地诊断：$(Join-Path $InstallRoot 'diagnostics')（不自动上传）"
        exit 0
    }
    if (@(Get-CollectorRunning $InstallRoot).Count) { throw '采集器正在运行，请先 F7 结束并导出，再从托盘选择“退出”；不会替换原批次。' }
    if ($Action -eq 'Uninstall') {
        Write-Host '卸载只清理登记属于本工具的组件与快捷方式；保留网页库存/规划、诊断、主动保存截图及共享 Microsoft VC++。'
        if (-not $ConfirmUninstall -and (Read-Host '输入“卸载”确认；直接 Enter 取消') -ne '卸载') {
            Write-Host '已取消卸载，现有安装未改变。'; exit 0
        }
        $lock = [IO.File]::Open((Join-Path $InstallRoot 'installation.lock'), [IO.FileMode]::OpenOrCreate, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None)
        if (@(Get-CollectorRunning $InstallRoot).Count) { throw '采集器已启动，请先导出并退出后重试卸载。' }
        $activationLock = [IO.File]::Open((Join-Path $InstallRoot 'collector.running.lock'), [IO.FileMode]::OpenOrCreate, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None)
        Remove-CollectorInstallation $InstallRoot $registration
        $uninstalled = $true
        exit 0
    }
    $source = ''
    if ($Action -eq 'Repair') {
        $source = Get-CollectorPath $InstallRoot $registration.package
        try { $package = Get-CollectorPackage $source }
        catch { throw '固定安装源缺失或损坏，未执行该源。请重新取得完整候选，全部解压后双击“安装或更新国服海图采集器.cmd”；无需猜测命令。' }
        if ($package.version -ne $registration.version) { throw '固定安装源与登记版本不一致，请用同版本或更新的完整候选修复。' }
        Write-Host "修复安装：$($registration.version)，固定组件仅缺失或损坏时重新准备；模型自检通过才重新登记。"
    } elseif ($Action -eq 'Update') {
        if (-not $PackageArchive) {
            if ($env:OS -ne 'Windows_NT') { throw '请显式提供候选 ZIP；普通 Windows 入口会打开文件选择窗口。' }
            Add-Type -AssemblyName System.Windows.Forms
            $picker = New-Object Windows.Forms.OpenFileDialog
            $picker.Title = '选择从本仓库取得的固定版本国服采集器候选包'
            $picker.Filter = '国服采集器候选包 (*.zip)|*.zip'
            try {
                if ($picker.ShowDialog() -ne [Windows.Forms.DialogResult]::OK) { Write-Host '已取消更新，旧版本未改变。'; exit 0 }
                $PackageArchive = $picker.FileName
            } finally { $picker.Dispose() }
        }
        $incoming = Join-Path $InstallRoot ('incoming/' + [guid]::NewGuid().ToString('N'))
        New-Item -ItemType Directory -Path $incoming -Force | Out-Null
        Expand-CollectorArchive ([IO.Path]::GetFullPath($PackageArchive)) $incoming
        $incomingFiles = @(Get-ChildItem -LiteralPath $incoming -File -Recurse | ForEach-Object {
            New-CollectorFileRecord $_.FullName ($_.FullName.Substring($incoming.Length + 1).Replace('\', '/'))
        })
        $source = $incoming
        $package = Get-CollectorPackage $source
        if ([version]$package.version -lt [version]$registration.version) { throw '所选版本较旧，未切换；请使用当前修复包或更新版本。' }
        Write-Host "当前 $($registration.version) → 目标 $($package.version)"
        if ($package.PSObject.Properties['changes'] -and @($package.changes).Count) {
            foreach ($change in $package.changes) { Write-Host "[变化说明] $change" }
        } else { Write-Host '[变化说明] 此旧候选没有内嵌摘要，请核对对应固定版本的使用说明。' }
        if (-not $PrepareOnly -and (Read-Host '输入“更新”确认；直接 Enter 取消') -ne '更新') {
            Write-Host '已取消更新，旧版本未改变。'; exit 0
        }
    }
    $arguments = @{ PackageRoot = $source; InstallRoot = $InstallRoot; PrepareOnly = [bool]$PrepareOnly
        Offline = [bool]$Offline; AcceptVersionChange = $true }
    & (Join-Path $PSScriptRoot 'install-voyage-clip-collector-cn.ps1') @arguments
    if ($LASTEXITCODE -ne 0) { throw '安装/修复未完成。请保留上方具体阶段；旧绑定未作为成功切换。' }
    if ($PrepareOnly) { Write-Host '仅完成更新/修复准备，未切换版本、未创建快捷方式、未声明 Windows 就绪。' }
    else { Write-Host '维护完成；请从桌面主入口启动，核对浮窗实际版本及本地模型状态。' }
} catch {
    Write-CollectorFailure $InstallRoot '维护' $_.Exception.Message
    exit 1
} finally {
    if ($activationLock) { $activationLock.Dispose() }
    if ($lock) { $lock.Dispose() }
    if ($uninstalled) {
        foreach ($name in @('installation.lock', 'collector.running.lock')) {
            $file = Join-Path $InstallRoot $name
            try { if ((Test-Path -LiteralPath $file -PathType Leaf) -and (Get-Item -LiteralPath $file).Length -eq 0) { Remove-Item -LiteralPath $file -Force } } catch { }
        }
    }
    if ($incoming) {
        foreach ($entry in $incomingFiles) {
            $file = Get-CollectorPath $incoming $entry.path
            try {
                Assert-CollectorOwnedLocation $InstallRoot $file
                Assert-CollectorFile $file $entry
                Remove-Item -LiteralPath $file -Force
                Remove-CollectorEmptyParents $InstallRoot $file
            } catch { }
        }
    }
}
