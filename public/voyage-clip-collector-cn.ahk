#Requires AutoHotkey v2.0
#SingleInstance Ignore
Persistent

; =====================================================================
;  Allflame Voyage - chart & border collector  (AutoHotkey v2)
;
;  This tool sends ZERO inputs to the game. Ever. No keystrokes, no
;  clicks, no mouse movement, no window switching. You press every key
;  yourself; the collector only listens - to the clipboard you copied
;  to, and to a screenshot it takes passively while YOU hold Alt.
;  A test in the site's repo fails the build if any input-sending code
;  ever appears in this file.
;
;  F7 - chart copy mode
;   1. Press F7 - copy mode ON, a counter appears.
;   2. In PoE, hover each chart and press Ctrl+C yourself (Ctrl+Alt+C for advanced text). The counter
;      ticks up per chart (non-charts and double-copies are ignored).
;   3. Press F7 again - everything collected is on the clipboard.
;
;  F8 - border screenshot scan
;   1. In PoE, HOLD Alt yourself so all 12 border tooltips are shown.
;   2. Press F8. A beep tells you the screenshot is taken - let go.
;   3. RapidOCR reads Chinese tooltips locally; other languages use Windows OCR (nothing is uploaded,
;      nothing leaves your PC) and the result lands on the clipboard -
;      or joins the F7 batch if copy mode is on.
;
;  Then ONE Ctrl+V on the solver page imports charts + borders.
;  English, Korean and mainland Simplified Chinese text are supported.
;
;  Shift+F7 mutes/unmutes the beeps (the on-screen counter still works).
;
;  If PoE runs as administrator, run this script as administrator too,
;  or its hotkeys won't register while the game window is focused.
; =====================================================================

CollectorId := "voyage-clip-collector-cn"
CollectorVersion := "0.2.3"
CollectorReady := false
CollectorInstallRoot := ""
CollectorInstanceHandle := 0
for i, arg in A_Args {
    if (arg = "--install-root" && i < A_Args.Length)
        CollectorInstallRoot := A_Args[i + 1]
}

Collecting := false
Collected := []
LastCaptured := ""
LastCopiedLanguage := ""
BorderBlob := ""
BorderCount := 0
Muted := false
StatusMessage := ""
Scanning := false
ScanPhase := ""
LastFailure := ""
LastScanFailure := ""
RecentOutput := ""
RecentOutputNote := ""
LastBorderBlob := ""
LastBorderTime := ""
LastDiagnosticPath := ""

; every sound goes through here so Shift+F7 can silence the lot
Beep(freq, dur) {
    global Muted
    if !Muted
        SoundBeep freq, dur
}

ToggleMute(*) {
    global Muted
    Muted := !Muted
    ShowStatus(Muted ? "🔇 提示音已关闭；Shift+F7 恢复，浮窗继续显示。" : "🔊 提示音已恢复。", 2500)
}

; One timer restores the counter instead of clearing the whole floating tip.
; Cancelling it also prevents an older message from erasing a newer error.
ShowStatus(message, duration := 0) {
    global StatusMessage
    SetTimer ClearStatus, 0
    StatusMessage := message
    ShowCounter()
    if (duration > 0)
        SetTimer ClearStatus, -duration
}

ClearStatus() {
    global StatusMessage, LastFailure, Scanning
    StatusMessage := Scanning ? ScanWaitMessage() : LastFailure
    ShowCounter()
}

; %TEMP% can arrive as an 8.3 short path (C:\Users\HARDPC~1\...) and WinRT
; (which Windows OCR uses to open images) can refuse those - expand it first.
LongPath(path) {
    buf := Buffer(1040, 0)
    len := DllCall("GetLongPathNameW", "Str", path, "Ptr", buf.Ptr, "UInt", 520, "UInt")
    return (len > 0 && len <= 520) ? StrGet(buf, "UTF-16") : path
}
TempDir := LongPath(A_Temp)
ScriptPid := ProcessExist()
HelperPs1 := TempDir "\voyage-border-read-" ScriptPid ".ps1"
HelperOut := TempDir "\voyage-border-read-" ScriptPid ".txt"
HelperShot := TempDir "\voyage-border-read-" ScriptPid ".shot"
HelperPng := TempDir "\voyage-border-read-" ScriptPid ".png"
HelperPid := 0

CleanupHelper(*) {
    global HelperPid, HelperPs1, HelperOut, HelperShot, HelperPng
    if (HelperPid && ProcessExist(HelperPid))
        try ProcessClose HelperPid  ; our own PowerShell child, never the game
    for , f in [HelperPs1, HelperOut, HelperOut ".tmp", HelperShot, HelperPng, HelperPng ".prep.png"]
        try FileDelete f
}
OnExit CleanupHelper

; Inspect the header only; keep the collected advanced-copy text verbatim.
IsChartText(text) {
    text := LTrim(text, Chr(0xFEFF))
    return RegExMatch(text, "im)^[ \t]*(Item Class[ \t]*[:：][ \t]*Charts?|아이템 종류[ \t]*[:：][ \t]*해도|物品类别[ \t]*[:：][ \t]*海图)[ \t]*\r?$")
}

ShowCounter() {
    global Collecting, Collected, BorderCount, StatusMessage, CollectorId, CollectorVersion
    text := ""
    if Collecting {
        text := "📋 采集中：" Collected.Length " 张海图"
            . (BorderCount ? "；已读取 " BorderCount "/12 处边界文字" : "")
            . "`nCtrl+C 复制海图；Ctrl+Alt+C 高级复制。`nF8 读取边界；F7 结束。"
    }
    if (StatusMessage != "")
        text .= (text = "" ? "" : "`n") StatusMessage
    if (text != "")
        text := CollectorId " v" CollectorVersion "`n" text
    ShowCollectorStatus(text)
}

; A larger status panel keeps the original counter/error role without taking
; focus or intercepting the player's mouse. Recreate the text control so its
; height follows wrapped messages instead of clipping longer OCR errors.
ShowCollectorStatus(text) {
    static panel := 0
    if IsObject(panel)
        panel.Destroy()
    panel := 0
    if (text = "")
        return
    panel := Gui("+AlwaysOnTop -Caption +ToolWindow +E0x08000020", "航程采集状态")
    panel.BackColor := "202630"
    panel.MarginX := 20
    panel.MarginY := 14
    panel.SetFont("s16 cFFFFFF", "Microsoft YaHei UI")
    width := Min(640, Floor(A_ScreenWidth * 96 / A_ScreenDPI) - 48)
    panel.AddText("w" width, text)
    ; A layered window plus WS_EX_TRANSPARENT passes mouse events through.
    WinSetTransparent 255, panel.Hwnd
    panel.Show("NoActivate AutoSize xCenter y40")
}

