# 验收与证据

日常验证命令见 [贡献指南](../../CONTRIBUTING.md)。逻辑、整页浏览器、部署检查、Windows 原生剪贴板和游戏现场分别记录，彼此不能替代。

## 国服采集器候选

- [玩家十五项验收记录](collector-player-checklist.md)：Windows、授权、真实游戏、失败恢复与新手结果初始全部未执行。
- [候选核对与证据边界](collector-candidate.md)：复用现有构建与公开 CLI，最终摘要以实际候选清单/外部交付报告为准。
- [采集三路径与失败恢复](collector-flow.md)：截图、读取、输出与网页匹配的具体预期。

## 主分支保留的文件

- [coverage.json](coverage.json)：原国服适配合同，包含七类故事、27 组场景、必要样本及历史核心文件指纹。
- [port.feature](port.feature)：与合同对应的用户旅程。
- [client-shapes.md](client-shapes.md)：五种真实形状的来源与字段预期。
- [code-review.md](code-review.md)：最初国服适配的审查记录。
- `evidence/windows-*.json`：验收合同及回归用例直接依赖的历史 Windows 样本，不代表当前版本重新执行了现场验收。
- [field-checklist.md](field-checklist.md)：使用者可执行的游戏现场核对步骤。

## 当前已知边界

2026-10-16 合并前的记录中，536 项逻辑、79 项浏览器、5 项部署检查、OCR、词库审计和构建均通过。整条 `npm run verify` 仍因旧合同的 `scoring.ts` 字节指纹不匹配而退出 1；后续共享作用范围的提取已有单独审查，合同尚未更新。不得将阶段通过表述为总门禁通过，也不得为掩盖行为变化直接替换指纹。

原始结果与源码归属见[合并验证记录](https://github.com/ren2019/allflame-voyage-cn/tree/93d197845d5ca0fe27da54191b877e240b60937b/docs/acceptance/main-merge-2026-10-16)。本轮文档整理不把这些旧结果归到新提交。

Windows 与游戏现场尚缺的证据由 [#23](https://github.com/ren2019/allflame-voyage-cn/issues/23)、[#24](https://github.com/ren2019/allflame-voyage-cn/issues/24) 等现有议题继续跟踪。

## 历史材料

试用截图、生成报告、诊断日志及逐轮部署记录已从日常源码树移到[固定历史快照](https://github.com/ren2019/allflame-voyage-cn/tree/93d197845d5ca0fe27da54191b877e240b60937b/docs/acceptance)。保留其原始内容和提交归属，不将旧结果修饰为当前通过。
