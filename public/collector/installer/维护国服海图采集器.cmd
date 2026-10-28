@echo off
chcp 65001 >nul
setlocal DisableDelayedExpansion
if not exist "%~dp0manage-voyage-clip-collector-cn.ps1" goto missing
if exist "%~dp0current.json" (
  powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0manage-voyage-clip-collector-cn.ps1" -InstallRoot "%~dp0."
) else (
  powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0manage-voyage-clip-collector-cn.ps1"
)
set "collector_result=%errorlevel%"
goto finish
:missing
echo 维护入口缺失。请重新解压完整候选，双击安装或更新国服海图采集器.cmd；不要猜测命令或关闭防护。
set "collector_result=1"
:finish
echo 按任意键关闭此窗口。
pause >nul
exit /b %collector_result%
