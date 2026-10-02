import { ensurePrimaryScale } from '../domain/brandRules'
import { contrastRatio, recommendInk, SCALE_STOPS } from '../color-scale/scaleGenerator'
import type { BrandMirrorSnapshot } from '../models/brandMirrorModels'

export interface BrandGuidelinesExporter {
  export(snapshot: BrandMirrorSnapshot): void
}

export function buildBrandGuidelinesMarkdown(snapshot: BrandMirrorSnapshot): string {
  const { tokens } = snapshot
  const scale = ensurePrimaryScale(tokens)
  const scaleRows = scale
    .map((hex, index) => {
      const stop = SCALE_STOPS[index]
      const onInk = recommendInk(hex, tokens.secondary)
      const ratio = contrastRatio(hex, onInk).toFixed(1)
      return `| primary-${stop} | \`${hex}\` | \`${onInk}\` | ${ratio}:1 |`
    })
    .join('\n')
  const versions = snapshot.versions.length === 0 ? '- 暂无保存版本' : snapshot.versions.map((version) => `- ${version.label} · ${version.createdAt.slice(0, 10)} · 主色 ${version.tokens.primary} · 辅助色 ${version.tokens.secondary}`).join('\n')
  const applied = snapshot.lastAppliedScale
  const appliedNote = applied ? `\n> 当前梯度由种子色 ${applied.seed} 生成${applied.anchorAdjusted ? `，500 锚点微调为 ${applied.anchorHex}` : ''}\n` : ''
  return `# BrandMirror 品牌规范\n\n> 导出时间：${new Date().toISOString().slice(0, 10)}\n> 当前主题：${snapshot.theme}\n${appliedNote}\n## 品牌色\n\n| 令牌 | 值 |\n| --- | --- |\n| 主色 \`primary\` | \`${tokens.primary}\` |\n| 辅助色 \`secondary\` | \`${tokens.secondary}\` |\n| 主辅对比度 | ${snapshot.contrastRatio.toFixed(1)}:1 |\n\n## 主色梯度（50–900）\n\n「文字色」为压在该色阶上推荐的墨色，对比度均按 WCAG 相对亮度计算。\n\n| 令牌 | 色值 | 推荐文字色 | 对比度 |\n| --- | --- | --- | --- |\n${scaleRows}\n\n## 圆角尺度\n\n${tokens.radiusScale.map((value, index) => `- \`radius.${index + 1}\`: ${value}px`).join('\n')}\n\n## 间距体系\n\n${tokens.spacingScale.map((value, index) => `- \`spacing.${index + 1}\`: ${value}px`).join('\n')}\n\n## 字体比例\n\n${tokens.typeScale.map((value, index) => `- \`type.${index + 1}\`: ${value}px`).join('\n')}\n\n## 保存版本\n\n${versions}\n\n---\n由 BrandMirror 品牌视觉实验室生成。\n`
}

export class BrowserBrandGuidelinesExporter implements BrandGuidelinesExporter {
  export(snapshot: BrandMirrorSnapshot): void {
    const content = buildBrandGuidelinesMarkdown(snapshot)
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `BrandMirror-Brand-Guidelines-${new Date().toISOString().slice(0, 10)}.md`
    link.click()
    URL.revokeObjectURL(url)
  }
}
