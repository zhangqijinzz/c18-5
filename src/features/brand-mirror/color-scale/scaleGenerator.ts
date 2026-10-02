const HEX_COLOR = /^#[0-9A-F]{6}$/i

function isHexColor(value: string): boolean {
  return HEX_COLOR.test(value)
}

/**
 * 品牌色梯度生成（纯函数，不依赖 DOM / 框架）。
 *
 * 设计要点：
 * - 以种子色作为 500 锚点，向浅（50–400）、深（600–900）各生成 5 级；
 * - 每一级都在生成阶段就施加 WCAG 可读性约束：与浅墨（白字）/深墨的对比度
 *   至少达到正文 4.5:1，达不到时自动收敛到 3:1（大字号）并在报告里标记；
 * - 500 锚点若与两种墨色都达不到正文对比，会被微调到刚好通过，并在报告中声明；
 * - 报告同时给出与工作区底色（白 / 辅助色表面）的对比，供界面提示。
 */

export const SCALE_STOPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900] as const
export const ANCHOR_INDEX = 5
const BODY_TARGET = 4.5
const LARGE_TARGET = 3
const AAA_TARGET = 7
/** 相邻两级在 HSL 亮度上的最小间隔，保证深浅之间有规律、不塌缩。 */
const LIGHTNESS_GAP = 0.015
const MIN_L = 0.05
const MAX_L = 0.985

export type ScaleRating = 'AAA' | 'AA' | 'AALarge' | 'Fail'

export interface ColorScaleStep {
  stop: number
  index: number
  hex: string
  /** 建议压在这一级上的文字颜色（浅墨或深墨）。 */
  onInk: string
  /** 与浅墨（白字）的对比度，即白字压在该色上 / 该色压在白底上。 */
  contrastWithLight: number
  /** 与深墨的对比度，即深字压在该色上 / 该色压在深色表面上。 */
  contrastWithDark: number
  rating: ScaleRating
}

export interface ColorScaleReport {
  seed: string
  /** 实际使用的 500 锚点（极端情况下可能被微调）。 */
  anchorHex: string
  anchorAdjusted: boolean
  /** 500 锚点与其推荐文字色是否达到正文对比；否则只建议大字号 / 图形使用。 */
  anchorBodyPasses: boolean
  bodyPassCount: number
  /** 连 3:1 都达不到、需要使用者关注的色阶。 */
  failingStops: number[]
  /** 每一级「最佳文字配对」里最低的对比度。 */
  worstPairRatio: number
  /** 最浅色与白底的最低对比（作为图标 / 浅色块压底时的参考）。 */
  minContrastOnWhite: number
  /** 最深色与深色表面的最低对比。 */
  minContrastOnSurface: number
}

export interface ColorScale {
  steps: ColorScaleStep[]
  hexes: string[]
  report: ColorScaleReport
}

export interface GenerateScaleOptions {
  /** 深墨色，默认取近黑；实际调用时通常传入工作区的 secondary。 */
  darkInk?: string
  lightInk?: string
  /** 工作区深色表面（用于底色可读性报告），默认与深墨相同。 */
  surface?: string
}

interface Hsl {
  h: number
  s: number
  l: number
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  return {
    r: Number.parseInt(hex.slice(1, 3), 16),
    g: Number.parseInt(hex.slice(3, 5), 16),
    b: Number.parseInt(hex.slice(5, 7), 16),
  }
}

export function rgbToHex(r: number, g: number, b: number): string {
  const channel = (value: number) => Math.round(Math.min(255, Math.max(0, value))).toString(16).padStart(2, '0')
  return `#${channel(r)}${channel(g)}${channel(b)}`.toUpperCase()
}

