# 国服采集器候选核对与证据边界

此页供维护者准备 #77 交付，玩家使用 [十五项验收记录](collector-player-checklist.md) 和最终 ZIP 中的“使用说明.html”。它不授权安装到用户电脑、操作游戏、自动合并、公开 Release 或部署。#76 自身和最终自主检查未齐备前，#77仍为准备中；全部自主材料完成后才转 ready-for-human，保持 open。

## 最终制品的唯一依据

最终代码、说明和审查修复提交后，从**干净的最终集成提交**构建。实际提交/版本/大小/摘要写进生成的包清单和外部交付报告，不回写本页制造“改文档后提交又改变”的循环。

| 交付字段 | 权威来源与要求 |
| --- | --- |
| 源提交、版本、是否有未提交改动 | 包内 `collector-package.json` 的 `sourceCommit` / `version` / `sourceDirty`；后者必须为 false |
| 正常小包 / 完整包的名称、字节数与 SHA-256 | 构建生成的各份 `<zip>.json`，分别核对实际 ZIP；不混用两种包或旧升级基准 |
| 固定组件、模型及许可 | 包内 `payload/collector/ocr-runtime.json`、`install-runtime.json`、`licenses/` 和完整包 `components/`；保留 Windows wheel 内完整许可 |
| 玩家说明与维护入口 | 同一 ZIP 的 `使用说明.html`、中文 CMD，以及实际桌面/托盘入口；本地预览入口随交付报告提供 |
| 自动结果与实际范围 | 同一交付报告分别记命令、实际结果、源码提交和证据；失败/跳过不能改写成通过 |
| Windows / 游戏 / 新手结果 | 十五项人工表逐项记录，初始全部 NOT EXECUTED |
| 旧→新和受控失败资料 | 独立目录、真实旧版本清单及摘要；派生拒绝输入单独说明、单独摘要，永不混入正常 ZIP |

0.2.2 / 0.2.3 是已存在的真实旧候选，可作升级基准；它们的旧提交、摘要及通过范围不代表最终版本。最终 normal / old-version / derived-rejection 三类制品在外部交付目录分开，ZIP和个人路径不进入仓库。

## 复用现有构建与公开检查

以下只给维护者使用。`VOYAGE_CANDIDATE_OUTPUT` 是仓库外最终制品目录；`VOYAGE_PINNED_COMPONENTS` 是已取得并核对的完整固定归档目录，不是只有部分文件的旧准备缓存。最终交付目录由实际交付报告填写。

```sh
git status --short
python3 scripts/build-collector.py --output "$VOYAGE_CANDIDATE_OUTPUT"
python3 scripts/build-collector.py --output "$VOYAGE_CANDIDATE_OUTPUT" --full --components "$VOYAGE_PINNED_COMPONENTS"
```

构建器校验固定组件大小/摘要，生成可复现 ZIP 和外部 `.zip.json`。确认干净来源、正常包完整及原始许可后，复用已有公开安装入口检查：

```powershell
& "$PackageRoot/install-voyage-clip-collector-cn.ps1" -PackageRoot $PackageRoot -InstallRoot $IsolatedRoot -ValidateOnly
& "$PackageRoot/install-voyage-clip-collector-cn.ps1" -PackageRoot $PackageRoot -InstallRoot $IsolatedRoot -PrepareOnly -Offline
```

`ValidateOnly` 只检查清单与文件；`PrepareOnly` 展开真实固定归档但不登记已就绪，不执行 Windows 原生组件。已有 `tests/collector/test_install_package.py` 覆盖可复现构建、坏摘要拒绝、缺归档、中文/空格/单引号路径、真实归档/模型/许可和受控登记文件核对；复用它，不另写一套摘要自证测试。受控登记只用于 `launch ... -ValidateOnly`，绝不能据此称 Windows模型或授权已通过。

在已明确提供的隔离 PowerShell、完整归档和 Python 3.11 OCR 环境中执行既有 CLI 回归；需要真实原图的用例由 `VOYAGE_OCR_IMAGE` 显式提供。缺变量的跳过须原样报告。逻辑、整页、构建、国服更新记录检查以及最终审查按 CONTRIBUTING 执行；总门禁已知旧 scoring 字节指纹失败单独报告，不替换摘要或降低断言。

## 自动与人工分层

| 层次 | 能证明什么 | 不能替代什么 |
| --- | --- | --- |
| 逻辑/浏览器/构建/更新记录/代码审查 | 当前网页公开流程、规则、只读与导入契约、构建及记录；实际结果见最终交付报告 | Windows 原生运行、授权或游戏 |
| 真实归档与公开候选 CLI | 固定文件/许可、可复现构建、路径、校验拒绝和受控准备；不假报就绪 | 真正安装登记、原生 DLL/模型加载、快捷方式/UAC |
| Mac 真实同图 OCR | #66 原始 PNG 的十二槽完整文字、数字、位置与网页匹配；旧 Windows 原始输出5/12、新输出12/12保留 | 新 Windows 引擎、所有分辨率/HDR/游戏现场准确率 |
| 既有 Windows AHK `/Validate` 与 PowerShell AST | 同一实际源码的语法可解析；保留源摘要/退出码，改源后重新核对 | 执行新采集器、热键/批次状态、剪贴板、UAC或游戏 |
| 真实 Windows / 国服游戏 / 新手 | 由玩家分别填写 W1–W5、G1–G5、R1–R4、N1 | 自动检查不能代填，全未执行时仍未验收 |

派生的缺件/坏摘要/断网输入只证明其受控失败路径，不能冒充另一套游戏 OCR 结果。真实失败样本、账号或环境不足就记录缺证据。现场发现的缺陷回到原实施票修复并重验；不得关闭前置、删除依赖或修改验收条件解锁。

## 外部交付报告最小内容

1. 可审查 PR；最终正常小包/完整包及原样保留的 `.zip.json`；实际 `sourceCommit`、`sourceDirty:false`、兼容清单/许可和同版中文说明入口。
2. 真实旧版本与目标包、单独标明的派生拒绝资料；各自名称/摘要及玩家无命令的可恢复步骤。只读文件未能触发切换失败时保留未测，不造回退成功证据。
3. 最终真实自动检查结果、历史已知失败、代码审查修复及其实际范围；原始图片/运行日志只保留在本机授权目录。
4. 十五项人工表全部初始未执行，环境记录和回传方式；只需玩家按同版中文说明完成 Windows/游戏流程，并安排一位未参与开发的玩家独立首用。

交付后仍不自动发布或关闭 #77/#72。只有真实证据满足相应要求，才按仓库流程评估验收完成。
