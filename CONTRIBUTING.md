# 参与贡献

欢迎提交国服复制样本、译名校正、问题复现和功能改进。代码沿用 [MIT 许可](LICENSE)；第三方资源保留各自署名和许可。

## 本地开发

需要 Node.js 20+ 和 npm。安装锁定依赖后启动：

```sh
npm ci
npm run dev
```

| 命令 | 检查范围 |
| --- | --- |
| `npm run build` | TypeScript 检查及生产构建 |
| `npm test` | 逻辑回归及边界 OCR 回归 |
| `npm run test:browser` | Playwright 整页流程；首次使用先运行 `npx playwright install chromium` |
| `python3 scripts/check-text-library.py` | 离线词库覆盖及来源完整性 |
| `python3 scripts/replay-text-library.py` | 从已提交来源快照重放词库 |
| `npm run test:deployment` | 临时站点的启动、静态文件、停止和更新 |
| `npm run verify` | 六阶段验证与既有验收合同核对 |

完整验证目前存在已知的旧 `scoring.ts` 字节指纹不匹配；具体边界见 [验收说明](docs/acceptance/README.md)。报告各阶段的实际结果，修复应保留算法回归依据，不以更新摘要掩盖行为变化。Windows 原生剪贴板及游戏现场结果单独记录。

## 修改位置

| 目录／文件 | 内容 |
| --- | --- |
| `src/logic/parser.ts` | 海图文本解析与语言入口 |
| `src/data/textLibrary.ts`、`samples/text-library/` | 词库、来源与真实客户端校准 |
| `src/data/mods.ts`、`strategies.ts` | 稳定词缀 ID 与策略定义 |
| `src/data/region-targets.json` | 区域目标、显示分组、策略优先级及图标来源 |
| `src/data/borderAffinity.json`、`keeper-rules.json` | 边界权重与留图条件 |
| `src/components/` | 页面交互；`src/styles-minimal.css` 为当前主题覆盖 |
| `src/logic/scoring.ts`、`solver.ts` | 评分与求解；变更需说明行为影响并提供回归 |
| `tests/browser/` | 从页面控件和真实 JSON 备份验证用户流程 |

## 国服文本与规则

- 词缀 ID 和形状内部名用于求解与持久化。显示翻译及国服别名在边界映射，保持内部标识稳定。
- 解析器改动附完整原始复制样本，明确客户端版本和独立字段预期。未知形状及关键词缀给出清楚的拒绝原因。
- 分开记录客户端原文、网页来源、推导样本和人工审阅；审阅通过不等于已获得客户端证据。
- 区域目标、边界及留图展示规则和求解评分各有职责。改配置时检查作用范围、策略变化和现有规划恢复。
- 图标新增来源、作者与许可，保持 [素材署名](THIRD_PARTY_NOTICES.md) 与运行配置一致。

领域术语见 [GLOSSARY.md](GLOSSARY.md)，原始样本见 [samples/README.md](samples/README.md)。

## 提交与上游同步

从 `main` 建立改动分支，向本仓库 `main` 提交 PR。说明问题、变更后的行为及实际执行的验证；截图使用演示数据。提交前至少构建成功，并按影响范围运行逻辑和整页回归。

原版更新按 [同步指南](docs/upstream-sync.md) 使用 merge commit，保留共同祖先。代码合并与内网服务更新分开。

## 发布前检查

国服采集器统一使用 `voyage-clip-collector-cn.ahk`。脚本每次迭代递增 `CollectorVersion` 的语义版本号，同步 `public/collector-release.json`；网页从清单读取文件名和版本，浮窗、托盘和运行信息从脚本的同一版本常量读取。制作安装候选时沿用该版本，并由 OCR/安装任务补齐固定组件和模型的兼容清单；仅有命名清单不代表安装包或 OCR 已验收。`npm run test:border-ocr` 核对下载文件与版本清单一致，旧历史证据中的文件名保留原貌。

安装候选使用 `python3 scripts/build-collector.py --output <本机候选目录>` 构建小启动包；加 `--full --components <已校验归档目录>` 构建完整离线包，缺档案时可显式加 `--download` 从固定供应商 URL 准备。构建不会安装、发布或部署，输出 ZIP、SHA-256、源提交与工作区是否有未提交改动。正式交接从干净提交重建；Windows 固定组件见 `public/collector/{ocr-runtime,install-runtime}.json`。本机产物不入库。维护者的 `-ValidateOnly` / `-PrepareOnly` 只校验或展开，不能称为 Windows 安装/就绪通过；实际本地模型自检、正常授权及游戏验收分开记录，见[安装验收](docs/acceptance/collector-install-73.md)。

每个实现 PR 都在 `src/data/updates.ts` 的国服 `UPDATES` 顶部新增记录，说明用户能看到的变化及入口；维护或发布流程变化可用一条简短说明。日期使用实际发布日期，同一天可有多次发布。保留旧条目的日期、标题与顺序；修正历史说明时也要新增本次记录。原版历史单独维护。

提交前运行 `npm run check:release-notes -- --base origin/main`。PR 的 `release-notes` 检查使用 PR 基线；GitHub Pages 构建前再与上次成功部署的提交比较。缺少新增国服记录、无效日期或空说明会阻止发布；查不到发布基线也会停止。即使绕过 PR 检查合并，生产部署仍会被拦住。同一已发布提交的重跑复用已有记录。

手动发布或更新内网服务前，以该实例上次成功发布的提交为 `--base` 运行同一检查，再构建和部署。部署成功后检查线上“更新记录”顶部内容、未读提醒与本次功能；在 PR 中附部署提交和实际结果。记录内容是否准确仍由评审确认，自动检查只强制其存在、结构及新增位置。

构建产物、运行日志、个人路径、证书、浏览器配置及私人库存留在本机。项目历史研究和验收材料已归档，入口见 [文档导航](docs/README.md)。