OnClipChanged(dataType) {
    global Collecting, Collected, LastCaptured, LastCopiedLanguage
    if (!Collecting || dataType != 1)
        return
    text := ""
    try text := A_Clipboard
    catch {
        ShowStatus("读取剪贴板失败，请重新手动复制海图。", 5000)
        return
    }
    if (text = "")
        return
    if !IsChartText(text)
        return
    LastCopiedLanguage := ChartLanguage(text)
    ; double-tap protection: the SAME chart copied twice in a row is one
    ; chart (two different-but-identical charts still count when they are
    ; copied non-consecutively)
    if (text == LastCaptured)
        return
    LastCaptured := text
    Collected.Push(text)
    Beep(880, 60)
    ShowCounter()
}
OnClipboardChange OnClipChanged

ScanWaitMessage() {
    global ScanPhase
    return ScanPhase = "截图中"
        ? "正在截图，请继续按住 Alt；截图完成前不要结束批次。"
        : "截图已完成，可以松开 Alt；正在识别中，请等待完成后再按 F7。"
}

SaveCollectorDiagnostic(stage, message) {
    global CollectorInstallRoot, TempDir, CollectorVersion, LastBorderBlob, LastBorderTime, LastDiagnosticPath
    root := CollectorInstallRoot != "" ? CollectorInstallRoot "\diagnostics" : TempDir "\voyage-clip-collector-cn-diagnostics"
    try {
        DirCreate root
        path := root "\collector-last.txt"
        record := "国服采集器 v" CollectorVersion "`n权限模式：" (A_IsAdmin ? "管理员" : "普通权限")
            . "`n阶段：" stage "`n时间：" FormatTime(, "yyyy-MM-dd HH:mm:ss")
            . "`n" message "`n不自动上传；不记录一般剪贴板、海图原文或截图。"
        try record .= "`nOCR/模型兼容清单：`n" FileRead(A_ScriptDir "\collector-release.json", "UTF-8")
        if (LastBorderBlob != "")
            record .= "`n最近一次边界原文（取得时间：" LastBorderTime "；后续截图失败不表示旧原文属于本次）：`n" LastBorderBlob
        file := FileOpen(path ".tmp", "w", "UTF-8")
        file.Write(record)
        file.Close()
        FileMove path ".tmp", path, true
        LastDiagnosticPath := path
    } catch {
        LastDiagnosticPath := ""
    }
}

ShowCollectorDiagnostic(*) {
    global LastDiagnosticPath, LastFailure
    if (LastDiagnosticPath = "")
        SaveCollectorDiagnostic("状态", LastFailure != "" ? LastFailure : "尚无边界读取记录。")
    if (LastDiagnosticPath != "" && FileExist(LastDiagnosticPath)) {
        try Run 'notepad.exe "' LastDiagnosticPath '"'
        catch
            ShowStatus("无法打开记事本。请手动查看本地诊断：" LastDiagnosticPath)
    } else
        ShowStatus("本地诊断未能保存；请保留浮窗的具体错误原文。" (LastFailure != "" ? "`n" LastFailure : ""))
}

WriteCollectorOutput(content, note) {
    global RecentOutput, RecentOutputNote, LastFailure, LastScanFailure
    RecentOutput := content
    RecentOutputNote := note
    try A_Clipboard := content
    catch {
        LastFailure := "输出失败：写入剪贴板失败，内容已保留。请从托盘选择“重试输出内容”，或在采集批次中再按 F7。"
        SaveCollectorDiagnostic("剪贴板输出", LastFailure)
        ShowStatus(LastFailure)
        return false
    }
    LastFailure := LastScanFailure
    message := note "`n内容已输出到剪贴板，请回网页 Ctrl+V；词缀匹配以网页结果为准。"
    if (LastScanFailure != "")
        message .= "`n" LastScanFailure
    SaveCollectorDiagnostic("内容已输出", message)
    ShowStatus(message)
    Beep(1200, 90)
    return true
}

RetryCollectorOutput(*) {
    global Scanning, Collecting, RecentOutput, RecentOutputNote, LastFailure, BorderBlob, BorderCount
    if Scanning {
        ShowStatus(ScanWaitMessage())
        return
    }
    if Collecting {
        ToggleCollect()
        return
    }
    if (RecentOutput = "") {
        ShowStatus("尚无可重试的输出。海图请 F7 开始后逐张手动 Ctrl+Alt+C；边界请按住 Alt 后 F8。" (LastFailure != "" ? "`n" LastFailure : ""))
        return
    }
    if WriteCollectorOutput(RecentOutput, RecentOutputNote) {
        BorderBlob := ""
        BorderCount := 0
    }
}

ToggleCollect(*) {
    global Collecting, Collected, LastCaptured, BorderBlob, BorderCount, CollectorReady, Scanning, LastFailure, LastScanFailure
    if !CollectorReady {
        ShowStatus(LastFailure != "" ? LastFailure : "采集器尚未就绪。请等待模型检查，或使用安装入口修复组件；不要开始采集。")
        return
    }
    if Scanning {
        ShowStatus(ScanWaitMessage())
        return
    }
    if !Collecting {
        Collecting := true
        Collected := []
        LastCaptured := ""
        LastFailure := ""
        LastScanFailure := ""
        ShowStatus("海图采集已开始。请逐张悬停并手动 Ctrl+Alt+C；F7 不会自动扫描仓库。")
        return
    }
    if (Collected.Length = 0 && BorderBlob = "") {
        Collecting := false
        ShowStatus(LastFailure != "" ? LastFailure
            : "本次没有采集到内容。海图：F7 开始后逐张悬停并手动 Ctrl+Alt+C，确认计数增加。`n边界：打开航程规划，按住 Alt 后 F8，看到截图完成再松 Alt；只读边界无需 F7。`n若只有游戏自己的截图提示，请从桌面入口检查权限；它不表示本工具截图成功。")
        return
    }
    combined := ""
    for , chart in Collected
        combined .= (combined = "" ? "" : "`n`n") chart
    if (BorderBlob != "")
        combined .= (combined = "" ? "" : "`n") BorderBlob
    note := "本批内容：" Collected.Length " 张海图"
    if (BorderBlob != "")
        note .= "；已有边界文字 " BorderCount "/12（读取数量不等于网页匹配）"
    ; Ignore our own clipboard notification; restore collection only on failure.
    Collecting := false
    if !WriteCollectorOutput(combined, note) {
        Collecting := true
        return
    }
    BorderBlob := ""
    BorderCount := 0
    Collected := []
    ShowCounter()
}

