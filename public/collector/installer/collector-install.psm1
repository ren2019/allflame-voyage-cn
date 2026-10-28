Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Get-CollectorPath([string]$Root, [string]$Relative) {
    if ([IO.Path]::IsPathRooted($Relative) -or $Relative -match '(^|[\\/])\.\.([\\/]|$)|:') {
        throw "清单路径不安全：$Relative"
    }
    $base = [IO.Path]::GetFullPath($Root).TrimEnd([IO.Path]::DirectorySeparatorChar)
    $path = [IO.Path]::GetFullPath((Join-Path $base ($Relative -replace '[\\/]', [IO.Path]::DirectorySeparatorChar)))
    if (-not $path.StartsWith($base + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
        throw "清单路径超出安装目录：$Relative"
    }
    return $path
}

function Assert-CollectorFile([string]$Path, $Entry) {
    if ($Entry.sha256 -notmatch '^[a-fA-F0-9]{64}$' -or -not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        throw "文件校验失败或缺失：$Path"
    }
    if ((Get-Item -LiteralPath $Path).Length -ne $Entry.bytes -or
        (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant() -ne $Entry.sha256.ToLowerInvariant()) {
        throw "文件大小或 SHA-256 校验失败：$Path"
    }
}

function Get-CollectorPackage([string]$PackageRoot) {
    $manifest = Get-Content -LiteralPath (Join-Path $PackageRoot 'collector-package.json') -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($manifest.id -ne 'voyage-clip-collector-cn' -or $manifest.schemaVersion -ne 1 -or
        $manifest.platform -ne 'win-x64' -or $manifest.version -notmatch '^\d+\.\d+\.\d+$') {
        throw '候选包标识、版本或平台不兼容。请重新取得完整候选包。'
    }
    foreach ($entry in $manifest.files) {
        Assert-CollectorFile (Get-CollectorPath $PackageRoot $entry.path) $entry
    }
    $release = Get-Content -LiteralPath (Join-Path $PackageRoot 'payload/collector-release.json') -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($release.version -ne $manifest.version -or $release.script -ne 'voyage-clip-collector-cn.ahk') {
        throw '脚本与候选清单版本不一致。'
    }
    $script = Get-Content -LiteralPath (Join-Path $PackageRoot ('payload/' + $release.script)) -Raw -Encoding UTF8
    if ($script -notmatch ('(?m)^CollectorVersion := "' + [regex]::Escape($manifest.version) + '"')) {
        throw '脚本运行版本与候选清单不一致。'
    }
    return $manifest
}

function Write-CollectorFailure([string]$InstallRoot, [string]$Stage, [string]$Message) {
    $text = "未完成｜阶段：$Stage`n$Message`n请重新双击安装入口重试；组件缺失请使用同一入口修复。系统或组织策略拦截时请联系设备管理员，不要关闭防护。"
    Write-Host $text -ForegroundColor Red
    try {
        $directory = Join-Path $InstallRoot 'diagnostics'
        New-Item -ItemType Directory -Path $directory -Force | Out-Null
        $file = Join-Path $directory ('install-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.txt')
        [IO.File]::WriteAllText($file, $text, [Text.UTF8Encoding]::new($true))
        Write-Host "本地诊断：$file（不自动上传）"
    } catch {
        Write-Host '无法保存诊断，请保留窗口中的错误原文。'
    }
}

function Get-CollectorComponent([string]$PackageRoot, [string]$CacheRoot, $Entry, [bool]$Offline) {
    $cached = Get-CollectorPath $CacheRoot $Entry.filename
    if (Test-Path -LiteralPath $cached) {
        try { Assert-CollectorFile $cached $Entry; return $cached } catch {
            Remove-Item -LiteralPath $cached -Force
        }
    }
    New-Item -ItemType Directory -Path $CacheRoot -Force | Out-Null
    $bundled = Get-CollectorPath (Join-Path $PackageRoot 'components') $Entry.filename
    if (Test-Path -LiteralPath $bundled) {
        Assert-CollectorFile $bundled $Entry
        Copy-Item -LiteralPath $bundled -Destination $cached
        return $cached
    }
    if ($Offline) { throw "离线包缺少组件：$($Entry.filename)。请使用完整离线候选或联网重试。" }
    if ([uri]$Entry.url -and ([uri]$Entry.url).Scheme -ne 'https') { throw '组件地址必须使用 HTTPS。' }
    $partial = $cached + '.partial'
    Write-Host "[下载组件] $($Entry.filename)｜$([Math]::Round($Entry.bytes / 1MB, 2)) MiB"
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    $response = $null; $stream = $null; $target = $null
    try {
        $request = [Net.HttpWebRequest]::Create($Entry.url)
        $request.Timeout = 30000
        $request.ReadWriteTimeout = 30000
        $response = $request.GetResponse()
        $stream = $response.GetResponseStream()
        $target = [IO.File]::Open($partial, [IO.FileMode]::Create, [IO.FileAccess]::Write)
        $buffer = New-Object byte[] 65536
        [long]$received = 0; $lastProgress = [DateTime]::UtcNow
        while (($count = $stream.Read($buffer, 0, $buffer.Length)) -gt 0) {
            $target.Write($buffer, 0, $count); $received += $count
            if ($received -gt $Entry.bytes) { throw '下载内容超过固定清单大小，已停止。' }
            if (([DateTime]::UtcNow - $lastProgress).TotalSeconds -ge 2) {
                Write-Host "  已下载 $([Math]::Round($received / 1MB, 2)) / $([Math]::Round($Entry.bytes / 1MB, 2)) MiB"
                $lastProgress = [DateTime]::UtcNow
            }
        }
        $target.Dispose(); $target = $null
        Assert-CollectorFile $partial $Entry
        Move-Item -LiteralPath $partial -Destination $cached
        Write-Host "[校验文件] $($Entry.filename) 大小与 SHA-256 通过。"
        return $cached
    } finally {
        if ($target) { $target.Dispose() }
        if ($stream) { $stream.Dispose() }
        if ($response) { $response.Dispose() }
        if (Test-Path -LiteralPath $partial) { Remove-Item -LiteralPath $partial -Force }
    }
}

function Expand-CollectorArchive([string]$Archive, [string]$Destination, [string[]]$Only = @()) {
    Add-Type -AssemblyName System.IO.Compression
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $zip = [IO.Compression.ZipFile]::OpenRead($Archive)
    try {
        foreach ($entry in $zip.Entries) {
            if ($Only.Count -gt 0 -and $entry.FullName -notin $Only) { continue }
            if (($entry.ExternalAttributes -shr 16 -band 0xF000) -eq 0xA000) { throw '组件包含不支持的符号链接。' }
            $destinationPath = Get-CollectorPath $Destination $entry.FullName
            if (-not $entry.Name) {
                New-Item -ItemType Directory -Path $destinationPath -Force | Out-Null
                continue
            }
            New-Item -ItemType Directory -Path ([IO.Path]::GetDirectoryName($destinationPath)) -Force | Out-Null
            $inputStream = $entry.Open()
            try {
                $outputStream = [IO.File]::Open($destinationPath, [IO.FileMode]::Create, [IO.FileAccess]::Write)
                try { $inputStream.CopyTo($outputStream) } finally { $outputStream.Dispose() }
            } finally { $inputStream.Dispose() }
        }
    } finally { $zip.Dispose() }
}

function New-CollectorPreparedRelease([string]$PackageRoot, [string]$InstallRoot, $Package, [bool]$Offline) {
    $ocr = Get-Content -LiteralPath (Join-Path $PackageRoot 'payload/collector/ocr-runtime.json') -Raw -Encoding UTF8 | ConvertFrom-Json
    $available = [IO.DriveInfo]::new([IO.Path]::GetPathRoot([IO.Path]::GetFullPath($InstallRoot))).AvailableFreeSpace
    $required = [long]$ocr.expandedBytes + $Package.maximumDependencyBytes + 50MB
    if ($available -lt $required) { throw "磁盘空间不足，需要至少 $([Math]::Ceiling($required / 1MB)) MiB 可用空间。" }
    $cache = Join-Path $InstallRoot 'component-cache'
    $release = Join-Path $InstallRoot ('releases/.prepare-' + [guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $release -Force | Out-Null
    try {
        foreach ($entry in @($Package.files | Where-Object { $_.path.StartsWith('payload/') })) {
            $source = Get-CollectorPath $PackageRoot $entry.path
            Assert-CollectorFile $source $entry
            $target = Get-CollectorPath $release $entry.path.Substring(8)
            New-Item -ItemType Directory -Path ([IO.Path]::GetDirectoryName($target)) -Force | Out-Null
            Copy-Item -LiteralPath $source -Destination $target
        }
        $components = @($Package.autoHotkey, $ocr.python) + @($ocr.packages)
        foreach ($component in $components) {
            Write-Host "[准备组件] $($component.filename)"
            $archive = Get-CollectorComponent $PackageRoot $cache $component $Offline
            if ($component.filename -eq $Package.autoHotkey.filename) {
                Expand-CollectorArchive $archive (Join-Path $release 'runtime/ahk') @('AutoHotkey64.exe', 'license.txt')
            } elseif ($component.filename -eq $ocr.python.filename) {
                Expand-CollectorArchive $archive (Join-Path $release 'runtime/python')
            } else {
                Expand-CollectorArchive $archive (Join-Path $release 'runtime/python/Lib/site-packages')
            }
        }
        # Embeddable Python uses a closed module search path; no pip/system Python.
        [IO.File]::WriteAllText((Join-Path $release 'runtime/python/python311._pth'),
            "python311.zip`r`n.`r`nLib/site-packages`r`nimport site`r`n", [Text.Encoding]::ASCII)
        foreach ($model in $ocr.models) {
            Assert-CollectorFile (Get-CollectorPath (Join-Path $release 'runtime/python/Lib/site-packages') $model.path) $model
        }
        $installed = @(Get-ChildItem -LiteralPath $release -File -Recurse | ForEach-Object {
            $relative = $_.FullName.Substring($release.Length + 1).Replace('\', '/')
            [pscustomobject]@{ path = $relative; sha256 = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant(); bytes = $_.Length }
        })
        [IO.File]::WriteAllText((Join-Path $release 'installed-files.json'),
            (ConvertTo-Json -InputObject $installed -Depth 6), [Text.UTF8Encoding]::new($false))
        return $release
    } catch {
        Remove-Item -LiteralPath $release -Recurse -Force -ErrorAction SilentlyContinue
        throw
    }
}

function Get-CollectorRegistration([string]$InstallRoot) {
    $current = Join-Path $InstallRoot 'current.json'
    if (-not (Test-Path -LiteralPath $current -PathType Leaf)) {
        throw '尚未安装国服海图采集器。请解压候选包，双击“安装或更新国服海图采集器.cmd”。'
    }
    $registration = Get-Content -LiteralPath $current -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($registration.id -ne 'voyage-clip-collector-cn' -or $registration.version -notmatch '^\d+\.\d+\.\d+$') {
        throw '安装登记损坏。请使用同一安装入口修复。'
    }
    $null = Get-CollectorPath $InstallRoot $registration.release
    $null = Get-CollectorPath $InstallRoot $registration.package
    return $registration
}

function Get-CollectorInstallation([string]$InstallRoot) {
    $registration = Get-CollectorRegistration $InstallRoot
    $release = Get-CollectorPath $InstallRoot $registration.release
    Assert-CollectorFile (Join-Path $release 'installed-files.json') $registration.inventory
    $inventory = Get-Content -LiteralPath (Join-Path $release 'installed-files.json') -Raw -Encoding UTF8 | ConvertFrom-Json
    foreach ($entry in $inventory) { Assert-CollectorFile (Get-CollectorPath $release $entry.path) $entry }
    $identity = Get-Content -LiteralPath (Join-Path $release 'collector-release.json') -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($identity.id -ne $registration.id -or $identity.version -ne $registration.version) {
        throw '安装登记与实际脚本版本不一致。请修复安装。'
    }
    return [pscustomobject]@{ Registration = $registration; ReleaseRoot = $release }
}

function Get-CollectorRunning([string]$InstallRoot = '') {
    if ($env:OS -ne 'Windows_NT') { return @() }
    if ($InstallRoot -and (Test-Path -LiteralPath (Join-Path $InstallRoot 'collector.running.lock'))) {
        try {
            $probe = [IO.File]::Open((Join-Path $InstallRoot 'collector.running.lock'), [IO.FileMode]::Open, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None)
            $probe.Dispose()
        } catch {
            $failure = $_.Exception
            while ($failure.InnerException) { $failure = $failure.InnerException }
            if (($failure.HResult -band 0xFFFF) -in @(32, 33)) {
                return @([pscustomobject]@{ ProcessId = 0; Source = 'collector-running-lock' })
            }
            throw '无法检查本工具运行锁，可能权限不足。请先结束导出并退出本工具，再从正确入口重试；不会关闭其他脚本。'
        }
    }
    $session = (Get-Process -Id $PID).SessionId
    # Match the product script across release paths, including the old direct
    # download. Never terminate an existing process or lose its unexported batch.
    $processes = @(Get-CimInstance Win32_Process -Filter "Name LIKE 'AutoHotkey%'" -ErrorAction Stop | Where-Object { $_.SessionId -eq $session })
    if (@($processes | Where-Object { -not $_.CommandLine }).Count -gt 0) {
        throw '无法读取某个 AHK 进程的命令行，不能确认是否为正在采集的旧工具。请先导出并退出本工具，或从管理员桌面入口核对；不会自动关闭其他脚本。'
    }
    return @($processes | Where-Object { $_.CommandLine -match 'voyage-clip-collector(?:-cn)?\.ahk' })
}

function Get-CollectorNativeErrorCode($Exception) {
    while ($Exception) {
        if ($Exception.PSObject.Properties['NativeErrorCode']) { return $Exception.NativeErrorCode }
        $Exception = $Exception.InnerException
    }
    return 0
}

function Invoke-CollectorProcess([string]$Executable, [string]$Arguments, [string]$WorkingDirectory) {
    $info = New-Object Diagnostics.ProcessStartInfo
    $info.FileName = $Executable; $info.Arguments = $Arguments
    $info.WorkingDirectory = $WorkingDirectory
    $info.UseShellExecute = $false; $info.CreateNoWindow = $true
    $info.RedirectStandardOutput = $true; $info.RedirectStandardError = $true
    $info.EnvironmentVariables['PYTHONUTF8'] = '1'
    $info.StandardOutputEncoding = [Text.Encoding]::UTF8
    $info.StandardErrorEncoding = [Text.Encoding]::UTF8
    $process = [Diagnostics.Process]::Start($info)
    try {
        $stdout = $process.StandardOutput.ReadToEndAsync()
        $stderr = $process.StandardError.ReadToEndAsync()
        if (-not $process.WaitForExit(120000)) {
            $process.Kill()
            throw '本地组件检查超时。请保留诊断并重试，不要开始采集。'
        }
        return [pscustomobject]@{ ExitCode = $process.ExitCode; Stdout = $stdout.Result; Stderr = $stderr.Result }
    } finally { $process.Dispose() }
}

function Test-CollectorModels([string]$ReleaseRoot) {
    $python = Join-Path $ReleaseRoot 'runtime/python/python.exe'
    $helper = Join-Path $ReleaseRoot 'collector/border_ocr.py'
    Write-Host '[检查是否可运行] 正在加载本机三份中文模型；此时尚未就绪…'
    $result = Invoke-CollectorProcess $python ('"' + $helper + '" --self-test') $ReleaseRoot
    if ($result.ExitCode -ne 0) { throw "本地 OCR 自检失败：$($result.Stderr) $($result.Stdout)" }
    $status = $result.Stdout | ConvertFrom-Json
    if ($status.ready -ne $true) { throw '本地模型未返回有效就绪结果。' }
    return $status
}

function Install-CollectorVisualCpp([string]$PackageRoot, [string]$InstallRoot, $Package, [bool]$Offline) {
    $vc = $Package.visualCpp
    Write-Host "[微软运行库] 本机原生依赖无法加载；需要 $($vc.name) $($vc.version)。"
    Write-Host '将打开微软原始安装窗口。请核对发布者 Microsoft Corporation，阅读许可并确认；Windows 管理员授权也由你选择。取消后本工具不会显示安装成功。'
    $installer = Get-CollectorComponent $PackageRoot (Join-Path $InstallRoot 'component-cache') $vc $Offline
    $signature = Get-AuthenticodeSignature -LiteralPath $installer
    if ($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Subject -notmatch '(^|,\s*)CN=Microsoft Corporation(,|$)') {
        throw '微软运行库签名校验未通过。未执行该组件；请检查系统时间、网络证书或联系设备管理员。'
    }
    try {
        $process = Start-Process -FilePath $installer -ArgumentList @('/install', '/norestart') -Verb RunAs -Wait -PassThru
    } catch {
        if ((Get-CollectorNativeErrorCode $_.Exception) -eq 1223) { throw '微软运行库未安装：管理员授权已取消。请重新双击安装入口重试。' }
        throw "微软运行库未安装：授权失败、权限不足或系统拦截。请按窗口提示处理。$($_.Exception.Message)"
    }
    if ($process.ExitCode -eq 3010) { throw '微软运行库需要重启 Windows。请保存工作并重启，再双击安装入口继续；本次尚未登记安装成功。' }
    if ($process.ExitCode -ne 0) { throw "微软运行库安装未完成（代码 $($process.ExitCode)）。请按微软窗口提示处理或重试。" }
}

function Get-CollectorStableNames {
    return @('collector-install.psm1', 'install-voyage-clip-collector-cn.ps1', 'launch-voyage-clip-collector-cn.ps1',
        'manage-voyage-clip-collector-cn.ps1', '启动国服海图采集器.cmd', '维护国服海图采集器.cmd', '使用说明.html')
}

function Assert-CollectorOwnedLocation([string]$Root, [string]$Path, [switch]$AllowRootLink) {
    $base = [IO.Path]::GetFullPath($Root).TrimEnd([IO.Path]::DirectorySeparatorChar)
    $current = [IO.Path]::GetFullPath($Path)
    while ($current.StartsWith($base, [StringComparison]::OrdinalIgnoreCase)) {
        if (-not ($AllowRootLink -and $current -eq $base) -and (Test-Path -LiteralPath $current) -and ((Get-Item -LiteralPath $current -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)) {
            throw "拒绝跟随安装目录中的链接：$current。请保留资料并从完整候选修复。"
        }
        if ($current -eq $base) { break }
        $current = [IO.Path]::GetDirectoryName($current)
    }
}

function Set-CollectorAtomicFile([string]$Target, [byte[]]$Bytes) {
    $pending = $Target + '.candidate-' + [guid]::NewGuid().ToString('N')
    try {
        [IO.File]::WriteAllBytes($pending, $Bytes)
        if ([IO.File]::Exists($Target)) { [IO.File]::Replace($pending, $Target, [NullString]::Value) }
        else { [IO.File]::Move($pending, $Target) }
    } finally {
        if ([IO.File]::Exists($pending)) { [IO.File]::Delete($pending) }
    }
}

function Get-CollectorTransactionTarget([string]$InstallRoot, $Journal, $Entry) {
    if ($Entry.scope -eq 'install') {
        if ($Entry.path -notin (@(Get-CollectorStableNames) + @('current.json', 'previous.json', 'owned-files.json'))) {
            throw '事务包含未登记的安装目标，已停止恢复。'
        }
        $target = Get-CollectorPath $InstallRoot $Entry.path
        Assert-CollectorOwnedLocation $InstallRoot $target
        return $target
    }
    if ($Entry.scope -eq 'desktop') {
        if ($Entry.path -notin @('国服海图采集器.lnk', '国服海图采集器使用说明.lnk', '国服海图采集器维护.lnk')) {
            throw '事务包含未知快捷方式，已停止恢复。'
        }
        $target = Get-CollectorPath $Journal.desktopRoot $Entry.path
        Assert-CollectorOwnedLocation $Journal.desktopRoot $target -AllowRootLink
        return $target
    }
    throw '事务目标范围不兼容，已停止恢复。'
}

function Get-CollectorTransaction([string]$InstallRoot) {
    $file = Join-Path $InstallRoot 'transaction.json'
    if (-not (Test-Path -LiteralPath $file)) { return $null }
    $journal = Get-Content -LiteralPath $file -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($journal.id -ne 'voyage-clip-collector-cn' -or $journal.schemaVersion -ne 1 -or
        $journal.phase -notin @('prepared', 'applying', 'committed') -or
        $journal.directory -notmatch '^transactions/[a-f0-9]{32}$') { throw '中断事务记录损坏，请保留诊断并使用完整候选修复。' }
    $directory = Get-CollectorPath $InstallRoot $journal.directory
    Assert-CollectorOwnedLocation $InstallRoot $directory
    foreach ($entry in $journal.entries) {
        $null = Get-CollectorTransactionTarget $InstallRoot $journal $entry
        if ($entry.newSha256 -notmatch '^[a-f0-9]{64}$') { throw '事务目标摘要无效。' }
        if ($entry.existed -and $journal.phase -ne 'committed') {
            if ($entry.backup -notmatch '^backups/\d+$') { throw '事务备份路径无效。' }
            Assert-CollectorFile (Get-CollectorPath $directory $entry.backup) ([pscustomobject]@{ sha256 = $entry.backupSha256; bytes = $entry.backupBytes })
        }
    }
    if ($journal.phase -ne 'committed') {
        $originalCurrent = @($journal.entries | Where-Object { $_.scope -eq 'install' -and $_.path -eq 'current.json' -and $_.existed })
        if ($originalCurrent.Count) {
            $original = Get-Content -LiteralPath (Get-CollectorPath $directory $originalCurrent[0].backup) -Raw -Encoding UTF8 | ConvertFrom-Json
            if ($original.id -ne 'voyage-clip-collector-cn') { throw '原登记不属于本工具，拒绝覆盖。' }
            if ($original.PSObject.Properties['desktopRoot'] -and $original.desktopRoot -ne $journal.desktopRoot) {
                throw '事务桌面归属与原安装登记不一致。'
            }
        } elseif ($env:OS -eq 'Windows_NT' -and $journal.desktopRoot -ne [Environment]::GetFolderPath('Desktop')) {
            throw '首次安装事务的桌面归属不匹配。'
        }
    }
    return $journal
}

function Remove-CollectorEmptyParents([string]$Root, [string]$File) {
    $base = [IO.Path]::GetFullPath($Root).TrimEnd([IO.Path]::DirectorySeparatorChar)
    $directory = [IO.Path]::GetDirectoryName($File)
    while ($directory.Length -gt $base.Length -and $directory.StartsWith($base + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
        try { [IO.Directory]::Delete($directory, $false) } catch { break }
        $directory = [IO.Path]::GetDirectoryName($directory)
    }
}

function Remove-CollectorTransactionFiles([string]$InstallRoot, $Journal) {
    $directory = Get-CollectorPath $InstallRoot $Journal.directory
    foreach ($entry in $Journal.entries) {
        foreach ($property in @('backup', 'new')) {
            if ($entry.PSObject.Properties[$property] -and $entry.$property) {
                $path = Get-CollectorPath $directory $entry.$property
                Assert-CollectorOwnedLocation $InstallRoot $path
                if (Test-Path -LiteralPath $path -PathType Leaf) { Remove-Item -LiteralPath $path -Force }
                Remove-CollectorEmptyParents $InstallRoot $path
            }
        }
    }
    Remove-Item -LiteralPath (Join-Path $InstallRoot 'transaction.json') -Force
}

function Restore-CollectorTransaction([string]$InstallRoot) {
    $journal = Get-CollectorTransaction $InstallRoot
    if (-not $journal) { return }
    $directory = Get-CollectorPath $InstallRoot $journal.directory
    if ($journal.phase -ne 'committed') {
        # Preflight every target before restoring any bytes: user edits made
        # since the interruption are preserved instead of overwritten.
        foreach ($entry in $journal.entries) {
            $target = Get-CollectorTransactionTarget $InstallRoot $journal $entry
            if (Test-Path -LiteralPath $target) {
                $hash = (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash.ToLowerInvariant()
                if ($hash -ne $entry.newSha256 -and (-not $entry.existed -or $hash -ne $entry.backupSha256)) {
                    throw "事务后文件另有修改，已保留且未强行覆盖：$target。请保留事务和诊断后反馈。"
                }
            }
        }
        for ($i = $journal.entries.Count - 1; $i -ge 0; $i--) {
            $entry = $journal.entries[$i]
            $target = Get-CollectorTransactionTarget $InstallRoot $journal $entry
            if ($entry.existed) {
                $backup = Get-CollectorPath $directory $entry.backup
                if (-not (Test-Path -LiteralPath $target) -or
                    (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash.ToLowerInvariant() -ne $entry.backupSha256) {
                    Set-CollectorAtomicFile $target ([IO.File]::ReadAllBytes($backup))
                }
                [IO.File]::SetAttributes($target, [IO.FileAttributes]$entry.attributes)
            } elseif (Test-Path -LiteralPath $target) { Remove-Item -LiteralPath $target -Force }
        }
        Remove-CollectorCreatedFiles $InstallRoot $journal.createdFiles
        Write-Host '已恢复中断前的稳定入口、快捷方式及版本登记；请启动后再做真实模型检查。'
    } else { Write-Host '上次切换已提交，保留已提交版本并清理事务记录。' }
    Remove-CollectorTransactionFiles $InstallRoot $journal
}

function Get-CollectorOwnership([string]$InstallRoot, $Registration) {
    if ($Registration.PSObject.Properties['ownership']) {
        $file = Join-Path $InstallRoot 'owned-files.json'
        Assert-CollectorFile $file $Registration.ownership
        $ledger = Get-Content -LiteralPath $file -Raw -Encoding UTF8 | ConvertFrom-Json
        if ($ledger.id -ne 'voyage-clip-collector-cn' -or $ledger.schemaVersion -ne 1) { throw '文件归属登记损坏，请从完整候选修复。' }
        $files = @($ledger.files)
    } else {
        # Adopt only paths proven by a valid old inventory/source manifest.
        # Missing runtime files do not prevent repair; unknown files are ignored.
        $inventory = Get-CollectorPath $InstallRoot ($Registration.release + '/installed-files.json')
        Assert-CollectorFile $inventory $Registration.inventory
        $files = @(Get-Content -LiteralPath $inventory -Raw -Encoding UTF8 | ConvertFrom-Json | ForEach-Object {
            foreach ($entry in $_) { [pscustomobject]@{ path = $Registration.release + '/' + $entry.path; sha256 = $entry.sha256; bytes = $entry.bytes } }
        })
        $files += [pscustomobject]@{ path = $Registration.release + '/installed-files.json'; sha256 = $Registration.inventory.sha256; bytes = $Registration.inventory.bytes }
        $source = Get-CollectorPath $InstallRoot $Registration.package
        $package = Get-CollectorPackage $source
        foreach ($entry in $package.files) {
            $files += [pscustomobject]@{ path = $Registration.package + '/' + $entry.path; sha256 = $entry.sha256; bytes = $entry.bytes }
        }
        $packageFile = Get-Item -LiteralPath (Join-Path $source 'collector-package.json')
        $files += [pscustomobject]@{ path = $Registration.package + '/collector-package.json'; sha256 = (Get-FileHash -LiteralPath $packageFile.FullName -Algorithm SHA256).Hash.ToLowerInvariant(); bytes = $packageFile.Length }
        foreach ($name in Get-CollectorStableNames) {
            $original = @($package.files | Where-Object { $_.path -eq $name })
            $installed = Join-Path $InstallRoot $name
            if ($original.Count -and (Test-Path -LiteralPath $installed -PathType Leaf)) {
                try { Assert-CollectorFile $installed $original[0]; $files += $original[0] } catch { }
            }
        }
    }
    foreach ($entry in $files) {
        $relative = $entry.path.Replace('\', '/')
        if ($relative -notin (Get-CollectorStableNames) -and
            $relative -notmatch '^(releases|packages)/\d+\.\d+\.\d+-[a-f0-9]{8}/' -and
            $relative -notmatch '^component-cache/[A-Za-z0-9_.+\-]+$') {
            throw "拒绝清理未登记范围：$relative"
        }
        if ($entry.sha256 -notmatch '^[a-fA-F0-9]{64}$' -or $entry.bytes -lt 0) { throw '文件归属摘要无效。' }
        $null = Get-CollectorPath $InstallRoot $relative
    }
    return $files
}

function Remove-CollectorInstallation([string]$InstallRoot, $Registration) {
    $owned = @(Get-CollectorOwnership $InstallRoot $Registration)
    # Validate paths and links before deleting anything. Preserve changed bytes,
    # personal screenshots and diagnostics even inside a release directory.
    foreach ($entry in $owned) {
        Assert-CollectorOwnedLocation $InstallRoot (Get-CollectorPath $InstallRoot $entry.path)
    }
    if ($Registration.PSObject.Properties['shortcuts']) {
        foreach ($entry in $Registration.shortcuts) {
            $null = Get-CollectorTransactionTarget $InstallRoot $Registration ([pscustomobject]@{ scope = 'desktop'; path = $entry.name })
            if ($entry.sha256 -notmatch '^[a-fA-F0-9]{64}$' -or $entry.bytes -lt 0) { throw '快捷方式归属记录损坏，未开始卸载。' }
        }
    }
    foreach ($entry in $owned) {
        $path = Get-CollectorPath $InstallRoot $entry.path
        if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { continue }
        try { Assert-CollectorFile $path $entry } catch { Write-Host "保留已修改或未知内容：$path"; continue }
        Remove-Item -LiteralPath $path -Force
        Remove-CollectorEmptyParents $InstallRoot $path
    }
    if ($Registration.PSObject.Properties['shortcuts']) {
        foreach ($entry in $Registration.shortcuts) {
            $descriptor = [pscustomobject]@{ scope = 'desktop'; path = $entry.name }
            $target = Get-CollectorTransactionTarget $InstallRoot $Registration $descriptor
            if (-not (Test-Path -LiteralPath $target -PathType Leaf)) { continue }
            try { Assert-CollectorFile $target $entry } catch { Write-Host "保留已修改快捷方式：$target"; continue }
            Remove-Item -LiteralPath $target -Force
        }
    } else { Write-Host '旧登记没有可验证的快捷方式归属，保留未登记快捷方式。' }
    foreach ($name in @('previous.json', 'owned-files.json')) {
        $path = Join-Path $InstallRoot $name
        if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { continue }
        if ($name -eq 'previous.json') {
            try { $previous = Get-Content -LiteralPath $path -Raw -Encoding UTF8 | ConvertFrom-Json; if ($previous.id -ne 'voyage-clip-collector-cn') { continue } }
            catch { Write-Host "保留未知旧登记：$path"; continue }
        }
        if ($name -eq 'collector.running.lock' -and (Get-Item -LiteralPath $path).Length -ne 0) { continue }
        Remove-Item -LiteralPath $path -Force
    }
    Remove-Item -LiteralPath (Join-Path $InstallRoot 'current.json') -Force
    Write-Host '已移除登记组件与启动入口。保留诊断、主动保存资料、未登记/已修改内容；网页库存/规划与共享微软运行库未被清理。'
}

function New-CollectorFileRecord([string]$File, [string]$Relative) {
    return [pscustomobject]@{ path = $Relative; sha256 = (Get-FileHash -LiteralPath $File -Algorithm SHA256).Hash.ToLowerInvariant(); bytes = (Get-Item -LiteralPath $File).Length }
}

function Invoke-CollectorFileTransaction([string]$InstallRoot, [string]$DesktopRoot, $Writes, $CreatedFiles) {
    if (@(Get-CollectorRunning $InstallRoot).Count) { throw '采集器已启动，请先 F7 导出并退出，再更新。' }
    $activationLock = $null; $committed = $false
    $directoryRelative = 'transactions/' + [guid]::NewGuid().ToString('N')
    $directory = Get-CollectorPath $InstallRoot $directoryRelative
    $journal = [pscustomobject]@{ schemaVersion = 1; id = 'voyage-clip-collector-cn'; phase = 'prepared'
        directory = $directoryRelative; desktopRoot = $DesktopRoot; entries = @(); createdFiles = @($CreatedFiles) }
    try {
        # Hold the same OS file lock used by AHK throughout activation. A new
        # launch cannot begin collecting between the last check and the switch.
        $activationLock = [IO.File]::Open((Join-Path $InstallRoot 'collector.running.lock'), [IO.FileMode]::OpenOrCreate, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None)
        New-Item -ItemType Directory -Path (Join-Path $directory 'backups') -Force | Out-Null
        New-Item -ItemType Directory -Path (Join-Path $directory 'new') -Force | Out-Null
        for ($i = 0; $i -lt $Writes.Count; $i++) {
            $write = $Writes[$i]
            $entry = [ordered]@{ scope = $write.scope; path = $write.path; existed = $false; new = 'new/' + $i
                newSha256 = ''; newBytes = $write.bytes.Length; attributes = 128 }
            $newFile = Get-CollectorPath $directory $entry.new
            [IO.File]::WriteAllBytes($newFile, $write.bytes)
            $entry.newSha256 = (Get-FileHash -LiteralPath $newFile -Algorithm SHA256).Hash.ToLowerInvariant()
            $target = Get-CollectorTransactionTarget $InstallRoot $journal ([pscustomobject]$entry)
            if (Test-Path -LiteralPath $target) {
                if (-not (Test-Path -LiteralPath $target -PathType Leaf)) { throw "安装目标不是文件：$target" }
                $entry.existed = $true; $entry['backup'] = 'backups/' + $i
                $entry['backupSha256'] = (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash.ToLowerInvariant()
                $entry['backupBytes'] = (Get-Item -LiteralPath $target).Length
                $entry.attributes = [int][IO.File]::GetAttributes($target)
                Copy-Item -LiteralPath $target -Destination (Get-CollectorPath $directory $entry.backup)
            }
            $journal.entries += [pscustomobject]$entry
        }
        $journalPath = Join-Path $InstallRoot 'transaction.json'
        Set-CollectorAtomicFile $journalPath ([Text.Encoding]::UTF8.GetBytes((ConvertTo-Json $journal -Depth 10)))
        $journal.phase = 'applying'
        Set-CollectorAtomicFile $journalPath ([Text.Encoding]::UTF8.GetBytes((ConvertTo-Json $journal -Depth 10)))
        foreach ($entry in $journal.entries) {
            $target = Get-CollectorTransactionTarget $InstallRoot $journal $entry
            $new = Get-CollectorPath $directory $entry.new
            Assert-CollectorFile $new ([pscustomobject]@{ sha256 = $entry.newSha256; bytes = $entry.newBytes })
            Set-CollectorAtomicFile $target ([IO.File]::ReadAllBytes($new))
        }
        $journal.phase = 'committed'
        Set-CollectorAtomicFile $journalPath ([Text.Encoding]::UTF8.GetBytes((ConvertTo-Json $journal -Depth 10)))
        $committed = $true
        Remove-CollectorTransactionFiles $InstallRoot $journal
    } catch {
        if ($committed) { Write-Host '版本切换已提交，但事务清理未完成；保留记录，下次维护会继续清理。'; return }
        $failure = $_
        try { Restore-CollectorTransaction $InstallRoot }
        catch { throw "切换失败，恢复尚未完成。旧版本文件仍保留，请不要启动；保留事务与诊断并重试恢复。$($_.Exception.Message)" }
        throw $failure
    } finally {
        if ($activationLock) { $activationLock.Dispose() }
    }
}

function Remove-CollectorCreatedFiles([string]$InstallRoot, $Files) {
    foreach ($entry in $Files) {
        if ($entry.path -notmatch '^(releases|packages)/\d+\.\d+\.\d+-[a-f0-9]{8}/') { throw '拒绝清理未知暂存范围。' }
        $file = Get-CollectorPath $InstallRoot $entry.path
        Assert-CollectorOwnedLocation $InstallRoot $file
        if (Test-Path -LiteralPath $file -PathType Leaf) {
            try { Assert-CollectorFile $file $entry } catch { Write-Host "保留已修改文件：$file"; continue }
            Remove-Item -LiteralPath $file -Force
            Remove-CollectorEmptyParents $InstallRoot $file
        }
    }
}

function Complete-CollectorInstallation([string]$PackageRoot, [string]$InstallRoot, [string]$Prepared, $Package) {
    $old = $null; $owned = @{}
    if (Test-Path -LiteralPath (Join-Path $InstallRoot 'current.json')) {
        $old = Get-CollectorRegistration $InstallRoot
        try {
            foreach ($entry in @(Get-CollectorOwnership $InstallRoot $old)) { $owned[$entry.path.ToLowerInvariant()] = $entry }
        } catch { Write-Host '旧文件归属记录不完整；保留无法验证的旧资料，新版本建立独立清单。' }
    }
    $desktop = [Environment]::GetFolderPath('Desktop')
    if ($old -and $old.PSObject.Properties['desktopRoot']) { $desktop = $old.desktopRoot }
    elseif ($old -and $env:OS -eq 'Windows_NT') {
        $owner = (Get-Acl -LiteralPath $InstallRoot).GetOwner([Security.Principal.SecurityIdentifier]).Value
        if ($owner -ne [Security.Principal.WindowsIdentity]::GetCurrent().User.Value) {
            throw '旧登记没有记录桌面归属。请使用原安装用户的维护入口更新，避免改动另一管理员的桌面。'
        }
    }
    $releaseName = $Package.version + '-' + [guid]::NewGuid().ToString('N').Substring(0, 8)
    $relative = 'releases/' + $releaseName
    $final = Get-CollectorPath $InstallRoot $relative
    # Include files genuinely created by model initialization, including owned
    # Python caches. No user diagnostics/screenshots are scanned into ownership.
    $inventory = @(Get-ChildItem -LiteralPath $Prepared -File -Recurse | Where-Object { $_.Name -ne 'installed-files.json' } | ForEach-Object {
        New-CollectorFileRecord $_.FullName ($_.FullName.Substring($Prepared.Length + 1).Replace('\', '/'))
    })
    [IO.File]::WriteAllText((Join-Path $Prepared 'installed-files.json'), (ConvertTo-Json -InputObject $inventory -Depth 6), [Text.Encoding]::UTF8)
    $inventoryRecord = New-CollectorFileRecord (Join-Path $Prepared 'installed-files.json') 'installed-files.json'
    $created = @()
    foreach ($entry in @($inventory) + @($inventoryRecord)) {
        $record = [pscustomobject]@{ path = $relative + '/' + $entry.path; sha256 = $entry.sha256; bytes = $entry.bytes }
        $owned[$record.path.ToLowerInvariant()] = $record; $created += $record
    }
    try {
    Move-Item -LiteralPath $Prepared -Destination $final
    $sourceRelative = 'packages/' + $releaseName
    $source = Get-CollectorPath $InstallRoot $sourceRelative
    New-Item -ItemType Directory -Path $source -Force | Out-Null
    foreach ($entry in $Package.files) {
        $original = Get-CollectorPath $PackageRoot $entry.path
        Assert-CollectorFile $original $entry
        $destination = Get-CollectorPath $source $entry.path
        New-Item -ItemType Directory -Path ([IO.Path]::GetDirectoryName($destination)) -Force | Out-Null
        Copy-Item -LiteralPath $original -Destination $destination
        $record = [pscustomobject]@{ path = $sourceRelative + '/' + $entry.path; sha256 = $entry.sha256; bytes = $entry.bytes }
        $owned[$record.path.ToLowerInvariant()] = $record; $created += $record
    }
    Copy-Item -LiteralPath (Join-Path $PackageRoot 'collector-package.json') -Destination $source
    $record = New-CollectorFileRecord (Join-Path $source 'collector-package.json') ($sourceRelative + '/collector-package.json')
    $owned[$record.path.ToLowerInvariant()] = $record; $created += $record
    $ocr = Get-Content -LiteralPath (Join-Path $source 'payload/collector/ocr-runtime.json') -Raw -Encoding UTF8 | ConvertFrom-Json
    foreach ($entry in @($Package.autoHotkey, $ocr.python) + @($ocr.packages) + @($Package.visualCpp)) {
        $cached = Get-CollectorPath (Join-Path $InstallRoot 'component-cache') $entry.filename
        if (Test-Path -LiteralPath $cached -PathType Leaf) {
            try {
                Assert-CollectorFile $cached $entry
                $record = [pscustomobject]@{ path = 'component-cache/' + $entry.filename; sha256 = $entry.sha256; bytes = $entry.bytes }
                $owned[$record.path.ToLowerInvariant()] = $record
            } catch { }
        }
    }
    $writes = @()
    foreach ($name in Get-CollectorStableNames) {
        $file = Join-Path $PackageRoot $name
        if (-not (Test-Path -LiteralPath $file -PathType Leaf)) { throw "候选缺少维护入口：$name" }
        $writes += [pscustomobject]@{ scope = 'install'; path = $name; bytes = [IO.File]::ReadAllBytes($file) }
        $record = New-CollectorFileRecord $file $name
        $owned[$name.ToLowerInvariant()] = $record
    }
    Write-Host '[创建快捷方式] 正在暂存原安装用户的启动、说明与维护入口…'
    $shell = New-Object -ComObject WScript.Shell
    $shortcutRecords = @()
    $shortcutStage = Join-Path $source 'shortcut-stage'
    New-Item -ItemType Directory -Path $shortcutStage -Force | Out-Null
    foreach ($name in @('国服海图采集器.lnk', '国服海图采集器使用说明.lnk', '国服海图采集器维护.lnk')) {
        $target = Get-CollectorPath $desktop $name
        if (Test-Path -LiteralPath $target) {
            $known = @()
            if ($old -and $old.PSObject.Properties['shortcuts']) { $known = @($old.shortcuts | Where-Object { $_.name -eq $name }) }
            if ($known.Count) { Assert-CollectorFile $target $known[0] }
            elseif ($old) {
                $legacy = $shell.CreateShortcut($target)
                $expectedHelp = Get-CollectorPath $InstallRoot ($old.package + '/使用说明.html')
                $expectedArgs = '-NoLogo -NoProfile -ExecutionPolicy Bypass -File "' + (Join-Path $InstallRoot 'launch-voyage-clip-collector-cn.ps1') + '" -InstallRoot "' + $InstallRoot + '"'
                if (-not (($name -eq '国服海图采集器使用说明.lnk' -and $legacy.TargetPath -eq $expectedHelp) -or
                    ($name -eq '国服海图采集器.lnk' -and $legacy.Arguments -eq $expectedArgs))) {
                    throw "桌面同名快捷方式无法确认为本工具所有，已保留：$target。请改名后重试。"
                }
            } else { throw "桌面同名快捷方式已存在，未覆盖：$target。请保留并改名后重试。" }
        }
        $staged = Join-Path $shortcutStage $name
        $shortcut = $shell.CreateShortcut($staged)
        if ($name -eq '国服海图采集器使用说明.lnk') { $shortcut.TargetPath = Join-Path $InstallRoot '使用说明.html' }
        else {
            $entry = 'launch-voyage-clip-collector-cn.ps1'
            if ($name -eq '国服海图采集器维护.lnk') { $entry = 'manage-voyage-clip-collector-cn.ps1' }
            $escaped = (Join-Path $InstallRoot $entry).Replace("'", "''")
            $escapedRoot = $InstallRoot.Replace("'", "''")
            $bootstrap = "if(-not(Test-Path -LiteralPath '$escaped')){Write-Host '入口缺失，请重新解压完整候选，双击安装或更新国服海图采集器.cmd；不要猜命令。'; Read-Host '按 Enter 关闭';exit 1}; & '$escaped' -InstallRoot '$escapedRoot'"
            if ($name -eq '国服海图采集器维护.lnk') { $bootstrap += "; Read-Host '维护结果已显示，按 Enter 关闭'" }
            $encoded = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($bootstrap))
            $shortcut.TargetPath = Join-Path $env:SystemRoot 'System32/WindowsPowerShell/v1.0/powershell.exe'
            $shortcut.Arguments = '-NoLogo -NoProfile -ExecutionPolicy Bypass -EncodedCommand ' + $encoded
        }
        $shortcut.WorkingDirectory = $InstallRoot
        $shortcut.Save()
        $bytes = [IO.File]::ReadAllBytes($staged)
        $writes += [pscustomobject]@{ scope = 'desktop'; path = $name; bytes = $bytes }
        $record = New-CollectorFileRecord $staged ('shortcut-stage/' + $name)
        $sourceRecord = [pscustomobject]@{ path = $sourceRelative + '/' + $record.path; sha256 = $record.sha256; bytes = $record.bytes }
        $owned[$sourceRecord.path.ToLowerInvariant()] = $sourceRecord; $created += $sourceRecord
        $shortcutRecords += [pscustomobject]@{ name = $name; sha256 = $record.sha256; bytes = $record.bytes }
    }
    $ledger = [ordered]@{ schemaVersion = 1; id = $Package.id; files = @($owned.Values | Sort-Object path) }
    $ledgerBytes = [Text.Encoding]::UTF8.GetBytes((ConvertTo-Json $ledger -Depth 8))
    $ledgerHash = [Security.Cryptography.SHA256]::Create()
    try { $ownershipSha = ([BitConverter]::ToString($ledgerHash.ComputeHash($ledgerBytes))).Replace('-', '').ToLowerInvariant() }
    finally { $ledgerHash.Dispose() }
    $registration = [ordered]@{ schemaVersion = 1; id = $Package.id; version = $Package.version; release = $relative; package = $sourceRelative
        inventory = @{ sha256 = $inventoryRecord.sha256; bytes = $inventoryRecord.bytes }
        ownership = @{ sha256 = $ownershipSha; bytes = $ledgerBytes.Length }; desktopRoot = $desktop; shortcuts = $shortcutRecords }
    $writes += [pscustomobject]@{ scope = 'install'; path = 'owned-files.json'; bytes = $ledgerBytes }
    if ($old) { $writes += [pscustomobject]@{ scope = 'install'; path = 'previous.json'; bytes = [IO.File]::ReadAllBytes((Join-Path $InstallRoot 'current.json')) } }
    # Current binding is last. A crash before committed-journal state restores
    # every stable entry point and shortcut together with the previous binding.
    $writes += [pscustomobject]@{ scope = 'install'; path = 'current.json'; bytes = [Text.Encoding]::UTF8.GetBytes((ConvertTo-Json $registration -Depth 8)) }
    Invoke-CollectorFileTransaction $InstallRoot $desktop $writes $created
    } catch {
        if (-not (Test-Path -LiteralPath (Join-Path $InstallRoot 'transaction.json'))) {
            Remove-CollectorCreatedFiles $InstallRoot $created
        }
        throw
    }
}

Export-ModuleMember -Function *-Collector*
