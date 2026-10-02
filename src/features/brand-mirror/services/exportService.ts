import type { BrandMirrorSnapshot } from '../models/brandMirrorModels'

export interface BrandGuidelinesExporter {
  export(snapshot: BrandMirrorSnapshot): void
}

export function buildBrandGuidelinesMarkdown(snapshot: BrandMirrorSnapshot): string {
  const { tokens } = snapshot
  const scale = tokens.primaryScale
  const scaleRows = scale
    ? scale.stops
        .map((stop) => `| primary.${stop.step} | \`${stop.color}\` | \`${stop.onColor}\` | ${stop.textContrast.toFixed(2)}:1 | ${stop.surfaceContrast.toFixed(2)}:1 | ${stop.textLevel === 'AA' ? '✓ 正文' : stop.textLevel === 'AA_LARGE' ? '仅大字' : '不达标'} |`)
        .join('\n')
    : '- 暂无生成梯度'
  const versions = snapshot.versions.length === 0 ? '- 暂无保存版本' : snapshot.versions.map((version) => `- ${version.label} · ${version.createdAt.slice(0, 10)} · 主色 ${version.tokens.primary} · 辅助色 ${version.tokens.secondary} · 梯度 ${version.tokens.primaryScale ? `${version.tokens.primaryScale.stops.length} 档` : '缺失'}`).join('\n')
  return `# BrandMirror 品牌规范\n\n> 导出时间：${new Date().toISOString().slice(0, 10)}\n> 当前主题：${snapshot.theme}\n\n## 品牌色\n\n| 令牌 | 值 |\n| --- | --- |\n| 主色 \`primary\` | \`${tokens.primary}\` |\n| 辅助色 \`secondary\` | \`${tokens.secondary}\` |\n| 对比度 | ${snapshot.contrastRatio.toFixed(1)}:1 |\n\n## 主色梯度\n\n> 由种子色 \`${scale?.seed ?? tokens.primary}\` 生成，生成时已纳入文字 / 底色可读性约束（正文 ≥ 4.5:1，识别 ≥ 3:1）。\n\n| 令牌 | 色值 | 建议文字色 | 文字对比 | 底色对比 | 可读性 |\n| --- | --- | --- | --- | --- | --- |\n${scaleRows}\n\n## 圆角尺度\n\n${tokens.radiusScale.map((value, index) => `- \`radius.${index + 1}\`: ${value}px`).join('\n')}\n\n## 间距体系\n\n${tokens.spacingScale.map((value, index) => `- \`spacing.${index + 1}\`: ${value}px`).join('\n')}\n\n## 字体比例\n\n${tokens.typeScale.map((value, index) => `- \`type.${index + 1}\`: ${value}px`).join('\n')}\n\n## 保存版本\n\n${versions}\n\n---\n由 BrandMirror 品牌视觉实验室生成。\n`
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