; Process matching works independently of localized window titles, and avoids
; matching a browser page or launcher whose title happens to mention PoE.
FindPoeWindow() {
    for hwnd in WinGetList() {
        try {
            processName := WinGetProcessName(hwnd)
            if RegExMatch(processName, "i)^PathOfExile(?:_x64)?(?:Steam)?(?:_KG)?\.exe$")
                && WinGetMinMax(hwnd) != -1
                return hwnd
        }
    }
    return 0
}

ChartLanguage(text) {
    text := LTrim(text, Chr(0xFEFF))
    if RegExMatch(text, "im)^[ \t]*物品类别[ \t]*[:：]")
        return "zh-CN"
    if RegExMatch(text, "im)^[ \t]*아이템 종류[ \t]*[:：]")
        return "ko-KR"
    return "en"
}

PreferredOcrLanguage(hwnd := 0) {
    global LastCopiedLanguage
    if hwnd {
        try {
            if RegExMatch(WinGetProcessName(hwnd), "i)_KG\.exe$")
                return "ko-KR"
            if InStr(WinGetTitle(hwnd), "流放之路")
                return "zh-CN"
        }
    }
    observed := LastCopiedLanguage
    try {
        clip := A_Clipboard
        if IsChartText(clip)
            observed := ChartLanguage(clip)
    }
    if (observed != "")
        return observed = "en" ? "" : observed
    ; CN and English can share an executable/title. This CN collector defaults
    ; to Simplified Chinese for standalone F8; English copied chart text selects
    ; the original English-first OCR fallback, without adding a settings UI.
    return "zh-CN"
}

; The 12 border-tooltip anchor points scale with the game window's height
; around its centre. Measured from field calibrations at 2560x1440 and
; 1920x1200 (they agree within ~2% of height, and neighbouring anchors sit
; ~13% apart, so the assignment has huge margin). Order: top L>R,
; right T>B, bottom L>R, left T>B - the solver's border slot order.
AnchorFractions := [
    [-0.166, -0.233], [-0.025, -0.232], [0.134, -0.231],
    [0.212, -0.137], [0.211, -0.004], [0.219, 0.152],
    [-0.177, 0.241], [-0.022, 0.241], [0.140, 0.243],
    [-0.253, -0.137], [-0.255, -0.001], [-0.244, 0.137],
]

RunBorderScan(testImage := "", testW := 0, testH := 0) {
    global
    if (!CollectorReady && testImage = "") {
        ShowStatus(LastFailure != "" ? LastFailure : "边界读取尚未就绪。请等待本机模型检查，或使用安装入口修复组件。")
        return
    }
    if Scanning {
        ShowStatus("边界采集仍在运行，请稍候。")
        return
    }
    Scanning := true
    ScanPhase := "截图中"
    LastScanFailure := ""
    LastFailure := ""
    try {
        winX := 0, winY := 0
        winW := testW ? testW : A_ScreenWidth
        winH := testH ? testH : A_ScreenHeight
        poeHwnd := 0
        if (testImage = "") {
            poeHwnd := FindPoeWindow()
            if !poeHwnd
                throw Error("未找到可见的流放之路游戏窗口。请打开游戏，并确认游戏与采集器权限一致后重试。")
            WinGetPos &winX, &winY, &winW, &winH, poeHwnd  ; passive read
            if (winW <= 0 || winH <= 0)
                throw Error("游戏窗口尺寸无效，请切回游戏后重试。")
            ShowStatus("正在截图：请继续按住 Alt，让十二条边界提示保持可见。")
        }
        points := ""
        cx := winW / 2.0
        cy := winH / 2.0
        for , f in AnchorFractions
            points .= (points = "" ? "" : ";") Round(cx + f[1] * winH) "," Round(cy + f[2] * winH)
        try FileDelete HelperOut
        try FileDelete HelperShot
        try FileDelete HelperPs1
        FileAppend BorderHelperPs(), HelperPs1, "UTF-8"
        quote := Chr(34)
        command := "powershell.exe -NoProfile -ExecutionPolicy Bypass -File " quote HelperPs1 quote
            . " -Left " winX " -Top " winY " -Width " winW " -Height " winH
            . " -PointSpec " quote points quote
            . " -PreferredLanguage " quote PreferredOcrLanguage(poeHwnd) quote
            . " -RapidPython " quote A_ScriptDir "\runtime\python\python.exe" quote
            . " -RapidHelper " quote A_ScriptDir "\collector\border_ocr.py" quote
            . " -WorkPng " quote HelperPng quote
            . " -ShotMarker " quote HelperShot quote
            . " -OutputPath " quote HelperOut quote
            . (testImage != "" ? " -ImagePath " quote testImage quote : "")
        ; Hide only our status panel so it cannot cover a border tooltip.
        ; Screenshot completion or the error path restores the current status.
        ShowCollectorStatus("")
        Run command, , "Hide", &HelperPid
        ; beep the moment the screenshot is on disk so Alt can be released early -
        ; the OCR itself takes a few more seconds
        deadline := A_TickCount + 20000
        while (!FileExist(HelperShot) && ProcessExist(HelperPid) && A_TickCount < deadline)
            Sleep 50
        if FileExist(HelperShot) {
            Beep(700, 90)
            ScanPhase := "识别中"
            ShowStatus("截图已完成，可以松开 Alt。`n正在本机识别边界文字，不上传图片；请等待完成后再按 F7。")
        } else if !FileExist(HelperOut) {
            throw Error("截图未完成或等待超时。可以松开 Alt，请切回游戏后重试。")
        }
        deadline := A_TickCount + 120000
        while (!FileExist(HelperOut) && ProcessExist(HelperPid) && A_TickCount < deadline)
            Sleep 100
        Sleep 100
        blob := ""
        try blob := Trim(FileRead(HelperOut, "UTF-8"), " `t`r`n")
        if (blob = "" || InStr(blob, "HELPER ERROR")) {
            throw Error(blob = "" ? "未收到 OCR 结果或等待超时。" : SubStr(blob, 1, 500))
        }
        total := 0
        p := 1
        while (p := InStr(blob, "=== VOYAGE BORDER", true, p)) {
            total++
            p += 17
        }
        errors := 0
        p := 1
        while (p := InStr(blob, "OCR ERROR", true, p)) {
            errors++
            p += 9
        }
        good := total - errors
        if (total = 0)
            throw Error("OCR 没有输出边界文字。请按住 Alt 显示边界后重试。")
        ScanPhase := "读取完成"
        BorderBlob := blob
        BorderCount := good
        LastBorderBlob := blob
        LastBorderTime := FormatTime(, "yyyy-MM-dd HH:mm:ss")
        note := "已读取 " good "/12 处边界文字，词缀匹配以网页结果为准。"
        if (errors && RegExMatch(blob, "s)OCR ERROR:[ \t]*(.*?)\r?\n=== END VOYAGE BORDER", &failure))
            note .= "`n" SubStr(Trim(failure[1], " `t`r`n"), 1, 400)
        if (good < 12)
            note .= "`n未读取的位置可按住 Alt 后 F8 重试，或在网页手动补选。"
        if (errors)
            LastFailure := LastScanFailure := "文字读取含失败位置，请查看托盘“查看本地诊断”或网页未匹配原文。"
        SaveCollectorDiagnostic("文字读取完成", note)
        if Collecting {
            Beep(good ? 1000 : 300, 90)
            ShowStatus(note "`n已加入当前批次，请再按 F7 统一输出海图和边界。")
        } else {
            if WriteCollectorOutput(blob, note) {
                BorderBlob := ""
                BorderCount := 0
            }
        }
    } catch Error as err {
        LastFailure := LastScanFailure := ScanPhase "失败，可以松开 Alt。`n" SubStr(err.Message, 1, 500) "`n请查看本地诊断，重试 F8 或在网页手动补选；不要将 OCR 错字都归因于权限。"
        SaveCollectorDiagnostic(ScanPhase, LastFailure)
        ShowStatus(LastFailure)
        Beep(300, 150)
    } finally {
        if (HelperPid && ProcessExist(HelperPid))
            try ProcessClose HelperPid
        HelperPid := 0
        Scanning := false
        ScanPhase := ""
    }
}

