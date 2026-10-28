import { TEXT_LIBRARY, mainlandDisplayText } from './textLibrary'
import { voyageModById } from './mods'
import { STAT_LABELS } from '../types'

export const SCOPE_LABELS = { self: '本区域', adjacent: '相邻区域', global: '全航程' } as const

const sourceText = new Map(TEXT_LIBRARY.records
  .filter((record) => record.kind === 'chart-implicit' && record.cnText && ['confirmed', 'source-only'].includes(record.status))
  .map((record) => [record.internalId, record.cnText!]))
const destinations = new Map(TEXT_LIBRARY.records
  .filter((record) => record.kind === 'destination' && record.cnText && ['confirmed', 'source-only'].includes(record.status))
  .map((record) => [record.internalId, record.cnText!]))
const shapes = new Map(TEXT_LIBRARY.records
  .filter((record) => record.kind === 'shape' && record.cnText && record.status === 'confirmed')
  .map((record) => [record.internalId, record.cnText!]))

/** Display wording only. Conflicting cm-* templates never become parser aliases. */
export function voyageModText(id: string): string {
  const acquired = sourceText.get(id)
  if (acquired) return mainlandDisplayText(acquired)
  const mod = voyageModById.get(id)
  if (!mod) return '未识别词缀'
  if (mod.scope === 'self') return mod.effects.map((effect) =>
    `本区域${STAT_LABELS[effect.stat]}提高 ${effect.percent}%`,
  ).join('；')
  return '未识别航行词缀'
}

/** A UI abbreviation of acquired wording, never a new clipboard template. */
export function voyageModShort(id: string): string {
  return voyageModText(id)
    .replace(/^(?:相邻区域|所有航行区域)(?:的|中)?/, '')
    .replace(/^包含\s*/, '')
    .replace(/额外的?/g, '')
    .trim()
}

export function destinationLabel(id: string | undefined): string {
  return id ? destinations.get(id) ?? '未识别目的地' : ''
}

// Connector descriptions are UI prose for old English/Korean inventory, not
// unacquired mainland client names and never parser aliases.
export function chartShapeLabel(shape: string | undefined): string {
  return shape ? shapes.get(shape) ?? ({ Corner: '相邻双向连接', Junction: '三向连接', Crossing: '四向连接' } as Record<string, string>)[shape] ?? '未识别形状' : ''
}
