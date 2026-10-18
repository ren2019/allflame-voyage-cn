# 国服文本库覆盖与差异报告

采集日期：2026-10-14。正式 PoEDB 页面的赛季工具条可见 3.29；具体补丁及其与国服的同步状态未知。不是 PTR。

已调查 141/141 个既有词缀 ID、15/15 个目的地、5/5 种形状的证据状态，以及 11 个真实复制字段。已有六张真实客户端输入（原两张、追加三张、2026-10-18 罪魂牢笼一张）；最新样本的客户端补丁未知。任何 source-only 均不表示已在国服客户端逐字验证。

## 状态汇总

| 类别 | 已校准 | 仅来源 | 冲突 | 缺失 |
| --- | ---: | ---: | ---: | ---: |
| base | 0 | 3 | 0 | 0 |
| border | 0 | 63 | 1 | 0 |
| chart-implicit | 6 | 56 | 0 | 0 |
| destination | 4 | 11 | 0 | 0 |
| field | 11 | 0 | 0 | 0 |
| reward | 0 | 0 | 13 | 2 |
| shape | 5 | 0 | 0 | 0 |

## 原版 ID 逐项审计

所有 source-only 航行/边界映射按机制、数值档位、作用范围和需求等级独立选择两种语言原文；未按行号连接。HTML 没有可证明的逐条原生 mod/stat ID，保持 null/[]。全部定位和摘要在 library.json 与 sources.json。