F7:: ToggleCollect()
; * = fire even while modifiers are held: the whole point of F8 is pressing
; it WHILE Alt is held for the tooltips, and a bare F8 hotkey never fires
; with a modifier down (issue #48: no beep, and the keypress fell through
; to the game, where F8 is PoE's own screenshot bind - hence the mystery
; "screenshot saved" notifications)
*F8:: RunBorderScan()
+F7:: ToggleMute()

A_TrayMenu.Delete()
A_TrayMenu.Add("开启或结束海图采集 (F7)", ToggleCollect)
A_TrayMenu.Add("读取边界 (F8)", (*) => RunBorderScan())
A_TrayMenu.Add("重试输出内容", RetryCollectorOutput)
A_TrayMenu.Add("查看本地诊断", ShowCollectorDiagnostic)
A_TrayMenu.Add("切换提示音 (Shift+F7)", ToggleMute)
A_TrayMenu.Add("版本与运行信息", (*) => ShowStatus(CollectorId " v" CollectorVersion "`n权限模式：" (A_IsAdmin ? "管理员" : "普通权限") "；F7 海图，F8 边界。", 10000))
A_TrayMenu.Add("退出", (*) => ExitApp())
A_TrayMenu.Default := "开启或结束海图采集 (F7)"
A_IconTip := CollectorId " v" CollectorVersion "：F7 海图，F8 边界"
InitializeCollector()
SetTimer CheckGamePermission, 5000

InitializeCollector() {
    global CollectorReady, CollectorVersion, CollectorInstallRoot, CollectorInstanceHandle, LastFailure
    ShowStatus("正在检查本机组件与加载中文模型，尚未就绪…")
    try {
        if (CollectorInstallRoot != "") {
            CollectorInstanceHandle := DllCall("CreateFileW", "Str", CollectorInstallRoot "\collector.running.lock", "UInt", 0x40000000, "UInt", 0, "Ptr", 0, "UInt", 4, "UInt", 0x80, "Ptr", 0, "Ptr")
            if (CollectorInstanceHandle = -1) {
                CollectorInstanceHandle := 0
                throw Error("本工具可能已运行，或安装目录权限不足。请保留原批次，从桌面入口核对。")
            }
            OnExit CloseCollectorInstance
        }
        manifest := FileRead(A_ScriptDir "\collector-release.json", "UTF-8")
        if (!RegExMatch(manifest, '"version"\s*:\s*"([^"]+)"', &version) || version[1] != CollectorVersion)
            throw Error("脚本与清单版本不一致。")
        if (!RegExMatch(manifest, '"autoHotkeyVersion"\s*:\s*"([^"]+)"', &runtime) || runtime[1] != A_AhkVersion)
            throw Error("AHK 运行时与固定兼容版本不一致。请使用桌面入口。")
        python := A_ScriptDir "\runtime\python\python.exe"
        helper := A_ScriptDir "\collector\border_ocr.py"
        if (!FileExist(python) || !FileExist(helper))
            throw Error("缺少本工具的 Python 或 OCR 组件。")
        process := ComObject("WScript.Shell").Exec('"' python '" "' helper '" --self-test')
        deadline := A_TickCount + 120000
        while (process.Status = 0) {
            if (A_TickCount > deadline) {
                process.Terminate()
                throw Error("本机模型检查超时。")
            }
            Sleep 100
        }
        output := process.StdOut.ReadAll()
        errorText := process.StdErr.ReadAll()
        if (process.ExitCode != 0 || !RegExMatch(output, '"ready"\s*:\s*true'))
            throw Error("本机 OCR 自检失败：" SubStr(errorText, 1, 400))
        CollectorReady := true
        ShowStatus("采集器已就绪｜" (A_IsAdmin ? "管理员模式" : "普通权限") "`nF7 采集海图，F8 读取边界；请手动 Ctrl+Alt+C 复制。`n退出：任务栏右下角采集器图标 → 退出。", 10000)
    } catch as err {
        LastFailure := "采集器未就绪｜组件或模型检查失败。`n" err.Message "`n请退出后重新双击“安装或更新国服海图采集器.cmd”修复；不要关闭防护。"
        SaveCollectorDiagnostic("组件自检", LastFailure)
        ShowStatus(LastFailure)
    }
}

CloseCollectorInstance(*) {
    global CollectorInstanceHandle
    if CollectorInstanceHandle
        DllCall("CloseHandle", "Ptr", CollectorInstanceHandle)
}

