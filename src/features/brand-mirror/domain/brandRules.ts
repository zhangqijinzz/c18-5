import type { BrandTheme, BrandTokens, TokenSection } from '../models/brandMirrorModels'
import { INITIAL_TOKENS, SCALE_LEVELS, THEME_PRESETS } from '../models/brandMirrorModels'
import { contrastRatio as scaleContrastRatio, generateColorScale } from '../color-scale/scaleGenerator'

const HEX_COLOR = /^#[0-9A-F]{6}$/i

export function cloneTokens(tokens: BrandTokens): BrandTokens {
  return {
    ...tokens,
    primaryScale: tokens.primaryScale ? [...tokens.primaryScale] : undefined,
    radiusScale: [...tokens.radiusScale],
    spacingScale: [...tokens.spacingScale],
    typeScale: [...tokens.typeScale],
  }
}

export function isHexColor(value: string): boolean {
  return HEX_COLOR.test(value)
}

export function normalizeColor(value: string): string {
  const candidate = value.trim().toUpperCase()
  return isHexColor(candidate) ? candidate : INITIAL_TOKENS.primary
}

export function clampTokenValues(tokens: BrandTokens): BrandTokens {
  return {
    ...cloneTokens(tokens),
    primaryScale: ensurePrimaryScale(tokens),
    radiusScale: tokens.radiusScale.map((value) => Math.min(40, Math.max(0, Math.round(value)))),
    spacingScale: tokens.spacingScale.map((value) => Math.min(64, Math.max(2, Math.round(value)))),
    typeScale: tokens.typeScale.map((value) => Math.min(72, Math.max(10, Math.round(value)))),
  }
}

/** 旧数据没有梯度时，从当前主色现场派生一条，保证界面始终可用。 */
export function ensurePrimaryScale(tokens: BrandTokens): string[] {
  if (tokens.primaryScale && tokens.primaryScale.length === SCALE_LEVELS.length && tokens.primaryScale.every(isHexColor)) {
    return tokens.primaryScale.map((color) => color.toUpperCase())
  }
  const fallback = INITIAL_TOKENS.primaryScale ?? SCALE_LEVELS.map(() => INITIAL_TOKENS.primary)
  return generateColorScale(tokens.primary, { darkInk: tokens.secondary })?.hexes ?? fallback
}

export function validateTokens(tokens: BrandTokens): string | null {
  if (!isHexColor(tokens.primary) || !isHexColor(tokens.secondary)) return '请输入 6 位 HEX 颜色'
  if (tokens.primaryScale && (tokens.primaryScale.length !== SCALE_LEVELS.length || !tokens.primaryScale.every(isHexColor))) return '主色梯度层级不完整'
  if (tokens.radiusScale.length !== 4 || tokens.spacingScale.length !== 5 || tokens.typeScale.length !== 6) return '令牌层级数量不完整'
  if (tokens.typeScale.some((value) => value < 10 || value > 72)) return '字号范围应在 10–72px'
  return null
}

export function contrastRatio(first: string, second: string): number {
  return scaleContrastRatio(first, second)
}

export function themeTokens(theme: BrandTheme): BrandTokens {
  return cloneTokens(THEME_PRESETS[theme].tokens)
}

/**
 * 把生成的梯度按分区合并进现有令牌。
 * 未勾选的分区原样保留，实现「不想被覆盖的部分单独保留」。
 */
export function mergeGeneratedScale(current: BrandTokens, scale: string[], sections: Record<TokenSection, boolean>): BrandTokens {
  const next = cloneTokens(current)
  if (sections.primaryScale) next.primaryScale = [...scale]
  if (sections.primary) next.primary = scale[5]
  if (sections.secondary) next.secondary = scale[9]
  // 尺度类分区默认保留；即便未来允许扩展，这里也只覆盖明确勾选的部分。
  if (sections.radiusScale) next.radiusScale = [...current.radiusScale]
  if (sections.spacingScale) next.spacingScale = [...current.spacingScale]
  if (sections.typeScale) next.typeScale = [...current.typeScale]
  return next
}