export function hexToHsl(hex: string): Hsl {
  const { r: r255, g: g255, b: b255 } = hexToRgb(hex)
  const r = r255 / 255
  const g = g255 / 255
  const b = b255 / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  const d = max - min
  if (d === 0) return { h: 0, s: 0, l }
  const s = d / (1 - Math.abs(2 * l - 1))
  let h = 0
  if (max === r) h = ((g - b) / d) % 6
  else if (max === g) h = (b - r) / d + 2
  else h = (r - g) / d + 4
  h *= 60
  if (h < 0) h += 360
  return { h, s, l }
}

export function hslToHex({ h, s, l }: Hsl): string {
  const c = (1 - Math.abs(2 * l - 1)) * s
  const hp = (((h % 360) + 360) % 360) / 60
  const x = c * (1 - Math.abs((hp % 2) - 1))
  let r1 = 0
  let g1 = 0
  let b1 = 0
  if (hp < 1) [r1, g1, b1] = [c, x, 0]
  else if (hp < 2) [r1, g1, b1] = [x, c, 0]
  else if (hp < 3) [r1, g1, b1] = [0, c, x]
  else if (hp < 4) [r1, g1, b1] = [0, x, c]
  else if (hp < 5) [r1, g1, b1] = [x, 0, c]
  else [r1, g1, b1] = [c, 0, x]
  const m = l - c / 2
  return rgbToHex((r1 + m) * 255, (g1 + m) * 255, (b1 + m) * 255)
}

function srgbChannel(value: number): number {
  const scaled = value / 255
  return scaled <= 0.03928 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4
}

export function relativeLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex)
  return 0.2126 * srgbChannel(r) + 0.7152 * srgbChannel(g) + 0.0722 * srgbChannel(b)
}

export function contrastRatio(first: string, second: string): number {
  const one = relativeLuminance(first)
  const two = relativeLuminance(second)
  return (Math.max(one, two) + 0.05) / (Math.min(one, two) + 0.05)
}

function ease(t: number): number {
  return t * t * (3 - 2 * t)
}

function ratingFor(ratio: number): ScaleRating {
  if (ratio >= AAA_TARGET) return 'AAA'
  if (ratio >= BODY_TARGET) return 'AA'
  if (ratio >= LARGE_TARGET) return 'AALarge'
  return 'Fail'
}

/**
 * 从种子色生成一条 50–900 的品牌色梯度。
 * 种子必须是 6 位 HEX；非法输入返回 null，由调用方提示。
 */