GameIsElevated(pid) {
    processHandle := DllCall("OpenProcess", "UInt", 0x1000, "Int", false, "UInt", pid, "Ptr")
    if !processHandle
        return -1
    token := 0
    try {
        if !DllCall("Advapi32\OpenProcessToken", "Ptr", processHandle, "UInt", 8, "Ptr*", &token)
            return -1
        elevation := Buffer(4, 0)
        needed := 0
        if !DllCall("Advapi32\GetTokenInformation", "Ptr", token, "Int", 20, "Ptr", elevation.Ptr, "UInt", 4, "UInt*", &needed)
            return -1
        return NumGet(elevation, 0, "UInt")
    } finally {
        if token
            DllCall("CloseHandle", "Ptr", token)
        DllCall("CloseHandle", "Ptr", processHandle)
    }
}

CheckGamePermission(*) {
    global CollectorReady, Collecting, Scanning, StatusMessage
    static reported := false
    if (A_IsAdmin || !CollectorReady || Collecting || Scanning || StatusMessage != "" || reported)
        return
    hwnd := FindPoeWindow()
    if !hwnd
        return
    try elevated := GameIsElevated(WinGetPID(hwnd))
    catch
        elevated := -1
    if (elevated = 1) {
        reported := true
        ShowStatus("游戏以管理员权限运行，请退出旧采集器，使用桌面“国服海图采集器”重新启动。")
    } else if (elevated = -1) {
        reported := true
        ShowStatus("当前为普通权限，无法确认游戏权限。若 F8 只有游戏截图，请从桌面入口重新启动并核对管理员授权；其他识别失败仍需查看具体阶段。")
    }
}

