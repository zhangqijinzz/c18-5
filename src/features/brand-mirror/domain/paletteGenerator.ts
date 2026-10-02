import { INITIAL_TOKENS } from '../models/brandMirrorModels'
import type { ColorScaleStop, PrimaryScale } from '../models/brandMirrorModels'

/** 梯度档位，从浅到深，500 为种子色 */
export const SCALE_STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900] as const
export const SEED_STEP_INDEX = SCALE_STEPS.indexOf(500)

/** 可读性约束阈值（WCAG） */
export const TEXT_CONTRAST = 4.5
export const LARGE_TEXT_CONTRAST = 3
export const SURFACE_CONTRAST = 3

const PAPER = '#FFFFFF'
const INK = '#111418'

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

interface HSL {
  h: number
  s: number
  l: number
}

export function normalizeSeed(value: string): string | null {
  const candidate = value.trim().toUpperCase()
  return /^#[0-9A-F]{6}$/.test(candidate) ? candidate : null
}

/* ------------------------- 色彩空间换算 ------------------------- */

export function hexToHsl(hex: string): HSL {
  const red = Number.parseInt(hex.slice(1, 3), 16) / 255
  const green = Number.parseInt(hex.slice(3, 5), 16) / 255
  const blue = Number.parseInt(hex.slice(5, 7), 16) / 255
  const max = Math.max(red, green, blue)
  const min = Math.min(red, green, blue)
  const lightness = (max + min) / 2
  const delta = max - min
  if (delta === 0) return { h: 0, s: 0, l: lightness * 100 }
  const saturation = delta / (1 - Math.abs(2 * lightness - 1))
  let hue: number
  if (max === red) hue = ((green - blue) / delta) % 6
  else if (max === green) hue = (blue - red) / delta + 2
  else hue = (red - green) / delta + 4
  hue *= 60
  if (hue < 0) hue += 360
  return { h: hue, s: saturation * 100, l: lightness * 100 }
}

export function hslToHex(hsl: HSL): string {
  const hue = (((hsl.h % 360) + 360) % 360) / 360
  const saturation = clamp(hsl.s, 0, 100) / 100
  const lightness = clamp(hsl.l, 0, 100) / 100
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation
  const x = chroma * (1 - Math.abs(((hue * 6) % 2) - 1))
  const offset = lightness - chroma / 2
  let red = 0
  let green = 0
  let blue = 0
  if (hue < 1 / 6) [red, green, blue] = [chroma, x, 0]
  else if (hue < 2 / 6) [red, green, blue] = [x, chroma, 0]
  else if (hue < 3 / 6) [red, green, blue] = [0, chroma, x]
  else if (hue < 4 / 6) [red, green, blue] = [0, x, chroma]
  else if (hue < 5 / 6) [red, green, blue] = [x, 0, chroma]
  else [red, green, blue] = [chroma, 0, x]
  return `#${[red, green, blue]
    .map((channel) => Math.round((channel + offset) * 255).toString(16).padStart(2, '0'))
    .join('')}`.toUpperCase()
}

/* ------------------------- WCAG 对比度 ------------------------- */

function channelLuminance(value: number): number {
  const scaled = value / 255
  return scaled <= 0.03928 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4
}

function luminance(hex: string): number {
  const red = channelLuminance(Number.parseInt(hex.slice(1, 3), 16))
  const green = channelLuminance(Number.parseInt(hex.slice(3, 5), 16))
  const blue = channelLuminance(Number.parseInt(hex.slice(5, 7), 16))
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue
}

export function contrastRatio(first: string, second: string): number {
  const one = luminance(first)
  const two = luminance(second)
  return (Math.max(one, two) + 0.05) / (Math.min(one, two) + 0.05)
}

/* ------------------------- 梯度生成 ------------------------- */

interface RampOptions {
  seed: string
  surface: string
  /** 约束不收敛时的安全迭代上限 */
  maxIterations?: number
}

/**
 * 由种子色生成一条从浅到深、相对亮度严格单调的梯度。
 *
 * 1. 在 HSL 空间以 500（种子）为锚，按感知缓动向近白 / 近黑铺开，
 *    浅色档轻微提饱和、深色档轻微压饱和，得到有序基线；
 * 2. 迭代施加可读性约束并不断重建亮度单调性：
 *    - 浅档（50–400）对深墨文字达到正文对比 4.5:1；
 *    - 深档（600–900）对白色文字达到正文对比 4.5:1；
 *    - 浅底上的深色实色档再与底色保持 3:1 的识别对比；
 *    - 500 永远锚定为种子色，只输出文字搭配建议，不改种子；
 *    - 物理上无法满足的约束（如黄色压白底、深色压深底）不强行改色，
 *      而是在返回结果中如实标记，供 UI 提示使用限制。
 */
