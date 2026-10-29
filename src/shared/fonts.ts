/**
 * Font presets for danmaku text.
 *
 * 设计原则：**不打包任何字体文件，只引用系统预装字体名称**。
 * 这样做的好处：
 *   1. 零授权风险：方正 / 微软雅黑 / 华文系列等商用字体的版权由操作系统承担，
 *      我们只在 `font-family` 里引用名字不涉及分发。
 *   2. 零体积：Chrome 扩展安装包不会因中文字体而膨胀（中文字体动辄数 MB）。
 *   3. 跨平台：每种风格都配置了 Win / macOS / Linux 的 fallback，会自动选到
 *      当前系统能用的字体。
 *
 * 存储的 value 是 `key`（稳定标识），渲染时再通过 `resolveFontStack` 还原成
 * 完整字体栈。如果未来想新增开源字体（如思源黑体、霞鹜文楷）并自己打包 @font-face，
 * 只要把对应字体名加到 stack 最前面即可，无需迁移老数据。
 */
export interface FontPreset {
  key: string;
  label: string;
  stack: string;
}

export const FONT_PRESETS: FontPreset[] = [
  {
    key: 'default',
    label: '默认（跟随系统）',
    stack:
      "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', 'Source Han Sans SC', sans-serif",
  },
  {
    key: 'sans',
    label: '黑体 / 无衬线',
    stack:
      "'PingFang SC', 'HarmonyOS Sans SC', 'MiSans', 'Microsoft YaHei', 'Heiti SC', 'Noto Sans CJK SC', 'Source Han Sans SC', sans-serif",
  },
  {
    key: 'serif',
    label: '宋体 / 衬线',
    stack:
      "'Songti SC', 'STSong', 'SimSun', 'Noto Serif CJK SC', 'Source Han Serif SC', Georgia, serif",
  },
  {
    key: 'kaiti',
    label: '楷体 / 书法',
    stack:
      "'Kaiti SC', 'STKaiti', 'KaiTi', 'LXGW WenKai', '霞鹜文楷', cursive",
  },
  {
    key: 'yuanti',
    label: '圆体',
    stack:
      "'PingFang SC', 'Yuanti SC', 'STYuanti', 'HYQiHei 40S', 'Hiragino Sans GB', sans-serif",
  },
  {
    key: 'mono',
    label: '等宽 / 代码风',
    stack:
      "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, 'Source Code Pro', 'Courier New', monospace",
  },
];

export const DEFAULT_FONT_KEY = 'default';

const PRESET_MAP = new Map(FONT_PRESETS.map((p) => [p.key, p]));

/** Look up a preset by its stable key; falls back to the default preset. */
export function getFontPreset(key: string | undefined | null): FontPreset {
  if (key && PRESET_MAP.has(key)) return PRESET_MAP.get(key)!;
  return PRESET_MAP.get(DEFAULT_FONT_KEY)!;
}

/** Resolve a preset key into a ready-to-use `font-family` CSS value. */
export function resolveFontStack(key: string | undefined | null): string {
  return getFontPreset(key).stack;
}