; ---------------------------------------------------------------------
; The border-reading PowerShell helper. Runs Windows OCR locally on a
; screenshot taken while the PLAYER holds Alt. Zero backticks allowed -
; AutoHotkey would strip them when writing the file.
; ---------------------------------------------------------------------
BorderHelperPs() {
    return "
(
param(
    [int]$Left = 0,
    [int]$Top = 0,
    [int]$Width = 0,
    [int]$Height = 0,
    [string]$PointSpec = '',
    [string]$ImagePath = '',
    [string]$PreferredLanguage = '',
    [string]$RapidPython = '',
    [string]$RapidHelper = '',
    [Parameter(Mandatory = $true)][string]$WorkPng,
    [Parameter(Mandatory = $true)][string]$ShotMarker,
    [Parameter(Mandatory = $true)][string]$OutputPath)

$ErrorActionPreference = 'Stop'
trap {
    $utf8 = [System.Text.UTF8Encoding]::new($false)
    [System.IO.File]::WriteAllText(
        $OutputPath,
        ('HELPER ERROR: ' + $_.Exception.ToString()),
        $utf8)
    exit 1
}
Add-Type -AssemblyName System.Drawing

# ---- capture FIRST, before anything slow compiles: the player is holding
# ---- Alt and waiting for the "you can let go" beep
if ($ImagePath -ne '') {
    Copy-Item -LiteralPath $ImagePath -Destination $WorkPng -Force
} else {
    if ($Width -le 0 -or $Height -le 0) { throw 'Invalid window size.' }
    $image = [System.Drawing.Bitmap]::new($Width, $Height)
    $graphics = [System.Drawing.Graphics]::FromImage($image)
    try {
        $graphics.CopyFromScreen($Left, $Top, 0, 0, $image.Size)
        $image.Save($WorkPng, [System.Drawing.Imaging.ImageFormat]::Png)
    } finally {
        $graphics.Dispose()
        $image.Dispose()
    }
}
[System.IO.File]::WriteAllText($ShotMarker, 'SHOT')

# Chinese uses the pinned offline helper. Capture/marker precede loading so
# the status panel can tell the player exactly when to release Alt.
if ($PreferredLanguage -like 'zh*') {
    try {
        if (-not (Test-Path -LiteralPath $RapidPython) -or -not (Test-Path -LiteralPath $RapidHelper)) {
            throw '缺少国服本地识别组件。请使用安装入口准备或修复组件；裸脚本不会自动下载。仍可在网页手动选择边界。'
        }
        & $RapidPython $RapidHelper --image $WorkPng --points $PointSpec --output $OutputPath
        if (-not (Test-Path -LiteralPath $OutputPath)) { throw '本地识别助手没有输出结果；请修复安装后重试。' }
        exit $LASTEXITCODE
    } finally {
        Remove-Item -LiteralPath $WorkPng -Force -ErrorAction SilentlyContinue
    }
}

Add-Type -AssemblyName System.Runtime.WindowsRuntime

Add-Type -ReferencedAssemblies 'System.Drawing' -TypeDefinition @'
using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;

public static class VoyageOcrImage
{
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)]
    private static extern uint GetLongPathNameW(string shortPath, System.Text.StringBuilder buffer, uint bufferLength);

    // %TEMP% can arrive as an 8.3 short path (C:\Users\HARDPC~1\...). Win32
    // tolerates those, but WinRT StorageFile - which Windows OCR uses to open
    // images - can refuse them ('An object at the specified path does not
    // exist'), failing the scan on every image it just wrote (issues #27/#35).
    public static string LongPath(string path)
    {
        try
        {
            System.Text.StringBuilder buffer = new System.Text.StringBuilder(1024);
            uint length = GetLongPathNameW(path, buffer, 1024);
            if (length > 0 && length < 1024) { return buffer.ToString(); }
        }
        catch { }
        return path;
    }

    public static void Prepare(string sourcePath, string outputPath)
    {
        using (var original = new Bitmap(sourcePath))
        using (var source = new Bitmap(original.Width, original.Height, PixelFormat.Format32bppArgb))
        {
            using (var graphics = Graphics.FromImage(source))
            {
                graphics.DrawImageUnscaled(original, 0, 0);
            }

            var rect = new Rectangle(0, 0, source.Width, source.Height);
            var sourceData = source.LockBits(rect, ImageLockMode.ReadOnly, PixelFormat.Format32bppArgb);
            var sourceStride = Math.Abs(sourceData.Stride);
            var sourceBytes = new byte[sourceStride * source.Height];
            Marshal.Copy(sourceData.Scan0, sourceBytes, 0, sourceBytes.Length);
            source.UnlockBits(sourceData);

            using (var mask = new Bitmap(source.Width, source.Height, PixelFormat.Format24bppRgb))
            {
                var maskData = mask.LockBits(rect, ImageLockMode.WriteOnly, PixelFormat.Format24bppRgb);
                var maskStride = Math.Abs(maskData.Stride);
                var maskBytes = new byte[maskStride * mask.Height];
                for (var i = 0; i < maskBytes.Length; i++)
                {
                    maskBytes[i] = 255;
                }

                for (var y = 0; y < source.Height; y++)
                {
                    for (var x = 0; x < source.Width; x++)
                    {
                        var sourceOffset = y * sourceStride + x * 4;
                        var blue = sourceBytes[sourceOffset];
                        var green = sourceBytes[sourceOffset + 1];
                        var red = sourceBytes[sourceOffset + 2];

                        // PoE board modifiers use lavender text. Keep its
                        // anti-aliased pixels and discard inventory levels,
                        // icons, scenery and other white UI text.
                        var isModifierText =
                            blue >= 130 &&
                            blue - red >= 30 &&
                            blue - green >= 30 &&
                            Math.Abs(red - green) <= 18;
                        if (!isModifierText)
                        {
                            continue;
                        }

                        var maskOffset = y * maskStride + x * 3;
                        maskBytes[maskOffset] = 0;
                        maskBytes[maskOffset + 1] = 0;
                        maskBytes[maskOffset + 2] = 0;
                    }
                }

                Marshal.Copy(maskBytes, 0, maskData.Scan0, maskBytes.Length);
                mask.UnlockBits(maskData);

                var scale = Math.Min(2.0, 6000.0 / Math.Max(mask.Width, mask.Height));
                var scaledWidth = (int)Math.Round(mask.Width * scale);
                var scaledHeight = (int)Math.Round(mask.Height * scale);
                const int padding = 64;
                using (var prepared = new Bitmap(
                    scaledWidth + 2 * padding,
                    scaledHeight + 2 * padding,
                    PixelFormat.Format24bppRgb))
                {
                    using (var graphics = Graphics.FromImage(prepared))
                    {
                        graphics.Clear(Color.White);
                        graphics.InterpolationMode = InterpolationMode.NearestNeighbor;
                        graphics.PixelOffsetMode = PixelOffsetMode.Half;
                        graphics.DrawImage(
                            mask,
                            new Rectangle(padding, padding, scaledWidth, scaledHeight));
                    }
                    prepared.Save(outputPath, ImageFormat.Png);
                }
            }
        }
    }

    // HDR desktops make GDI captures washed-out and low-contrast (issue #33):
    // colours shift enough to defeat the lavender mask, and the raw image is
    // too flat for OCR. Stretch the 2nd..98th percentile luminance range to
    // full contrast as a last-chance pass; same scale/padding as Prepare so
    // word geometry maps back identically.
    public static void Normalize(string sourcePath, string outputPath)
    {
        using (var original = new Bitmap(sourcePath))
        using (var source = new Bitmap(original.Width, original.Height, PixelFormat.Format32bppArgb))
        {
            using (var graphics = Graphics.FromImage(source))
            {
                graphics.DrawImageUnscaled(original, 0, 0);
            }

            var rect = new Rectangle(0, 0, source.Width, source.Height);
            var sourceData = source.LockBits(rect, ImageLockMode.ReadOnly, PixelFormat.Format32bppArgb);
            var sourceStride = Math.Abs(sourceData.Stride);
            var sourceBytes = new byte[sourceStride * source.Height];
            Marshal.Copy(sourceData.Scan0, sourceBytes, 0, sourceBytes.Length);
            source.UnlockBits(sourceData);

            var histogram = new int[256];
            var lums = new byte[source.Width * source.Height];
            var index = 0;
            for (var y = 0; y < source.Height; y++)
            {
                for (var x = 0; x < source.Width; x++)
                {
                    var offset = y * sourceStride + x * 4;
                    var lum = (byte)((sourceBytes[offset] * 114 +
                        sourceBytes[offset + 1] * 587 +
                        sourceBytes[offset + 2] * 299) / 1000);
                    lums[index++] = lum;
                    histogram[lum]++;
                }
            }
            var total = source.Width * source.Height;
            var lowTarget = total / 50;
            var highTarget = total - total / 50;
            var low = 0;
            var high = 255;
            var cumulative = 0;
            for (var i = 0; i < 256; i++)
            {
                cumulative += histogram[i];
                if (cumulative <= lowTarget) { low = i; }
                if (cumulative < highTarget) { high = i; }
            }
            if (high <= low) { high = low + 1; }

            using (var mask = new Bitmap(source.Width, source.Height, PixelFormat.Format24bppRgb))
            {
                var maskData = mask.LockBits(rect, ImageLockMode.WriteOnly, PixelFormat.Format24bppRgb);
                var maskStride = Math.Abs(maskData.Stride);
                var maskBytes = new byte[maskStride * mask.Height];
                index = 0;
                for (var y = 0; y < source.Height; y++)
                {
                    for (var x = 0; x < source.Width; x++)
                    {
                        var stretched = (lums[index++] - low) * 255 / (high - low);
                        if (stretched < 0) { stretched = 0; }
                        if (stretched > 255) { stretched = 255; }
                        var value = (byte)stretched;
                        var maskOffset = y * maskStride + x * 3;
                        maskBytes[maskOffset] = value;
                        maskBytes[maskOffset + 1] = value;
                        maskBytes[maskOffset + 2] = value;
                    }
                }
                Marshal.Copy(maskBytes, 0, maskData.Scan0, maskBytes.Length);
                mask.UnlockBits(maskData);

                var scale = Math.Min(2.0, 6000.0 / Math.Max(mask.Width, mask.Height));
                var scaledWidth = (int)Math.Round(mask.Width * scale);
                var scaledHeight = (int)Math.Round(mask.Height * scale);
                const int padding = 64;
                using (var prepared = new Bitmap(
                    scaledWidth + 2 * padding,
                    scaledHeight + 2 * padding,
                    PixelFormat.Format24bppRgb))
                {
                    using (var graphics = Graphics.FromImage(prepared))
                    {
                        graphics.Clear(Color.White);
                        graphics.InterpolationMode = InterpolationMode.NearestNeighbor;
                        graphics.PixelOffsetMode = PixelOffsetMode.Half;
                        graphics.DrawImage(
                            mask,
                            new Rectangle(padding, padding, scaledWidth, scaledHeight));
                    }
                    prepared.Save(outputPath, ImageFormat.Png);
                }
            }
        }
    }
}
'@