export function generateColorScale(seedInput: string, options: GenerateScaleOptions = {}): ColorScale | null {
  const seed = seedInput.trim().toUpperCase()
  if (!isHexColor(seed)) return null

  const darkInk = options.darkInk && isHexColor(options.darkInk) ? options.darkInk.toUpperCase() : '#1B1F27'
  const lightInk = options.lightInk && isHexColor(options.lightInk) ? options.lightInk.toUpperCase() : '#FFFFFF'
  const surface = options.surface && isHexColor(options.surface) ? options.surface.toUpperCase() : darkInk

  const anchorHsl = hexToHsl(seed)
  const anchorContrasts = { light: contrastRatio(seed, lightInk), dark: contrastRatio(seed, darkInk) }

  const hexAt = (l: number) => hslToHex({ h: anchorHsl.h, s: anchorHsl.s, l })
  const contrastsAt = (l: number): { light: number; dark: number } => {
    const hex = hexAt(l)
    return { light: contrastRatio(hex, lightInk), dark: contrastRatio(hex, darkInk) }
  }

  // 1) 500 锚点精确保留种子色——它是品牌标识，不能被悄悄推走；
  //    锚点自身的可读性通过推荐文字色保证。仅当种子对两种墨色连大字号
  //    3:1 都达不到时，才在 HSL 上做最小位移，并在报告中明确声明。
  let anchorL = anchorHsl.l
  const bestBefore = Math.max(anchorContrasts.light, anchorContrasts.dark)
  if (bestBefore < LARGE_TARGET) {
    const probes = [
      { found: binarySearchBoundary(anchorL, MAX_L, (l) => contrastsAt(l).dark, LARGE_TARGET, true) },
      { found: binarySearchBoundary(MIN_L, anchorL, (l) => contrastsAt(l).light, LARGE_TARGET, false) },
    ].filter((candidate): candidate is { found: number } => candidate.found !== null)
    if (probes.length > 0) {
      probes.sort((a, b) => Math.abs(a.found - anchorHsl.l) - Math.abs(b.found - anchorHsl.l))
      anchorL = probes[0].found
    }
  }
  const anchorAdjusted = Math.abs(anchorL - anchorHsl.l) > 0.0005
  const anchorHex = hexAt(anchorL)

  // 2) 以锚点为界铺亮度轨道，两端做缓动，越靠近两端步子越大。
  const lightness: number[] = new Array(SCALE_STOPS.length).fill(0)
  lightness[ANCHOR_INDEX] = anchorL
  const lightEnd = Math.max(anchorL + LIGHTNESS_GAP * 5 + 0.05, 0.97)
  const darkEnd = Math.min(anchorL - LIGHTNESS_GAP * 5 - 0.28, 0.1)
  for (let i = ANCHOR_INDEX - 1; i >= 0; i -= 1) {
    const t = (ANCHOR_INDEX - i) / ANCHOR_INDEX
    lightness[i] = anchorL + (lightEnd - anchorL) * ease(t)
  }
  for (let i = ANCHOR_INDEX + 1; i < SCALE_STOPS.length; i += 1) {
    const t = (i - ANCHOR_INDEX) / (SCALE_STOPS.length - 1 - ANCHOR_INDEX)
    lightness[i] = anchorL + (darkEnd - anchorL) * ease(t)
  }

  // 3) 饱和度向两端轻微收敛（灰度种子保持灰度）。约束必须在最终颜色上施加，
  //    否则去饱和带来的亮度变化会让刚刚通过的对比又掉回阈值以下。
  const saturationAt = (i: number) => {
    const distance = Math.abs(i - ANCHOR_INDEX) / ANCHOR_INDEX
    return anchorHsl.s < 0.02 ? anchorHsl.s : Math.max(0.06, anchorHsl.s * (1 - 0.32 * distance ** 1.7))
  }
  const finalContrastsAt = (i: number, l: number): { light: number; dark: number } => {
    const hex = hslToHex({ h: anchorHsl.h, s: saturationAt(i), l })
    return { light: contrastRatio(hex, lightInk), dark: contrastRatio(hex, darkInk) }
  }

  // 浅侧：与深墨的对比随亮度升高而增大。
  for (let i = ANCHOR_INDEX - 1; i >= 0; i -= 1) {
    const floor = lightness[i + 1] + LIGHTNESS_GAP
    let target = Math.min(MAX_L, Math.max(floor, lightness[i]))
    if (finalContrastsAt(i, target).dark < BODY_TARGET) {
      target = enforceContrast(floor, MAX_L, (l) => finalContrastsAt(i, l).dark, true)
    }
    lightness[i] = target
  }
  // 深侧：与白墨的对比随亮度降低而增大。
  for (let i = ANCHOR_INDEX + 1; i < SCALE_STOPS.length; i += 1) {
    const ceiling = lightness[i - 1] - LIGHTNESS_GAP
    let target = Math.max(MIN_L, Math.min(ceiling, lightness[i]))
    if (finalContrastsAt(i, target).light < BODY_TARGET) {
      target = enforceContrast(MIN_L, ceiling, (l) => finalContrastsAt(i, l).light, false)
    }
    lightness[i] = target
  }

  // 4) 输出最终色阶与可读性标注。
  const steps: ColorScaleStep[] = lightness.map((l, i) => {
    const hex = hslToHex({ h: anchorHsl.h, s: saturationAt(i), l })
    const contrastWithLight = contrastRatio(hex, lightInk)
    const contrastWithDark = contrastRatio(hex, darkInk)
    const onInk = chooseInk(i, contrastWithLight, contrastWithDark, lightInk, darkInk)
    return {
      stop: SCALE_STOPS[i],
      index: i,
      hex,
      onInk,
      contrastWithLight: roundRatio(contrastWithLight),
      contrastWithDark: roundRatio(contrastWithDark),
      rating: ratingFor(Math.max(contrastWithLight, contrastWithDark)),
    }
  })

  const failingStops = steps.filter((step) => Math.max(step.contrastWithLight, step.contrastWithDark) < LARGE_TARGET).map((step) => step.stop)
  const pairs = steps.map((step) => Math.max(step.contrastWithLight, step.contrastWithDark))
  return {
    steps,
    hexes: steps.map((step) => step.hex),
    report: {
      seed,
      anchorHex,
      anchorAdjusted,
      anchorBodyPasses: Math.max(contrastRatio(anchorHex, lightInk), contrastRatio(anchorHex, darkInk)) >= BODY_TARGET,
      bodyPassCount: steps.filter((step) => Math.max(step.contrastWithLight, step.contrastWithDark) >= BODY_TARGET).length,
      failingStops,
      worstPairRatio: roundRatio(Math.min(...pairs)),
      minContrastOnWhite: roundRatio(Math.min(...steps.map((step) => contrastRatio(step.hex, '#FFFFFF')))),
      minContrastOnSurface: roundRatio(Math.min(...steps.map((step) => contrastRatio(step.hex, surface)))),
    },
  }
}

