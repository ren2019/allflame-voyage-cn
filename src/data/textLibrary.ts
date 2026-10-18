import library from '../../samples/text-library/library.json' with { type: 'json' }

// Candidate wording and audit status are independent of the game's existing
// scoring definitions. No reward conflicts or unsupported mechanisms enter
// the chart-implicit matcher.
export const TEXT_LIBRARY = library

const COUNT_DIGITS: Record<string, string> = {
  一: '1', 二: '2', 两: '2', 三: '3', 四: '4', 五: '5', 六: '6', 七: '7', 八: '8', 九: '9',
}

function normalizeImplicit(text: string): string {
  return text
    .normalize('NFKC')
    .replace(/\s+/g, '')
    .replace(/[—–]/g, '-')
    .replace(/-数值不可调整$/u, '')
    .replace(/(\d+)\((\d+)-(\d+)\)/g, (_match, roll: string, low: string, high: string) =>
      Number(roll) >= Number(low) && Number(roll) <= Number(high) ? `${low}-${high}` : 'invalid-roll',
    )
    .replace(/\((\d+-\d+)\)/g, '$1')
    // Only normalize the count clause: retain quantities, ranges, scope and
    // mechanic names. These derived equivalents are not client evidence.
    .replace(/包含([一二两三四五六七八九])个/g, (_match, digit: string) => `包含${COUNT_DIGITS[digit]}个`)
    .replace(/个额外的/g, '个额外')
}

/** Match only acquired, semantically reviewed chart implicits, including exact
 * client wording preserved separately from the formal source template. */
export function matchChineseChartImplicit(text: string): string | null {
  const key = normalizeImplicit(text)
  const records = TEXT_LIBRARY.records.filter((record) =>
    record.kind === 'chart-implicit' &&
    (record.status === 'confirmed' || record.status === 'source-only') &&
    record.cnText !== null && (
      normalizeImplicit(record.cnText) === key ||
      (record.status === 'confirmed' && record.clientText != null && normalizeImplicit(record.clientText) === key)
    ),
  )
  return records.length === 1 ? records[0].internalId : null
}