export function generatePrimaryScale(options: RampOptions): PrimaryScale {
  const seed = options.seed.toUpperCase()
  const surface = options.surface.toUpperCase()
  const maxIterations = options.maxIterations ?? 80
  const seedHsl = hexToHsl(seed)

  // 1) 感知基线：p 为离开种子的归一化距离（0 → 1）
  const hsls: HSL[] = SCALE_STEPS.map((_, index) => {
    if (index === SEED_STEP_INDEX) return { ...seedHsl }
    const distance = Math.abs(index - SEED_STEP_INDEX) / SEED_STEP_INDEX
    const p = 0.22 * distance + 0.78 * distance ** 1.35
    if (index < SEED_STEP_INDEX) {
      return {
        h: seedHsl.h,
        s: clamp(seedHsl.s + (Math.min(seedHsl.s * 1.06, 90) - seedHsl.s) * p, 0, 96),
        l: seedHsl.l + (98 - seedHsl.l) * p,
      }
    }
    return {
      h: seedHsl.h,
      s: clamp(seedHsl.s + (seedHsl.s * 0.62 - seedHsl.s) * p, 0, 100),
      l: seedHsl.l + (6 - seedHsl.l) * p,
    }
  })

  // 2) 统一的约束求解循环，直到所有可满足的约束稳定：
  //    a) 文字可读性：浅档对深墨、深档对白字达到 4.5:1（500 锚定不参与）；
  //    b) 底色识别：深色实色档（600–900）对底色达到 3:1（浅底场景）；
  //    c) 相对亮度以 500 为锚严格单调，相邻档保持可辨间距。
  // 浅 / 深文字方向固定（浅档永远配深字、深档永远配白字）；
  // 深底上深色实色档天然不可辨，此时不强行改色，而是在报告中如实标记。
  const RELATIVE_GAP = 0.012
  const lumOf = (index: number): number => luminance(hslToHex(hsls[index]))
  const surfaceIsDark = luminance(surface) < luminance(PAPER) / 2
  const SOLID_DARK_STOPS = [6, 7, 8, 9]

  for (let iteration = 0; iteration < maxIterations; iteration += 1) {
    let moved = false

    // a) 文字对比
    for (let index = 0; index < SEED_STEP_INDEX; index += 1) {
      if (contrastRatio(hslToHex(hsls[index]), INK) < TEXT_CONTRAST) {
        hsls[index].l = clamp(hsls[index].l + 0.5, 1, 99)
        moved = true
      }
    }
    for (let index = hsls.length - 1; index > SEED_STEP_INDEX; index -= 1) {
      if (contrastRatio(hslToHex(hsls[index]), PAPER) < TEXT_CONTRAST) {
        hsls[index].l = clamp(hsls[index].l - 0.5, 1, 99)
        moved = true
      }
    }

    // b) 浅底下的深色实色档对底色识别：压暗，但仍须满足白字对比与相邻档顺序
    if (!surfaceIsDark) {
      for (const index of SOLID_DARK_STOPS) {
        if (contrastRatio(hslToHex(hsls[index]), surface) >= SURFACE_CONTRAST) continue
        const candidate: HSL = { ...hsls[index], l: clamp(hsls[index].l - 0.5, 1, 99) }
        const candidateHex = hslToHex(candidate)
        const textStillPasses = contrastRatio(candidateHex, PAPER) >= TEXT_CONTRAST
        const orderedWithNeighbors =
          luminance(candidateHex) < lumOf(index - 1) - RELATIVE_GAP &&
          (index === hsls.length - 1 || luminance(candidateHex) > lumOf(index + 1) + RELATIVE_GAP)
        if (textStillPasses && orderedWithNeighbors) {
          hsls[index] = candidate
          moved = true
        }
      }
    }

    // c) 相对亮度单调（500 不动，压力全部由两侧承担）
    for (let index = SEED_STEP_INDEX - 1; index >= 0; index -= 1) {
      if (lumOf(index) <= lumOf(index + 1) + RELATIVE_GAP) {
        hsls[index].l = clamp(hsls[index].l + 0.8, 1, 99)
        moved = true
      }
    }
    for (let index = SEED_STEP_INDEX + 1; index < hsls.length; index += 1) {
      if (lumOf(index) >= lumOf(index - 1) - RELATIVE_GAP) {
        hsls[index].l = clamp(hsls[index].l - 0.8, 1, 99)
        moved = true
      }
    }

    if (!moved) break
  }

  // 3) 500 严格锚定种子色
  hsls[SEED_STEP_INDEX] = { ...seedHsl }

  const stops = hsls.map((hsl, index) => buildStop(SCALE_STEPS[index], hslToHex(hsl), surface))
  return { seed, stops }
}

function buildStop(step: number, color: string, surface: string): ColorScaleStop {
  const inkRatio = contrastRatio(color, INK)
  const paperRatio = contrastRatio(color, PAPER)
  // 文字色永远选择对比更强的一侧
  const onPaper = paperRatio >= inkRatio
  const textContrast = onPaper ? paperRatio : inkRatio
  const onColor = onPaper ? PAPER : INK
  const passesText = textContrast >= TEXT_CONTRAST
  const textLevel: ColorScaleStop['textLevel'] = passesText
    ? 'AA'
    : textContrast >= LARGE_TEXT_CONTRAST
      ? 'AA_LARGE'
      : 'FAIL'
  const surfaceContrast = contrastRatio(color, surface)
  return {
    step,
    color,
    onColor,
    textContrast,
    surfaceContrast,
    textLevel,
    passesText,
    passesSurface: surfaceContrast >= SURFACE_CONTRAST,
  }
}

/* ------------------------- 历史文档补齐 ------------------------- */

/** 为缺少 primaryScale 的历史令牌补一条与其主色一致的梯度 */
export function ensurePrimaryScale(tokens: {
  primary: string
  primaryScale?: PrimaryScale
}): PrimaryScale {
  if (tokens.primaryScale && tokens.primaryScale.stops.length === SCALE_STEPS.length) {
    return tokens.primaryScale
  }
  const seed = normalizeSeed(tokens.primary) ?? INITIAL_TOKENS.primary
  return generatePrimaryScale({ seed, surface: PAPER })
}

/** 按档位取值（找不到时回退到种子档） */
export function stopColor(scale: PrimaryScale, step: number): string {
  return scale.stops.find((item) => item.step === step)?.color ?? scale.stops[SEED_STEP_INDEX].color
}