| ID | 状态 | 作用范围 | 原文或缺项 |
| --- | --- | --- | --- |
| adj-ess-1 | source-only | adjacent | 相邻区域包含 (1—2) 个额外被囚禁的怪物 |
| adj-ess-2 | source-only | adjacent | 相邻区域包含 (2—4) 个额外被囚禁的怪物 |
| adj-ess-3 | source-only | adjacent | 相邻区域包含 5 个额外被囚禁的怪物 |
| adj-box-1 | source-only | adjacent | 相邻区域包含 1 个额外保险箱 |
| adj-box-2 | source-only | adjacent | 相邻区域包含 (2—4) 个额外保险箱 |
| adj-box-3 | source-only | adjacent | 相邻区域包含 5 个额外保险箱 |
| adj-octo-1 | source-only | adjacent | 相邻区域包含 (8—10) 个额外的章鱼群 |
| adj-octo-2 | source-only | adjacent | 相邻区域包含 (11—14) 个额外的章鱼群 |
| adj-crab-1 | confirmed | adjacent | 相邻区域包含 (8—10) 个额外的螃蟹群 |
| adj-crab-2 | source-only | adjacent | 相邻区域包含 (11—14) 个额外的螃蟹群 |
| adj-magic-1 | source-only | adjacent | 相邻区域的魔法怪物数量提高 30% |
| adj-magic-2 | source-only | adjacent | 相邻区域的魔法怪物数量提高 60% |
| adj-rare-1 | source-only | adjacent | 相邻区域的稀有怪物数量提高 30% |
| adj-rare-2 | source-only | adjacent | 相邻区域的稀有怪物数量提高 60% |
| adj-msg-1 | source-only | adjacent | 相邻区域包含 1 个额外瓶中信 |
| adj-msg-2 | source-only | adjacent | 相邻区域包含 2 个额外瓶中信 |
| adj-fish | source-only | adjacent | 相邻区域包含珍贵而奇特的鱼 |
| adj-wisps-1 | source-only | adjacent | 怪物有几率被 2000 个荒林鬼灵强化 |
| adj-wisps-2 | source-only | adjacent | 怪物有几率被 4000 个荒林鬼灵强化 |
| adj-atziri | source-only | adjacent | 阿兹里之息 |
| adj-gold-1 | source-only | adjacent | 相邻区域怪物掉落装备的 40% 转化为金币 |
| adj-gold-2 | source-only | adjacent | 相邻区域怪物掉落装备的 80% 转化为金币 |
| adj-spirit-1 | confirmed | adjacent | 相邻区域包含 1 个额外罪魂牢笼 |
| adj-spirit-2 | source-only | adjacent | 相邻区域包含 2 个额外罪魂牢笼 |
| adj-divbox-1 | source-only | adjacent | 相邻区域包含 2 个额外神圣的秘宝 |
| adj-divbox-2 | source-only | adjacent | 相邻区域包含 3 个额外神圣的秘宝 |
| adj-arcbox-1 | source-only | adjacent | 相邻区域包含 2 个额外奥术师的保险箱 |
| adj-arcbox-2 | source-only | adjacent | 相邻区域包含 3 个额外奥术师的保险箱 |
| adj-opbox-1 | confirmed | adjacent | 相邻区域包含 2 个额外侦探的保险箱 |
| adj-opbox-2 | source-only | adjacent | 相邻区域包含 3 个额外侦探的保险箱 |
| adj-barrel-1 | source-only | adjacent | 相邻区域包含 (12—15) 个额外木桶丛 |
| adj-barrel-2 | source-only | adjacent | 相邻区域包含 (16—20) 个额外木桶丛 |
| adj-star-1 | source-only | adjacent | 相邻区域包含 (4—5) 个额外巨型海星 |
| adj-star-2 | source-only | adjacent | 相邻区域包含 (6—7) 个额外巨型海星 |
| adj-fracture | source-only | adjacent | 相邻区域掉落的物品有 2% 的几率分裂 |
| adj-lantern | source-only | adjacent | 相邻区域包含 4 个额外黄金灯笼 |
| adj-pantheon | source-only | adjacent | 相邻区域的稀有怪物将带有众神词缀 |
| adj-uring-1 | source-only | adjacent | 相邻区域掉落的戒指有 10% 的几率改为掉落为传奇戒指 |
| adj-uring-2 | source-only | adjacent | 相邻区域掉落的戒指有 20% 的几率改为掉落为传奇戒指 |
| adj-uamu-1 | source-only | adjacent | 相邻区域掉落的护身符有 10% 的几率改为掉落为传奇护身符 |
| adj-uamu-2 | source-only | adjacent | 相邻区域掉落的护身符有 20% 的几率改为掉落为传奇护身符 |
| adj-ubelt-1 | source-only | adjacent | 相邻区域掉落的腰带有 10% 的几率改为掉落为传奇腰带 |
| adj-ubelt-2 | source-only | adjacent | 相邻区域掉落的腰带有 20% 的几率改为掉落为传奇腰带 |
| voy-soul | source-only | global | 所有航行区域的玩家拥有噬魂者 |
| voy-pack-1 | confirmed | global | 所有航行区域的怪物群规模提高 5% |
| voy-pack-2 | confirmed | global | 所有航行区域的怪物群规模提高 7% |
| voy-quant-1 | source-only | global | 所有航行区域中找到的物品数量提高 8% |
| voy-quant-2 | source-only | global | 所有航行区域中找到的物品数量提高 10% |
| voy-rarity-1 | source-only | global | 所有航行区域中找到的物品稀有度提高 7% |
| voy-rarity-2 | source-only | global | 所有航行区域中找到的物品稀有度提高 9% |
| voy-jelly | source-only | global | 所有航行区域包含友善水母 |
| voy-sulph-1 | source-only | global | 所有航行区域中找到的亡者硫磺提高 15% |
| voy-sulph-2 | source-only | global | 所有航行区域中找到的亡者硫磺提高 20% |
| voy-sulph-3 | source-only | global | 所有航行区域中找到的亡者硫磺提高 25% |
| voy-rare | source-only | global | 所有航行区域的稀有怪物数量提高 25% |
| voy-magic | source-only | global | 所有航行区域的魔法怪物数量提高 25% |
| voy-noequip | source-only | global | 所有航行区域中的怪物无法掉落装备、药剂或酊剂 |
| voy-minmagic | source-only | global | 所有航行区域的怪物至少为魔法 |
| voy-possess | source-only | global | 所有航行区域的稀有怪物有 100% 的几率被附身 |
| voy-essence | source-only | global | 所有航行区域中作为原生住民的稀有怪物被精华囚禁 |
| voy-fracture | source-only | global | 所有航行区域的稀有怪物死亡时有 50% 的几率分裂 |
| voy-flask | confirmed | global | 所有航行区域中找到的药剂有 100% 的几率带有 20% 品质 |
| b-pack-1 | source-only | border | 相邻区域的怪物群规模提高 16% |
| b-pack-2 | source-only | border | 相邻区域的怪物群规模提高 24% |
| b-pack-3 | source-only | border | 相邻区域的怪物群规模提高 32% |
| b-minmagic | source-only | border | 相邻区域的怪物至少为魔法 |
| b-rare-1 | source-only | border | 相邻区域的稀有怪物数量提高 50% |
| b-rare-2 | source-only | border | 相邻区域的稀有怪物数量提高 75% |
| b-rare-3 | source-only | border | 相邻区域的稀有怪物数量提高 100% |
| b-beasts-1 | source-only | border | 相邻区域包含 8 个额外的海兽群 |
| b-beasts-2 | source-only | border | 相邻区域包含 12 个额外的海兽群 |
| b-beasts-3 | source-only | border | 相邻区域包含 16 个额外的海兽群 |
| b-crabs-1 | source-only | border | 相邻区域包含 8 个额外的螃蟹群 |
| b-crabs-2 | source-only | border | 相邻区域包含 12 个额外的螃蟹群 |
| b-crabs-3 | source-only | border | 相邻区域包含 16 个额外的螃蟹群 |
| b-drowned-1 | source-only | border | 相邻区域包含 8 个额外的溺亡者群 |
| b-drowned-2 | source-only | border | 相邻区域包含 12 个额外的溺亡者群 |
| b-drowned-3 | source-only | border | 相邻区域包含 16 个额外的溺亡者群 |
| b-mag-1 | source-only | border | 相邻区域的词缀数值提高 40% |
| b-mag-2 | source-only | border | 相邻区域的词缀数值提高 60% |
| b-mag-3 | source-only | border | 相邻区域的词缀数值提高 80% |
| b-keep-1 | source-only | border | 相邻海图在开始航行时有 30% 的几率不被消耗 |
| b-keep-2 | source-only | border | 相邻海图在开始航行时有 50% 的几率不被消耗 |
| b-octoboss | source-only | border | 相邻区域包含污秽蟹群 |
| b-lanterns | source-only | border | 在相邻区域放置灯笼不会减少你的灯笼数量 |
| b-ancient | source-only | border | 相邻区域的稀有怪物掉落 1 个额外远古石 |
| b-divine | source-only | border | 相邻区域的稀有怪物掉落 1 个额外神圣石 |
| b-exalt | source-only | border | 相邻区域的稀有怪物掉落 1 个额外崇高石 |
| b-annul | source-only | border | 相邻区域的稀有怪物掉落 1 个额外剥离石 |
| b-chaos | source-only | border | 相邻区域的稀有怪物掉落 1 个额外混沌石 |
| b-vaal | source-only | border | 相邻区域的稀有怪物掉落 1 个额外瓦尔宝珠 |
| b-gcp | source-only | border | 相邻区域的稀有怪物掉落 1 个额外宝石匠的棱镜 |
| b-chrome | source-only | border | 相邻区域的稀有怪物掉落 1 个额外幻色石 |
| b-regret | source-only | border | 相邻区域的稀有怪物掉落 1 个额外后悔石 |
| b-blessed | source-only | border | 相邻区域的稀有怪物掉落 1 个额外祝福石 |
| b-regal | source-only | border | 相邻区域的稀有怪物掉落 1 个额外富豪石 |
| b-support | source-only | border | 相邻区域的稀有怪物有 20% 的几率掉落一颗辅助技能石 |
| b-locker | source-only | border | 相邻区域包含一个失落的海盗储物箱 |
| b-pirates | source-only | border | 相邻区域包含一支盐水腐朽袭掠队 |
| b-rareconn-1 | source-only | border | 相邻区域中稀有怪物数量按每条连接提高 50% |
| b-rareconn-2 | source-only | border | 相邻区域中稀有怪物数量按每条连接提高 75% |
| b-quantconn-1 | source-only | border | 相邻区域中找到的物品数量按每条连接降低 50% / 相邻区域中找到的物品数量提高 120% |
| b-quantconn-2 | source-only | border | 相邻区域中找到的物品数量按每条连接降低 50% / 相邻区域中找到的物品数量提高 180% |
| b-gold-1 | source-only | border | 相邻区域怪物掉落装备的 25% 转化为金币 |
| b-gold-2 | source-only | border | 相邻区域怪物掉落装备的 50% 转化为金币 |
| b-decks | source-only | border | 相邻区域内怪物掉落的基础通货物品将改为掉落为命运卡组 |
| b-scarabdrop | source-only | border | 相邻区域的稀有怪物掉落 1 个额外圣甲虫 |
| b-curr-1 | source-only | border | 相邻区域中找到的通货总增 50% |
| b-curr-2 | source-only | border | 相邻区域中找到的通货总增 75% |
| b-curr-3 | source-only | border | 相邻区域中找到的通货总增 100% |
| b-scarab-1 | source-only | border | 相邻区域中找到的圣甲虫总增 50% |
| b-scarab-2 | source-only | border | 相邻区域中找到的圣甲虫总增 75% |
| b-scarab-3 | source-only | border | 相邻区域中找到的圣甲虫总增 100% |
| b-rarity-1 | source-only | border | 相邻区域中找到物品的稀有度总增 50% |
| b-rarity-2 | source-only | border | 相邻区域中找到物品的稀有度总增 75% |
| b-rarity-3 | source-only | border | 相邻区域中找到物品的稀有度总增 100% |
| b-crabboss | source-only | border | 相邻区域包含船长灾星 |
| b-exp-1 | source-only | border | 相邻区域内的玩家获得的经验值提高 100% |
| b-exp-2 | source-only | border | 相邻区域内的玩家获得的经验值提高 150% |
| b-exp-3 | source-only | border | 相邻区域内的玩家获得的经验值提高 200% |
| b-magicmods | source-only | border | 相邻区域的魔法怪物带有一个额外词缀 |
| b-anchor-1 | source-only | border | 相邻区域包含 2 个额外宝藏锚 |
| b-anchor-2 | source-only | border | 相邻区域包含 4 个额外宝藏锚 |
| b-sulphdrop | conflict | border | 相邻区域的稀有怪物掉落死者硫磺 |
| b-goldlantern | source-only | border | 相邻区域包含 4 个额外黄金灯笼 |
| b-izaro | source-only | border | 相邻区域包含 2 座女神祭坛 |
| cm-quant-20 | conflict | self | 无同档原文；见 sourceObservations 和 nextEvidence |
| cm-quant-28 | conflict | self | 相邻区域中找到的物品数量提高 28% 物理 混沌 攻击 异常状态 |
| cm-quant-32 | conflict | self | 相邻区域中找到的物品数量提高 32% |
| cm-quant-45 | conflict | self | 无同档原文；见 sourceObservations 和 nextEvidence |
| cm-sulph-30 | conflict | self | 相邻区域中找到的亡者硫磺提高 30% |
| cm-sulph-45 | conflict | self | 相邻区域中找到的亡者硫磺提高 45% 伤害 |
| cm-rarity-12 | conflict | self | 无同档原文；见 sourceObservations 和 nextEvidence |
| cm-rarity-18 | conflict | self | 无同档原文；见 sourceObservations 和 nextEvidence |
| cm-rarity-20 | conflict | self | 无同档原文；见 sourceObservations 和 nextEvidence |
| cm-rarity-30 | conflict | self | 相邻区域中找到的物品稀有度提高 30% |
| cm-pack-14 | conflict | self | 相邻区域的怪物群规模提高 14% |
| cm-pack-16 | conflict | self | 相邻区域的怪物群规模提高 16% |
| cm-pack-18 | conflict | self | 相邻区域的怪物群规模提高 18% |
| cm-gold-50 | missing | self | 无同档原文；见 sourceObservations 和 nextEvidence |
| cm-gold-70 | missing | self | 无同档原文；见 sourceObservations 和 nextEvidence |

