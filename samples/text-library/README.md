# 离线国服文本库

#3 的独立资料交付，来源和覆盖报告见 [coverage.md](coverage.md)。应用继续使用原版内部 ID、效果和权重，资料库不直接覆写评分。

- `library.json`：可离线消费的 `records` 和 `unmatched`。每项包含 `kind/internalId/cnText/enText/scope/tier/numericRange`、真实来源 metadata（已取得时）、空值原生 mod/stat ID、来源定位/摘要、日期/版本、映射依据、客户端引用和状态。`numericRange` 是原文中依次出现的数值或区间，不是 heuristic effect percent。
- `mappings.reviewed.json`：126 个相邻/全航程/边界效果的独立双语语义复核与精确定位文本。明确没有原生逐条 ID 验证；不按双语行号连接。
- `sources.json` 和 `snapshots/`：正式 `/cn/`、`/us/` 页面完整 HTML 快照、remio 首选获取结果、SHA-256 和来源说明。remio 结果省略隐藏表和标识，才补采完整 HTML；全部为可离线重放的原始证据，不需要浏览器执行 HTML。
- `observed-tables.*.json`：150 个混合海图词缀和 65 个边界网页行分别保留；不等于原工具 141 个 ID。
- `coverage.json` 和 `conflicts.json`：完整分母与逐项状态，客户端未知项和差异仍是明确缺口。`repository-inventory.json` 保留取得时原版英文语义，用实时源码 ID 集合检查漂移。

应用消费入口：`src/data/textLibrary.ts` 的 `TEXT_LIBRARY` 与 `matchChineseChartImplicit(text): string | null`。匹配仅限已取得的 62 个航行隐式模板（confirmed/source-only），支持已见实际 roll/range 和不可调整后缀；对有区间的来源模板，仍要求该区间，普通复制只给实际数值时返回 null（可能存在档位重叠），不声称已兼容所有客户端复制变体。不会接受 reward 冲突、边界条目或原版未匹配机制。边界展示可按 `kind === 'border'` 获取原文和状态，目的地按 `kind === 'destination'` 获取 ID。`cnText === null` 不应自动翻译为“已校准”客户端原文。

`confirmed` = 真实国服客户端校准；`source-only` = 正式来源已复核但客户端未校准；`conflict` = 版本/档位/作用域或文字差异；`missing` = 逐项检索后仍未获得对应证据；`unmatched` = 来源可见但没有原版内部映射。网页模板与 `samples/charted.zh-CN.txt`（原2张）、`samples/charted-extra-shapes.zh-CN.txt`（追加3张）及 `samples/charted-tormented-cage.zh-CN.txt`（罪魂牢笼1张）的真实复制全文分开保存。匹配器也接受 confirmed 记录独立保存的 `clientText`，以覆盖已采集的“一个”与网页“1 个”措辞差异；另提供有限的等价归一化：“包含”后、“个”前的单字一至九（含“两”）转为同值阿拉伯数字，“个额外的”与“个额外”等价；只作用于匹配键，原文不改。派生写法不标记为真实客户端证据，仍保留精确数量、区间、作用范围、效果名称及唯一匹配要求。客户端source manifest保留原始文件名、null URL和逐文件SHA256；逐条引用定位至对应sample。派生测试仅在测试代码中创建，不计入真实采集数量。

离线重放和验证（Python 标准库，无网络）：

```sh
python3 scripts/replay-text-library.py
python3 scripts/check-text-library.py
npx vitest run src/data/textLibrary.test.ts tests/text-library-audit.test.ts
```

完整重采是有意更新数据的维护操作：先 `remio web_get`，对有损结果才补完整 HTML；替换快照后重新人工复核 `mappings.reviewed.json`，运行重放、审计和回归。不得以实时第三方页面替代固定测试证据。
