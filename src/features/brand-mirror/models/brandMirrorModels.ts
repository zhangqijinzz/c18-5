import { SCALE_STOPS } from '../color-scale/scaleGenerator'

export type BrandTheme = 'studio' | 'editorial' | 'night'
export type MirrorStatus = 'loading' | 'ready' | 'editing' | 'error'

/** 应用梯度时允许单独保留 / 覆盖的令牌分区。 */
export type TokenSection = 'primaryScale' | 'primary' | 'secondary' | 'radiusScale' | 'spacingScale' | 'typeScale'

export interface BrandTokens {
  primary: string
  secondary: string
  /** 主色梯度 50–900，共 10 级；为兼容旧数据可选，缺省时按主色现场派生。 */
  primaryScale?: string[]
  radiusScale: number[]
  spacingScale: number[]
  typeScale: number[]
}

export interface SavedVersion {
  id: string
  label: string
  tokens: BrandTokens
  createdAt: string
}

export interface BrandDocument {
  version: 1
  tokens: BrandTokens
  theme: BrandTheme
  versions: SavedVersion[]
  /** 最近一次应用的梯度记录，刷新后仍可回退；草稿不入库。 */
  lastAppliedScale?: PendingScale
}

/** 一次梯度生成的完整记录，用于应用、对比与回退。 */
export interface PendingScale {
  id: string
  seed: string
  scale: string[]
  /** 实际落地的 500 锚点（极端情况下可能被微调）。 */
  anchorHex: string
  anchorAdjusted: boolean
  /** 500 是否达到正文对比；false 时仅建议用于大字号或图形。 */
  anchorBodyPasses: boolean
  /** 各分区是否在本次应用中被覆盖。 */
  sections: Record<TokenSection, boolean>
  /** 应用前的令牌快照，回退时恢复。 */
  previousTokens: BrandTokens
  createdAt: string
}

export interface BrandMirrorSnapshot {
  status: MirrorStatus
  tokens: BrandTokens
  theme: BrandTheme
  versions: SavedVersion[]
  compareMode: boolean
  activeVersionId: string | null
  contrastRatio: number
  contrastWarning: boolean
  message: string
  /** 尚未应用的梯度草稿；应用或丢弃后清空。 */
  pendingScale: PendingScale | null
  /** 最近一次已应用的梯度，保留到下一次编辑前，供一键回退。 */
  lastAppliedScale: PendingScale | null
}

const studioScale = ['#FDECEA', '#FAD4CF', '#F5A89F', '#F08074', '#F15A47', '#DB3E2C', '#B72F22', '#8F251C', '#6B1C16', '#491410']
const editorialScale = ['#E6F4F0', '#C5E6DE', '#94D1C4', '#5FB4A3', '#238B73', '#1C7561', '#175C4E', '#12473D', '#0E3630', '#0A2622']
const nightScale = ['#F0EBFF', '#DFD4FF', '#C4B0FF', '#A98BFF', '#8C63F5', '#7548E8', '#5E36C4', '#472A96', '#32206B', '#211747']

export const INITIAL_TOKENS: BrandTokens = {
  primary: '#F15A47',
  secondary: '#24324A',
  primaryScale: studioScale,
  radiusScale: [8, 12, 18, 28],
  spacingScale: [4, 8, 12, 20, 32],
  typeScale: [12, 14, 16, 20, 28, 40],
}

export const THEME_PRESETS: Record<BrandTheme, { label: string; tokens: BrandTokens }> = {
  studio: {
    label: 'Studio warm',
    tokens: INITIAL_TOKENS,
  },
  editorial: {
    label: 'Editorial green',
    tokens: {
      primary: '#238B73', secondary: '#173C35', primaryScale: editorialScale, radiusScale: [4, 8, 12, 18], spacingScale: [4, 8, 16, 24, 40], typeScale: [12, 14, 16, 22, 30, 44],
    },
  },
  night: {
    label: 'Night signal',
    tokens: {
      primary: '#A98BFF', secondary: '#191829', primaryScale: nightScale, radiusScale: [6, 10, 14, 22], spacingScale: [4, 8, 12, 18, 28], typeScale: [12, 14, 16, 20, 28, 38],
    },
  },
}

export const SCALE_LEVELS = [...SCALE_STOPS]