## 客户端和网页差异

- 罪魂牢笼网页为“相邻区域包含 1 个额外罪魂牢笼”，2026-10-18 真实复制为“相邻区域包含一个额外罪魂牢笼 — 数值不可调整”。两份原文保留在 `cnText` 与 `clientText`。匹配器另将“包含”后、“个”前的单字一至九（含两）归一为阿拉伯数字，并统一“个额外／个额外的”；这些等价推导不增加客户端校准数量。数量、区间、作用范围及效果名称仍须精确匹配。
- 螃蟹网页模板为“相邻区域包含 (8—10) 个额外的螃蟹群”；真实复制有实际值 8(8-10)、半角连字符和“ — 数值不可调整”后缀。匹配器仅归一这些已见表示，保留档位与身份。
- 全航程 5% 怪物群规模与头部本区域 5% 怪物群大小是不同效果；库不改评分。
- cm-* 是原工具归并奖励 ID，不是网页逐条原生 ID。当前网页显式奖励写相邻区域，客户端已见硫磺正文写“此区域”，原版作用于 self；13 条保留 conflict，金币两条 missing。头部总值不能再叠加正文。
- 当前数量表主要为 25/32/40/55%，另有一个 28% 特殊条目；原版为 20/28/32/45%。未将新档位强行落入旧 ID。
- 当前稀有度为 16/22/30/38%，原版为 12/18/20/30%；未造 12/18/20% 中文。群规模 14/16/18% 可见但作用域冲突。未找到 50/70% 金币显式奖励。
- 边界 b-sulphdrop 网页为“死者硫磺”，真实海图奖励头为“亡者硫磺”。保留逐来源原文，需边界客户端证据；其余 63 个边界也只为 source-only。
- 边界表 65 行，其中一条 CN/EN 均空白；记录为 unmatched，未制造第 65 个内部 ID。
- 额外热泉裂口基底、超出原版的目的地和六条怪物强韧/奖励机制仅为 unmatched；Roomss 中英分别 18/19 行，未按位置连接。

## 剩余实际采集请求

1. 五种形状标签均已由五张真实国服高级复制校准：端点、直线、角落、节点、交叉；原三项missing已解除，标准拓扑沿用原版。追加来源及逐字段预期见 `samples/charted-extra-shapes.zh-CN.txt` 和相邻expected JSON；实际游戏放置仍须现场验收。
2. 提供 12 槽边界悬停原文或游戏截图，优先“死者/亡者硫磺”及边界空白条。确认 64 个网页模板的客户端实际文字。
3. 提供各显式奖励档位的国服高级复制，核对 self/adjacent、数量/稀有度/金币档位及测绘阶段；未解决前原评分参数保持不变。
4. 如需要原生 mod/stat ID 级验证，取得对应版本可验证客户端文本/数据文件或 PoEDB 详情导出。目前 HTML 只提供文本与少数 stat 展示名称，不能把展示名称或行序伪装为原生 ID。
5. 提供未测绘、普通、低级及其他基底真实样本；现有库不能声称这些复制格式已完成国服客户端校准。