[void][Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime]
[void][Windows.Storage.FileAccessMode, Windows.Storage, ContentType = WindowsRuntime]
[void][Windows.Storage.Streams.IRandomAccessStream, Windows.Storage.Streams, ContentType = WindowsRuntime]
[void][Windows.Graphics.Imaging.BitmapDecoder, Windows.Graphics.Imaging, ContentType = WindowsRuntime]
[void][Windows.Graphics.Imaging.SoftwareBitmap, Windows.Graphics.Imaging, ContentType = WindowsRuntime]
[void][Windows.Globalization.Language, Windows.Globalization, ContentType = WindowsRuntime]
[void][Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType = WindowsRuntime]
[void][Windows.Media.Ocr.OcrResult, Windows.Foundation, ContentType = WindowsRuntime]

function Await-Result {
    param(
        [Parameter(Mandatory = $true)]$AsyncOperation,
        [Parameter(Mandatory = $true)][Type]$ResultType)
    $method = [System.WindowsRuntimeSystemExtensions].GetMethods() |
        Where-Object {
            $_.Name -eq 'AsTask' -and
            $_.IsGenericMethod -and
            $_.GetParameters().Count -eq 1
        } |
        Select-Object -First 1
    $task = $method.MakeGenericMethod($ResultType).Invoke($null, @($AsyncOperation))
    $task.Wait()
    return $task.Result
}

function New-OcrEngine {
    param([string]$PreferredLanguage = '')

    $available = @([Windows.Media.Ocr.OcrEngine]::AvailableRecognizerLanguages)

    # Installed recognizers expose regional/script tags, not capability names.
    # Never accept zh-Hant/zh-TW/zh-HK as Simplified Chinese just because their
    # primary language is also zh. Korean still accepts ko and ko-KR.
    if (-not [string]::IsNullOrWhiteSpace($PreferredLanguage)) {
        $preferredTag = $PreferredLanguage.Trim()
        $preferredPrimary = ($preferredTag -split '-', 2)[0]
        $preferred = @($available | Where-Object {
            $tag = $_.LanguageTag
            $primary = ($tag -split '-', 2)[0]
            if ($preferredPrimary -ieq 'zh') {
                $tag -match '^zh-(Hans(?:-.*)?|CN|SG)$'
            } else {
                $tag -ieq $preferredTag -or $primary -ieq $preferredPrimary
            }
        } | Sort-Object {
            if ($_.LanguageTag -ieq $preferredTag) { 0 }
            elseif ($_.LanguageTag -ieq $preferredPrimary) { 1 }
            else { 2 }
        })

        foreach ($language in $preferred) {
            $engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage($language)
            if ($null -ne $engine) {
                return $engine
            }
        }

        if ($preferredPrimary -ieq 'zh') {
            throw ('缺少 Windows 简体中文 OCR 组件。请在 Windows 设置的简体中文语言选项中安装光学字符识别，或以管理员运行：' +
                [Environment]::NewLine + 'DISM /Online /Add-Capability /CapabilityName:Language.OCR~~~zh-CN~0.0.1.0' +
                [Environment]::NewLine + '安装后重新按 F8；边界也可在网页手动选择。')
        }
        throw ("缺少 Windows OCR 语言 '$preferredTag'。请安装对应语言的 OCR 组件。韩文可使用管理员命令：" +
            'DISM /Online /Add-Capability /CapabilityName:Language.OCR~~~ko-KR~0.0.1.0')
    }

    # English clients keep the original English-first behavior. Do not require
    # en-US specifically: many Windows installs only have en-GB or another
    # Latin-script OCR language.
    $english = @($available | Where-Object {
        $_.LanguageTag -eq 'en-US' -or $_.LanguageTag -like 'en-*'
    } | Sort-Object {
        if ($_.LanguageTag -eq 'en-US') { 0 } else { 1 }
    })

    foreach ($language in $english) {
        $engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage($language)
        if ($null -ne $engine) {
            return $engine
        }
    }

    # Fall back to the Windows profile language (for example pl-PL). The
    # border matcher tolerates small OCR errors, and Latin-script recognizers
    # can still read the English tooltip text well enough for matching.
    $engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages()
    if ($null -ne $engine) {
        return $engine
    }

    # A profile language may not be in the installed OCR list. Use any
    # recognizer as a final fallback rather than rejecting a usable setup.
    foreach ($language in $available) {
        $engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage($language)
        if ($null -ne $engine) {
            return $engine
        }
    }

    throw ('Windows OCR has no installed language. Open an elevated Command Prompt and run: ' +
        'DISM /Online /Add-Capability /CapabilityName:Language.OCR~~~en-US~0.0.1.0')
}

function Invoke-OcrFile {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)]$Engine)

    $file = Await-Result ([Windows.Storage.StorageFile]::GetFileFromPathAsync($Path)) ([Windows.Storage.StorageFile])
    $stream = Await-Result ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
    try {
        $decoder = Await-Result ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
        $bitmap = Await-Result ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
        try {
            $result = Await-Result ($Engine.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])
            $lines = @($result.Lines | ForEach-Object { $_.Text })
            if ($lines.Count -gt 0) { return $lines -join [Environment]::NewLine }
            return $result.Text
        } finally {
            if ($null -ne $bitmap) { $bitmap.Dispose() }
        }
    } finally {
        $stream.Dispose()
    }
}

function Add-Block {
    param(
        [Parameter(Mandatory = $true)][System.Text.StringBuilder]$Builder,
        [Parameter(Mandatory = $true)][int]$Index,
        [Parameter(Mandatory = $true)][string]$Text)
    [void]$Builder.AppendLine("=== VOYAGE BORDER $Index ===")
    [void]$Builder.AppendLine($Text)
    [void]$Builder.AppendLine('=== END VOYAGE BORDER ===')
}

function Get-OcrLineRects {
    param([string]$Path, $Engine, [double]$Scale, [double]$Pad)
    $file = Await-Result ([Windows.Storage.StorageFile]::GetFileFromPathAsync($Path)) ([Windows.Storage.StorageFile])
    $stream = Await-Result ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
    try {
        $decoder = Await-Result ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
        $bitmap = Await-Result ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
        try {
            $result = Await-Result ($Engine.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])
            $found = @()
            foreach ($line in $result.Lines) {
                $minX = [double]::MaxValue
                $minY = [double]::MaxValue
                $maxX = 0.0
                $maxY = 0.0
                foreach ($word in $line.Words) {
                    $r = $word.BoundingRect
                    if ($r.X -lt $minX) { $minX = $r.X }
                    if ($r.Y -lt $minY) { $minY = $r.Y }
                    if (($r.X + $r.Width) -gt $maxX) { $maxX = $r.X + $r.Width }
                    if (($r.Y + $r.Height) -gt $maxY) { $maxY = $r.Y + $r.Height }
                }
                if ($minX -eq [double]::MaxValue) { continue }
                $found += [pscustomobject]@{
                    Text = $line.Text
                    X = ($minX - $Pad) / $Scale
                    Y = ($minY - $Pad) / $Scale
                    R = ($maxX - $Pad) / $Scale
                    B = ($maxY - $Pad) / $Scale
                }
            }
            return $found
        } finally {
            if ($null -ne $bitmap) { $bitmap.Dispose() }
        }
    } finally {
        $stream.Dispose()
    }
}

