import { useLayoutEffect, useState } from 'react'

interface Props {
  onClose: () => void
}

interface Step {
  icon: string
  title: string
  /** where this lives on the page */
  where: string
  /** CSS selector of the section to spotlight */
  target: string
  body: string[]
}

const STEPS: Step[] = [
  {
    icon: '🗺️', title: '这个工具能做什么', where: '左侧库存，中间摆盘，右侧选择策略并查看玩法', target: 'main',
    body: [
      '九张海图组成一次航程。海图位置决定词缀作用范围：相邻效果覆盖邻格，边界只作用于直接接触的格子；连接必须匹配才能运行。',
      '工具管理海图库存，并按你的奖励权重或社区策略寻找可执行摆盘。',
    ],
  },
  {
    icon: '📥', title: '导入海图库存', where: '左侧海图库存及下方导入面板', target: '.library-col',
    body: [
      '在国服游戏中 Ctrl+Alt+C 高级复制已测绘海图，再在本页 Ctrl+V 导入。名称、区域等级、奖励、航行词缀和形状会一并读取，重复扫描按原版规则跳过。',
      '可一次粘贴多张海图。Windows 用户可在导入说明下载国服被动采集器：F7 开启放大的计数浮窗，逐张手动 Ctrl+C（需要高级属性时 Ctrl+Alt+C），再按 F7 汇总后粘贴。采集错误也在浮窗提示。',
      '导入稀有怪物类型海图时会出现醒目提示，提醒你保留神圣石策略材料。',
    ],
  },
  {
    icon: '🧭', title: '填写十二个边界', where: '中间摆盘外圈的小槽位', target: '.board-grid',
    body: [
      '边界只作用于直接接触的海图格，因此求解前需要填写当前边界。',
      '可用采集器按住 Alt 后按 F8 截图，听到截图完成提示音或看到浮窗提示后松开，在本机识别边界，再粘贴导入。未识别的位置点击边界槽位手动选择；四角每格接触两个边界，边中格各接触一个，中心没有直接边界。',
      '发现“稀有怪物额外掉落神圣石”边界时，可以考虑对应神圣石策略；界面会显示材料是否齐备。',
    ],
  },
  {
    icon: '⚑', title: '选择策略或手动配置', where: '右侧策略按钮与下方玩法说明', target: '.strategies',
    body: [
      '沿用七个社区策略：普通速刷、锚地垂钓、保险箱速刷、肉鱼、魔法虚灵和两类神圣石边界策略。',
      '策略按钮下显示玩法摘要与材料状态，右侧提供完整说明及搜索参考。材料不足时会列出缺项；偏好与硬性要求仍按原版规则区分。',
      '希望自行安排奖励优先级时，选择手动模式并在求解设置调整权重。',
    ],
  },
  {
    icon: '🔖', title: '为策略保留海图', where: '库存 → 为策略保留海图', target: '.savefor-bar',
    body: [
      '保留向导按策略逐类设置数量。求解器保留每类价值最高的指定数量，超出的海图可正常使用；设为零表示不保留。',
      '保留海图在库存显示 🔒 和对应策略，其他求解不会使用它们；对应策略仍可按原有规则使用。',
      '默认数量依照各策略需要，可保持默认，也可随时调整。',
    ],
  },
  {
    icon: '⚙', title: '求解并选择候选', where: '摆盘下方的求解按钮', target: '.solve-bar',
    body: [
      '点击求解后，最佳候选会载入摆盘，旁边显示其他候选。点击候选可载入其海图实例和朝向。',
      '执行前检查可执行标记：九格填满、连接匹配且从左下起点可达；不完整或连接无效的方案仅作参考。',
      '设置按钮包含连接规则、奖励权重、保留保护、填充航程和优选海图搜索。',
    ],
  },
  {
    icon: '📋', title: '按顺序放入游戏', where: '候选下方的游戏内放置指南', target: '.voyage-finish',
    body: [
      '指南按左下、中下、右下、左中、正中、右中、左上、中上、右上的顺序推进。',
      '每步复制当前海图的游戏内搜索文本。在游戏中粘贴搜索，并 Ctrl+左键放置找到的海图，再在本页点击复制并下一步或按 Ctrl+C。复制不会核销库存。',
      '在摆盘中标记 🔒 保留的海图后，后续求解会固定其位置和朝向。',
    ],
  },
  {
    icon: '🌊', title: '完成航程，再次规划', where: '完成航程按钮及求解旁的航程计划', target: '.solve-bar',
    body: [
      '实际航程结束后点击完成航程，逐张确认保留海图是否存活。只移除本盘使用且未存活的实例；未使用库存保持保留。',
      '核销后摆盘清空，边界和配置保留。补充海图、更新边界即可规划下一航程；航程计划可查看整个库存的运行顺序建议。',
      '同一浏览器和地址会自动保存规划；右上方“导出规划备份／恢复规划备份”可保存与恢复库存、摆盘、边界、设置及航程历史。更新记录可查看原版历史功能。',
    ],
  },
]

const RING_PAD = 6

/** Guided "how to use this site" walkthrough: dims the page and spotlights
 *  the section each step talks about, with the card docked out of the way. */
export function Tutorial({ onClose }: Props) {
  const [step, setStep] = useState(0)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const s = STEPS[step]
  const last = step === STEPS.length - 1

  // track the spotlighted section (through smooth scrolling and resizes)
  useLayoutEffect(() => {
    const el = document.querySelector(STEPS[step].target)
    if (!el) {
      setRect(null)
      return
    }
    el.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    const update = () => setRect(el.getBoundingClientRect())
    update()
    const timer = window.setInterval(update, 120)
    window.addEventListener('resize', update)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('resize', update)
    }
  }, [step])

  // dock the card where it won't cover the spotlight
  const dockTop = !!rect && rect.bottom > window.innerHeight * 0.62

  return (
    <>
      <div className="tut-catcher" onClick={onClose} />
      {rect ? (
        <div
          className="tut-ring"
          style={{
            top: rect.top - RING_PAD,
            left: rect.left - RING_PAD,
            width: rect.width + RING_PAD * 2,
            height: rect.height + RING_PAD * 2,
          }}
        />
      ) : (
        <div className="tut-dim" />
      )}
      <div className={`onboard tutorial tut-docked ${dockTop ? 'tut-top' : ''}`}>
        <div className="panel-title">
          {s.icon} {s.title}
          <span className="spacer" />
          <button onClick={onClose}>✕</button>
        </div>
        <div className="tut-where">📍 {s.where}</div>
        {s.body.map((p, i) => (
          <p key={i} className="tut-body">
            {p}
          </p>
        ))}
        <div className="tut-dots">
          {STEPS.map((_, i) => (
            <button
              key={i}
              className={`tut-dot ${i === step ? 'on' : ''}`}
              onClick={() => setStep(i)}
              title={`${STEPS[i].icon} ${STEPS[i].title}`}
            />
          ))}
        </div>
        <div className="sw-actions">
          <button disabled={step === 0} onClick={() => setStep((x) => x - 1)}>
            ← 上一步
          </button>
          <span className="spacer" />
          <span className="muted tut-count">
            {step + 1} / {STEPS.length}
          </span>
          <span className="spacer" />
          {!last && (
            <button className="primary tut-next" onClick={() => setStep((x) => x + 1)}>
              下一步 →
            </button>
          )}
          {last && (
            <button className="primary tut-next" onClick={onClose}>
              ⚓ 开始规划
            </button>
          )}
        </div>
      </div>
    </>
  )
}
