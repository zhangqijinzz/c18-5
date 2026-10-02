import type { BrandTheme, BrandTokens } from '../models/brandMirrorModels'
import { INITIAL_TOKENS, THEME_PRESETS } from '../models/brandMirrorModels'
import { ensurePrimaryScale } from './paletteGenerator'

const HEX_COLOR = /^#[0-9A-F]{6}$/i

export function cloneTokens(tokens: BrandTokens): BrandTokens {
  return {
    ...tokens,
    radiusScale: [...tokens.radiusScale],
    spacingScale: [...tokens.spacingScale],
    typeScale: [...tokens.typeScale],
    primaryScale: tokens.primaryScale
      ? { seed: tokens.primaryScale.seed, stops: tokens.primaryScale.stops.map((stop) => ({ ...stop })) }
      : undefined,
  }
}

/** 补齐历史令牌缺失的主色梯度，归一化为运行时完整结构 */
export function normalizeTokens(tokens: BrandTokens): BrandTokens {
  const cloned = cloneTokens(tokens)
  return { ...cloned, primaryScale: ensurePrimaryScale(cloned) }
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
    radiusScale: tokens.radiusScale.map((value) => Math.min(40, Math.max(0, Math.round(value)))),
    spacingScale: tokens.spacingScale.map((value) => Math.min(64, Math.max(2, Math.round(value)))),
    typeScale: tokens.typeScale.map((value) => Math.min(72, Math.max(10, Math.round(value)))),
  }
}

export function validateTokens(tokens: BrandTokens): string | null {
  if (!isHexColor(tokens.primary) || !isHexColor(tokens.secondary)) return '请输入 6 位 HEX 颜色'
  if (tokens.radiusScale.length !== 4 || tokens.spacingScale.length !== 5 || tokens.typeScale.length !== 6) return '令牌层级数量不完整'
  if (tokens.typeScale.some((value) => value < 10 || value > 72)) return '字号范围应在 10–72px'
  if (tokens.primaryScale && (tokens.primaryScale.stops.length !== 10 || tokens.primaryScale.stops.some((stop) => !isHexColor(stop.color)))) return '主色梯度档位不完整'
  return null
}

export { contrastRatio } from './paletteGenerator'

export function themeTokens(theme: BrandTheme): BrandTokens {
  return cloneTokens(THEME_PRESETS[theme].tokens)
}