function Resolve-BorderAssignment {
    param($Points, $Blocks)
    $count = $Points.Count
    $dist = New-Object 'double[,]' $count, $Blocks.Count
    for ($p = 0; $p -lt $count; $p++) {
        for ($b = 0; $b -lt $Blocks.Count; $b++) {
            $cx = ($Blocks[$b].X + $Blocks[$b].R) / 2.0
            $cy = ($Blocks[$b].Y + $Blocks[$b].B) / 2.0
            $dx = $cx - $Points[$p].X
            $dy = $cy - $Points[$p].Y
            $dist[$p, $b] = $dx * $dx + $dy * $dy
        }
    }
    $assigned = @($null) * $count
    $used = @{}
    $order = @()
    for ($p = 0; $p -lt $count; $p++) {
        for ($b = 0; $b -lt $Blocks.Count; $b++) {
            $order += [pscustomobject]@{ P = $p; B = $b; D = $dist[$p, $b] }
        }
    }
    foreach ($pair in ($order | Sort-Object D)) {
        if ($null -ne $assigned[$pair.P] -or $used.ContainsKey($pair.B)) { continue }
        $assigned[$pair.P] = $pair.B
        $used[$pair.B] = $true
    }
    $improved = $true
    $rounds = 0
    while ($improved -and $rounds -lt 50) {
        $improved = $false
        $rounds++
        for ($i = 0; $i -lt $count; $i++) {
            for ($j = $i + 1; $j -lt $count; $j++) {
                $bi = $assigned[$i]
                $bj = $assigned[$j]
                if ($null -eq $bi -or $null -eq $bj) { continue }
                if (($dist[$i, $bj] + $dist[$j, $bi]) -lt ($dist[$i, $bi] + $dist[$j, $bj])) {
                    $assigned[$i] = $bj
                    $assigned[$j] = $bi
                    $improved = $true
                }
            }
        }
    }
    return $assigned
}

$prepared = $WorkPng + '.prep.png'
$builder = [System.Text.StringBuilder]::new()
try {
    $engine = New-OcrEngine -PreferredLanguage $PreferredLanguage
    # mirror the transform inside VoyageOcrImage::Prepare so rects map back
    $scale = [Math]::Min(2.0, 6000.0 / [Math]::Max($Width, $Height))
    [VoyageOcrImage]::Prepare($WorkPng, $prepared)
    $lines = @(Get-OcrLineRects $prepared $engine $scale 64.0)
    if ($lines.Count -eq 0) { $lines = @(Get-OcrLineRects $WorkPng $engine 1.0 0.0) }
    # HDR-washout rescue: contrast-stretch and retry
    if ($lines.Count -eq 0) {
        [VoyageOcrImage]::Normalize($WorkPng, $prepared)
        $lines = @(Get-OcrLineRects $prepared $engine $scale 64.0)
    }
    if ($lines.Count -eq 0) { throw '未读取到边界提示。请切回游戏，按住 Alt 显示全部十二条边界，再按 F8。' }
    # cluster vertically-adjacent, horizontally-overlapping lines
    $blocks = @()
    foreach ($line in ($lines | Sort-Object Y)) {
        $joined = $false
        foreach ($block in $blocks) {
            $lineHeight = [Math]::Max(12.0, $line.B - $line.Y)
            $xOverlap = [Math]::Min($line.R, $block.R) - [Math]::Max($line.X, $block.X)
            if (($line.Y - $block.B) -le ($lineHeight * 0.9) -and $xOverlap -gt 0) {
                $block.Text = $block.Text + [Environment]::NewLine + $line.Text
                if ($line.X -lt $block.X) { $block.X = $line.X }
                if ($line.R -gt $block.R) { $block.R = $line.R }
                if ($line.B -gt $block.B) { $block.B = $line.B }
                $joined = $true
                break
            }
        }
        if (-not $joined) {
            $blocks += [pscustomobject]@{ Text = $line.Text; X = $line.X; Y = $line.Y; R = $line.R; B = $line.B }
        }
    }
    # Ground-loot labels are blue, blue passes the tooltip mask, and a
    # 13th text block then displaces a real tooltip in the 12-slot
    # assignment (issue #41: "HYDRASCALE BOOTS" stole a border). Every
    # real border tooltip mentions adjacency/areas/voyage, so
    # gate the clusters on that. A tooltip mangled beyond recognition
    # gets dropped here too, which just means a hover rescan - never a
    # loot label imported as a border.
    $blocks = @($blocks | Where-Object { ($_.Text -replace '\s+', '') -match 'adjacent|areas|voyage|인접|지역|항해|相邻|区域|航行|航程' })
    if ($blocks.Count -eq 0) { throw '未找到边界词缀文字。请按住 Alt 显示全部十二条边界后重试；也可在网页手动选择。' }
    $points = @()
    foreach ($pair in $PointSpec.Split(';')) {
        $xy = $pair.Split(',')
        $points += [pscustomobject]@{ X = [double]$xy[0]; Y = [double]$xy[1] }
    }
    $assigned = Resolve-BorderAssignment $points $blocks
    for ($p = 0; $p -lt $points.Count; $p++) {
        if ($null -ne $assigned[$p]) {
            Add-Block $builder $p $blocks[$assigned[$p]].Text
        } else {
            Add-Block $builder $p 'OCR ERROR: 此位置未读取到边界提示，请在网页手动选择。'
        }
    }
} catch {
    $builder = [System.Text.StringBuilder]::new()
    for ($p = 0; $p -lt 12; $p++) {
        Add-Block $builder $p ('OCR ERROR: ' + $_.Exception.Message)
    }
} finally {
    Remove-Item -LiteralPath $WorkPng -Force -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $prepared -Force -ErrorAction SilentlyContinue
}
$utf8Out = [System.Text.UTF8Encoding]::new($false)
[System.IO.File]::WriteAllText(($OutputPath + '.tmp'), $builder.ToString(), $utf8Out)
Move-Item -LiteralPath ($OutputPath + '.tmp') -Destination $OutputPath -Force
)"
}

