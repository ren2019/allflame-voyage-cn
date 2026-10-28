@echo off
chcp 65001 >nul
setlocal DisableDelayedExpansion
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-voyage-clip-collector-cn.ps1"
set "collector_result=%errorlevel%"
if not "%collector_result%"=="0" echo 未完成。请保留上方错误；组件缺失时重新解压完整候选并双击本入口重试。如系统或组织策略拦截，请联系设备管理员，不要关闭防护或修改全局策略。
echo 按任意键关闭此窗口。
pause >nul
exit /b %collector_result%
