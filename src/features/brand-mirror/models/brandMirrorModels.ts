export type BrandTheme = 'studio' | 'editorial' | 'night'
export type MirrorStatus = 'loading' | 'ready' | 'editing' | 'error'

/** 主色梯度上的一档（50–900），并携带可读性约束结果 */
export interface ColorScaleStop {
  /** 梯度档位：50 / 100 / 200 … 900 */
  step: number
  /** 档位色值（6 位 HEX，大写） */
  color: string
  /** 建议压在该档位上的文字色（黑墨或白纸） */
  onColor: string
  /** 与建议文字色的对比度 */
  textContrast: number
  /** 与底色（surface）的对比度 */
  surfaceContrast: number
  /** 文字可读性等级：AA 正文 / AA_LARGE 仅限大字 / FAIL */
  textLevel: 'AA' | 'AA_LARGE' | 'FAIL'
  /** 是否满足正文对比度（≥ 4.5:1） */
  passesText: boolean
  /** 是否满足与底色的识别对比（≥ 3:1） */
  passesSurface: boolean
}

/** 由种子色生成的整条主色梯度 */
export interface PrimaryScale {
  /** 种子色（锚定在 500 档） */
  seed: string
  /** 从浅到深的 10 个档位 */
  stops: ColorScaleStop[]
}

export interface BrandTokens {
  primary: string
  secondary: string
  radiusScale: number[]
  spacingScale: number[]
  typeScale: number[]
  /** 主色梯度；历史文档可能缺失，读取时由领域层补齐 */
  primaryScale?: PrimaryScale
}

export interface SavedVersion {
  id: string
  label: string
  tokens: BrandTokens
  createdAt: string
}

/** 应用色板前留下的令牌检查点，用于整体退回 */
export interface TokenCheckpoint {
  tokens: BrandTokens
  theme: BrandTheme
  label: string
  createdAt: string
}

/** 生成后、应用前的色板草稿 */
export interface PaletteDraft {
  seed: string
  /** 生成时参考的底色 */
  surface: string
  generatedAt: string
  stops: ColorScaleStop[]
  /** 未达正文对比度的档位（通常只可能是被锚定的 500 种子档） */
  failingTextSteps: number[]
  /** 与底色对比不足的档位（浅色 tint 用于装饰底色时会出现） */
  failingSurfaceSteps: number[]
}

/** 应用色板时选择覆盖 / 保留的部分 */
export interface PaletteApplyTargets {
  /** 用种子色（500）覆盖当前主色 primary */
  replacePrimary: boolean
  /** 用 900 档覆盖当前辅助色 secondary */
  replaceSecondary: boolean
}

export interface BrandDocument {
  version: 1
  tokens: BrandTokens
  theme: BrandTheme
  versions: SavedVersion[]
  checkpoint?: TokenCheckpoint
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
  /** 待应用的色板草稿（生成后、应用前） */
  paletteDraft: PaletteDraft | null
  /** 上一次应用色板前的令牌检查点，存在时可一键退回 */
  checkpoint: TokenCheckpoint | null
}

export const INITIAL_TOKENS: BrandTokens = {
  primary: '#F15A47',
  secondary: '#24324A',
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
      primary: '#238B73', secondary: '#173C35', radiusScale: [4, 8, 12, 18], spacingScale: [4, 8, 16, 24, 40], typeScale: [12, 14, 16, 22, 30, 44],
    },
  },
  night: {
    label: 'Night signal',
    tokens: {
      primary: '#A98BFF', secondary: '#191829', radiusScale: [6, 10, 14, 22], spacingScale: [4, 8, 12, 18, 28], typeScale: [12, 14, 16, 20, 28, 38],
    },
  },
}