/**
 * 在 [low, high] 亮度区间内找到满足对比度阈值的边界。
 * increasing=true：对比度随亮度增大（深字在浅底）；反之随亮度减小（白字在深底）。
 * 先争取正文 4.5:1，达不到再放宽到大字号 3:1；仍达不到则返回最有利的一端。
 */
function enforceContrast(low: number, high: number, probe: (l: number) => number, increasing: boolean): number {
  if (low > high) return increasing ? high : low
  const bestAtFar = increasing ? probe(high) : probe(low)
  const target = bestAtFar >= BODY_TARGET ? BODY_TARGET : bestAtFar >= LARGE_TARGET ? LARGE_TARGET : null
  if (target === null) return increasing ? high : low
  const found = binarySearchBoundary(low, high, probe, target, increasing)
  return found ?? (increasing ? high : low)
}

function binarySearchBoundary(low: number, high: number, probe: (l: number) => number, target: number, increasing: boolean): number | null {
  if (low > high) return null
  const passes = (l: number) => probe(l) >= target
  if (increasing) {
    if (!passes(high)) return null
    for (let iter = 0; iter < 32; iter += 1) {
      const mid = (low + high) / 2
      if (passes(mid)) high = mid
      else low = mid
    }
    return high
  }
  if (!passes(low)) return null
  for (let iter = 0; iter < 32; iter += 1) {
    const mid = (low + high) / 2
    if (passes(mid)) low = mid
    else high = mid
  }
  return low
}

function chooseInk(index: number, withLight: number, withDark: number, lightInk: string, darkInk: string): string {
  const lightPasses = withLight >= BODY_TARGET
  const darkPasses = withDark >= BODY_TARGET
  if (lightPasses && darkPasses) return index <= ANCHOR_INDEX ? darkInk : lightInk
  if (darkPasses) return darkInk
  if (lightPasses) return lightInk
  return withLight >= withDark ? lightInk : darkInk
}

/** 为已有的一组色值（如历史令牌 / 导出）推断最佳文字色。 */
export function recommendInk(hex: string, darkInk = '#1B1F27', lightInk = '#FFFFFF'): string {
  if (!isHexColor(hex)) return darkInk
  return contrastRatio(hex, lightInk) >= contrastRatio(hex, darkInk) ? lightInk : darkInk
}

function roundRatio(value: number): number {
  return Math.round(value * 10) / 10
}
