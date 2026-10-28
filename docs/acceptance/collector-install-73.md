# #73 安装候选与验证边界

这是实施与候选材料，真实 Windows 安装、微软组件原生加载、正常 UAC 通过/取消、游戏操作与新手体验仍按 #77 记录。#66 已完成一张真实原始截图的新旧引擎回放：旧 Windows 5/12，新固定 RapidOCR 完整文字、数字、位置及网页匹配 12/12；这允许消费已验证 OCR 组件，不代表新 Windows 安装已验收。

## 候选布局与可复现构建

```text
安装或更新国服海图采集器.cmd
install-voyage-clip-collector-cn.ps1
启动国服海图采集器.cmd
launch-voyage-clip-collector-cn.ps1
collector-install.psm1
使用说明.html
collector-package.json
payload/                 # 同版本脚本、OCR 助手、固定清单与许可
components/              # 仅完整离线包包含，均有固定大小与 SHA-256
```

维护者使用 Python 3.11+：

```sh
python3 scripts/build-collector.py --output /absolute/candidate-directory
python3 scripts/build-collector.py --output /absolute/candidate-directory --full --components /absolute/component-cache
```

缺少固定归档时，显式加 `--download` 才下载。相同干净提交与输入生成相同 ZIP 字节；外部 `.zip.json` 给出文件名、摘要、大小、源提交及 `sourceDirty`。正式候选从干净集成提交重建，不把工作中临时包的提交关联写成最终证据；不自动创建 Release 或部署。未来公开来源为本仓库固定版本 Release，当前没有公开可用下载承诺。

AHK 2.0.31、Python 3.11.9、十九个 Windows wheels 与模型均固定。核心组件下载 106,974,696 字节；如需微软 VC++ 运行库，另加 18,731,856 字节，最高 125,706,552 字节，不含本工具小包。已具备兼容原生组件且真实模型自检通过时跳过微软安装。OCR 归档展开 282,772,775 字节，AHK 64 位程序与许可另 1,302,728 字节；这是实测解压字节，不是 Windows 实际磁盘分配或共享 VC++ 占用。安装时为缓存、暂存及旧版本预留空间，仍以实际候选和目标系统核对。

## 安装与启动契约

- 双击中文 `.cmd` 调用随包 PowerShell；脚本为带 BOM 的 UTF-8，入口为 CRLF 且先切换 UTF-8。使用绝对包路径和登记路径，中文、空格与单引号路径不拼入未转义命令。
- 当前用户固定应用目录中按唯一暂存路径准备；下载有大小进度，执行前核对所有归档的大小与 SHA-256，展开后检查模型摘要；失败不登记成功。
- Python 为封闭搜索路径的 embeddable 组件，依赖直接展开在本工具目录，不使用系统 Python、pip 或 `.ahk` 文件关联，保留原始许可。
- 只有实际 Python 助手加载三份模型并返回有效自检结果后，才登记安装及桌面入口。缺微软 DLL 时打开固定原厂安装器前同时检查有效 Authenticode 签名与 Microsoft Corporation 发布者；许可与正常授权由玩家确认。取消、重启要求、错误不得变为就绪。
- 桌面入口通过正常 RunAs 授权；提权前捕获原用户的绝对安装根，换管理员账号也不改用另一账号的 AppData。真实取消代码 1223 单独提示，其他授权失败不假称已取消。
- AHK 初始化从未就绪开始，验证版本/固定 AHK 和本机模型成功后才启用采集。重复启动使用 Ignore，安装根的独占运行锁与同会话进程检查保护跨版本批次；权限导致旧进程命令行不可读时如实说明未知，不当作不存在或杀掉其他 AHK。
- 低权限直接启动时，只有真实读取到游戏管理员令牌才提示权限不一致；读不到则说明无法确认。检测不覆盖已有具体采集错误。托盘提供中文退出。
- 修复、更新的完整事务回退与卸载由 #75 完善；此票不以现有基础安装代码宣称该闭环已验收。安装/启动诊断本地保留，不读取或上传无关剪贴板、网页库存和游戏内容。

## 自动检查入口与人工待办

```sh
VOYAGE_PWSH=/absolute/isolated/pwsh VOYAGE_COLLECTOR_COMPONENTS=/absolute/component-cache python3 -m unittest discover -s tests/collector -p test_install_package.py -v
npm run test:border-ocr
npm run build
npm run check:release-notes -- --base origin/main
```

安装公共 CLI 的 `-ValidateOnly` 只核对候选或登记文件，`-PrepareOnly -Offline` 真正展开固定归档并核对模型，但不运行 Windows 程序、不创建快捷方式、不写就绪登记。受控登记 fixture 仅验证公开启动入口的文件/路径检查与损坏拒绝，不能写成 Windows 安装通过。缺少显式 PowerShell 或归档环境时相关检查明确跳过。

本票需分别报告：归档构建与损坏拒绝、中文/空格/单引号路径、真实离线准备、文件/模型缺失反馈、脚本语法/编码、网页真实下载与导入回归、构建与国服更新记录。真实 Windows 原生执行、UAC、权限/显示环境、重复启动批次、手动海图到网页的完整采集链及新手首次使用缺证据时留给 #77，状态为“实现完成、等待人工验收”，不能称为已验收或关闭父规格。

本轮已取得的静态/受控证据：macOS arm64 的独立 PowerShell 7.6.9 对真实全部归档离线展开、校验及缺件拒绝通过；同一公开准备入口另从固定供应商 HTTPS 实际下载 colorama wheel，大小与摘要通过，未登记 Windows 就绪。现有 Windows PowerShell 5.1.26100.9711 对三个安装/启动源与从 AHK 原样提取的边界助手仅作 AST 解析，均通过；现有 AHK 2.0.31 以 `/Validate /ErrorStdOut=UTF-8` 加等待/真实退出码验证脚本，退出 0。远端静态源的 SHA-256 与本机一致，独立临时目录已清理。上述操作没有执行安装器、启动新采集器、执行热键或游戏操作，不能升级为完整 Windows 运行验收。
