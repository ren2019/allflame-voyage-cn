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
        Copy-Item -Path (Join-Path $PackageRoot 'payload/*') -Destination $release -Recurse -Force
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

function Get-CollectorInstallation([string]$InstallRoot) {
    $current = Join-Path $InstallRoot 'current.json'
    if (-not (Test-Path -LiteralPath $current -PathType Leaf)) {
        throw '尚未安装国服海图采集器。请解压候选包，双击“安装或更新国服海图采集器.cmd”。'
    }
    $registration = Get-Content -LiteralPath $current -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($registration.id -ne 'voyage-clip-collector-cn' -or $registration.version -notmatch '^\d+\.\d+\.\d+$') {
        throw '安装登记损坏。请使用同一安装入口修复。'
    }
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

function Complete-CollectorInstallation([string]$PackageRoot, [string]$InstallRoot, [string]$Prepared, $Package) {
    $releaseName = $Package.version + '-' + [guid]::NewGuid().ToString('N').Substring(0, 8)
    $relative = 'releases/' + $releaseName
    $final = Get-CollectorPath $InstallRoot $relative
    Move-Item -LiteralPath $Prepared -Destination $final
    $inventoryFile = Get-Item -LiteralPath (Join-Path $final 'installed-files.json')
    $registration = [ordered]@{ schemaVersion = 1; id = $Package.id; version = $Package.version; release = $relative
        inventory = @{ sha256 = (Get-FileHash -LiteralPath $inventoryFile.FullName -Algorithm SHA256).Hash.ToLowerInvariant(); bytes = $inventoryFile.Length }
    }
    # Keep the small, checked source bundle for repair. Component archives are
    # cached separately; user diagnostics and browser data are never inputs.
    $source = Join-Path $InstallRoot ('packages/' + $releaseName)
    New-Item -ItemType Directory -Path $source -Force | Out-Null
    foreach ($entry in $Package.files) {
        $destination = Get-CollectorPath $source $entry.path
        New-Item -ItemType Directory -Path ([IO.Path]::GetDirectoryName($destination)) -Force | Out-Null
        Copy-Item -LiteralPath (Get-CollectorPath $PackageRoot $entry.path) -Destination $destination
    }
    Copy-Item -LiteralPath (Join-Path $PackageRoot 'collector-package.json') -Destination $source
    $registration['package'] = 'packages/' + $releaseName
    foreach ($name in @('collector-install.psm1', 'launch-voyage-clip-collector-cn.ps1', '启动国服海图采集器.cmd')) {
        Copy-Item -LiteralPath (Join-Path $PackageRoot $name) -Destination (Join-Path $InstallRoot $name) -Force
    }
    Write-Host '[创建快捷方式] 正在创建当前用户桌面入口…'
    $shell = New-Object -ComObject WScript.Shell
    $shortcut = $shell.CreateShortcut((Join-Path ([Environment]::GetFolderPath('Desktop')) '国服海图采集器.lnk'))
    $shortcut.TargetPath = Join-Path $env:SystemRoot 'System32/WindowsPowerShell/v1.0/powershell.exe'
    $shortcut.Arguments = '-NoLogo -NoProfile -ExecutionPolicy Bypass -File "' + (Join-Path $InstallRoot 'launch-voyage-clip-collector-cn.ps1') + '" -InstallRoot "' + $InstallRoot + '"'
    $shortcut.WorkingDirectory = $InstallRoot
    $shortcut.Description = '国服海图采集器；正常 Windows 管理员授权后启动；游戏操作由玩家执行'
    $shortcut.Save()
    $help = $shell.CreateShortcut((Join-Path ([Environment]::GetFolderPath('Desktop')) '国服海图采集器使用说明.lnk'))
    $help.TargetPath = Join-Path $source '使用说明.html'
    $help.Save()
    $pending = Join-Path $InstallRoot 'current.json.pending'
    [IO.File]::WriteAllText($pending, (ConvertTo-Json $registration -Depth 6), [Text.UTF8Encoding]::new($false))
    $current = Join-Path $InstallRoot 'current.json'
    if (Test-Path -LiteralPath $current) {
        [IO.File]::Replace($pending, $current, (Join-Path $InstallRoot 'previous.json'))
    } else { [IO.File]::Move($pending, $current) }
}

Export-ModuleMember -Function *-Collector*
