# Zilean DESIGN.md

Zilean 的视觉契约。改 UI 前先读本文；颜色、字号、间距、圆角、阴影只使用这里的 token，不要另起一套。

产品是 Chrome 扩展，不是网站。侧栏是「当前页的笔记」，不是设置后台。页边图标打开侧栏；划选出现短工具条；显示/循环收到页头图标里；重复页只在真有重复时冒一条。视觉克制：冷白、紫色、少边框、靠字重和留白。不要设置卡、不要复选框列表。

## Interaction

1. 每个网页右侧（可拖到左侧）贴一个圆形页边图标。空闲时收进边框一半；悬停展开。点击打开或关闭 Chrome 侧栏，**不要再弹出页内菜单**。
2. 工具栏图标和快捷键 `Alt+Z` 同样打开侧栏。
3. 在页面上划选文本后，选区上方出现短工具条：钉住 / 飘过 / 打开。输入框内的划选忽略。
4. 侧栏只服务当前页：顶栏是页面标题。默认是时光轴，按备忘写下的时间排节点；没有备忘时用示例节点，不写入本地。滑块和「时钟回溯」只把这一页的弹幕收到那个时刻，网页没有快照，倒不回当时的页面。切到「本页笔记」才是列表和搜索。底部是输入框。显示弹幕、循环是顶栏图标。重复页用横幅，点开才是处理层。
5. 点一条备忘即在底部编辑，不要用 `prompt`。
6. 写备忘可以说话：点麦克风开始听，字进输入框，再点一下停。用系统语音识别，不要另接服务。
7. 备忘可以钉在页面元素上。进入点选后像审查元素一样悬停高亮，点一下钉住；之后鼠标移到该元素就提示备忘，不再当弹幕。
8. 打开已有备忘的网页时，右上角轻提示「这一页有 N 条备忘」，可打开侧栏。同一地址在这个标签里只出现一次，几秒后自己消失。弹幕照常飘，提示不代替弹幕。

## Surfaces

| 表面 | 主题 | 文件 |
| --- | --- | --- |
| 侧边栏 | Light | `src/panel/` |
| 管理页 | Light | `src/options/` |
| 页内快速添加 / 重复页浮层 | Light | `src/content/quick-add.ts`, `duplicates-overlay.ts` |
| 浮动按钮 / 菜单 / 通知弹幕 | Chrome（深色半透明） | `src/content/overlay.css` |
| 普通备忘弹幕 | 用户色 + 描边阴影 | `src/content/danmaku.ts` |

Light 给扩展自己的页面和页内表单，冷白底。页内划选工具条可以轻微毛玻璃；侧栏本身不要整页玻璃拟态。Chrome 色只给 FAB / 通知弹幕。

Token 源文件：`src/ui/tokens.css`。CSS 用 `var(--zl-*)`，不要把 hex 再写进组件样式。

## Color

### Light

| Token | 值 | 用途 |
| --- | --- | --- |
| `--zl-bg` | `#ffffff` | 侧栏、卡片 |
| `--zl-bg-page` | `#f6f7fb` | 管理页底 |
| `--zl-bg-muted` | `#f4f5f8` | 输入框、composer |
| `--zl-bg-subtle` | `#ebeef3` | hover |
| `--zl-bg-selected` | `#f3f0ff` | 当前 tab / 选中行 |
| `--zl-text` | `#111827` | 主文案 |
| `--zl-text-secondary` | `#374151` | 次文案 |
| `--zl-text-muted` | `#6b7280` | 标签 |
| `--zl-text-faint` | `#9ca3af` | 空状态、placeholder |
| `--zl-text-on-accent` | `#ffffff` | 主按钮字 |
| `--zl-border` | `rgba(17, 24, 39, 0.08)` | 发丝分割线 |
| `--zl-accent` | `#6d5cff` | 主色，对齐 Sider |
| `--zl-accent-hover` | `#5b4be8` | hover |
| `--zl-accent-soft` | `#f1eeff` | 浅底强调 |
| `--zl-grad-mark` | `#8b7dff → #6d5cff` | Logo / 页边图标 |
| `--zl-toggle-track` | `#e5e7eb` | iOS 开关未选中 |
| `--zl-badge-bg` | `#f1eeff` | 匹配模式徽标底 |
| `--zl-badge-text` | `#5b4be8` | 匹配模式徽标字 |
| `--zl-danger-bg` | `#fef2f2` | 危险按钮底 |
| `--zl-danger-bg-hover` | `#fee2e2` | 危险 hover |
| `--zl-danger-text` | `#dc2626` | 危险字 |
| `--zl-danger-text-strong` | `#b91c1c` | 警告条文字 |
| `--zl-danger-border` | `#fecaca` | 警告条边 |

### Chrome（页内控件）

| Token | 值 | 用途 |
| --- | --- | --- |
| `--zl-chrome-bg` | `#6d5cff` | FAB |
| `--zl-chrome-bg-solid` | `rgba(255, 255, 255, 0.92)` | 玻璃底 |
| `--zl-chrome-text` | `#ffffff` | FAB 字 |
| `--zl-chrome-border` | `rgba(255, 255, 255, 0.85)` | 描边 |
| `--zl-chrome-hover` | `#f4f5f8` | hover |
| `--zl-chrome-shadow` | `0 8px 20px rgba(109, 92, 255, 0.32)` | FAB 阴影 |
| `--zl-notice-bg` | `rgba(109, 92, 255, 0.94)` | 重复页通知 |
| `--zl-notice-border` | `rgba(196, 181, 253, 0.9)` | 通知描边 |

弹幕正文颜色来自备忘 / 设置，不是 UI token。弹幕必须保留深色文字阴影，才能压在浅色网页上。

### 弹幕预设色（给用户选，不是 chrome 用色）

`#ffffff` `#000000` `#ef4444` `#f97316` `#eab308` `#22c55e` `#06b6d4` `#3b82f6` `#a855f7` `#ec4899`

定义在 `src/shared/color.ts`。新增预设必须同步那边和本表。

## Typography

- UI 字体：`--zl-font` = 系统栈 `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif`
- 等宽：`--zl-font-mono` = `ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`（URL、匹配串、hex）
- 弹幕字体走 `@shared/fonts` 的 preset，不在这里另开 WebFont
- 不要引入外部字体文件；Shadow DOM 也无法稳定加载它们

| Token | 值 | 用途 |
| --- | --- | --- |
| `--zl-text-xs` | `10px` | 大写标签、模式徽标 |
| `--zl-text-sm` | `11px` | 元信息、小按钮 |
| `--zl-text-md` | `12px` | 次按钮、表单标签 |
| `--zl-text-base` | `13px` | 默认正文 |
| `--zl-text-lg` | `15px` | 卡片标题 |
| `--zl-text-xl` | `16px` | 侧边栏标题、对话框标题 |
| `--zl-text-2xl` | `22px` | 管理页 H1 |

字重：正文 400/500，标题 600/700。Section 标题用 11px uppercase + `0.8px` letter-spacing。

## Spacing

4 / 6 / 8 / 10 / 12 / 14 / 16 / 18 / 20 / 24。优先偶数；6 和 10 只用于控件内部。

| Token | 值 |
| --- | --- |
| `--zl-space-1` | `4px` |
| `--zl-space-2` | `6px` |
| `--zl-space-3` | `8px` |
| `--zl-space-4` | `10px` |
| `--zl-space-5` | `12px` |
| `--zl-space-6` | `14px` |
| `--zl-space-7` | `16px` |
| `--zl-space-8` | `18px` |
| `--zl-space-9` | `20px` |
| `--zl-space-10` | `24px` |

侧边栏水平 padding 16px。管理页主栏 `max-width: 1180px`，页边 24px。

## Radius

| Token | 值 | 用途 |
| --- | --- | --- |
| `--zl-radius-sm` | `8px` | 输入、小按钮 |
| `--zl-radius-md` | `10px` | 列表卡 |
| `--zl-radius-lg` | `12px` | 设置分组、管理页卡片 |
| `--zl-radius-xl` | `16px` | composer |
| `--zl-radius-2xl` | `20px` | 少用 |
| `--zl-radius-full` | `999px` | 开关、圆形发送钮、FAB |

## Elevation

| Token | 值 | 用途 |
| --- | --- | --- |
| `--zl-shadow-sm` | `0 1px 2px rgba(17, 24, 39, 0.04)` | 轻阴影 |
| `--zl-shadow-md` | `0 8px 24px rgba(17, 24, 39, 0.08)` | 浮层 |
| `--zl-shadow-lg` | `0 16px 40px rgba(17, 24, 39, 0.12)` | 对话框 |
| `--zl-shadow-chrome` | `0 8px 24px rgba(17, 24, 39, 0.12)` | 页内菜单 |

不要给侧边栏卡片加厚阴影，窄栏里会脏。

## Motion

Token：`--zl-duration-press` `0.08s`、`--zl-duration-fast` `0.15s`、`--zl-duration` `0.18s`、`--zl-duration-enter` `0.28s`，曲线 `--zl-ease` / `--zl-ease-out`（顺滑减速，不是弹跳）。按下用 press（干脆），松开用 ease-out（回弹感靠曲线，不要 bounce）。

- 可点控件：hover 改底色/字色，图标钮可 `scale(1.04–1.06)`；`:active` `scale(0.92–0.96)` 且 `transition-duration` 切到 press
- 主按钮、发送钮：hover 轻微上浮 `translateY(-1px)` + 阴影，按下收回
- 列表行：hover `translateY(-1px)`，按下轻微压缩
- 开关打开：一次 `zl-on`（`just-on`），不要循环
- 浮层、表单、横幅出现：`0.28s` opacity + `8px` 上移（`zl-rise` / `zl-pop`）
- 页内划选工具条、重复页浮层用 visibility + transform，不要 `display` 硬切
- 语音听写中：麦克风用慢一圈的呼吸阴影，不是闪烁
- 点选元素：高亮框用 `zl-pick-pulse` 慢呼吸；提示用 `zl-hint-in`
- 弹幕滚动必须 `linear`，由 `DanmakuEngine` 按时长计算，不要改成 ease
- FAB 拖动时 `transition: none`
- 尊重 `prefers-reduced-motion`（token 时长收成近 0）
- 不使用弹跳、闪烁、页面级骨架屏、涟漪水波

## Components

### Button

- Primary：`--zl-accent` 底，`--zl-text-on-accent` 字，hover `--zl-accent-hover`
- Secondary：浅底 + `--zl-border`，hover `--zl-bg-subtle`
- Danger：默认次按钮；hover 才切 `--zl-danger-*`
- Mini：胶囊，`--zl-accent-soft` 底 + `--zl-accent` 字
- Link：无边框，`--zl-accent`，hover 下划线
- 禁用：`opacity: 0.5` + `not-allowed`

### Input / Select / Textarea

- 白底、`--zl-border-strong`、`--zl-radius-sm`、padding `7px 10px`
- Focus：边框 `--zl-accent` + `0 0 0 3px var(--zl-accent-ring)`
- Checkbox：`accent-color: var(--zl-accent)`
- 标签在上，`--zl-text-muted` / `--zl-text-md` / weight 500

### Card / List row

- 白或 `--zl-bg-muted` 底，`--zl-border`，`--zl-radius-lg` 或 `--zl-radius-xl`
- 当前项：`--zl-bg-selected` + `--zl-border-selected`

### Badge

- 模式徽标：`--zl-badge-bg` / `--zl-badge-text`，胶囊
- 计数：`--zl-bg-subtle` / `--zl-text-secondary`
- 「当前页」：`--zl-accent-soft` / `--zl-accent-hover`

### Overlay / Dialog

- 页内 Light 浮层：白底、`--zl-radius-xl`、`--zl-shadow-md`，宽 320–360px
- 对话框：`--zl-radius-2xl`、`--zl-shadow-lg`，backdrop `rgba(15, 23, 42, 0.4)`
- z-index 用 `2147483647`，不要再加

### FAB

- 40×40 圆，Chrome 色
- 可拖、贴边收起；收起位移 `--zl-fab-tuck: 38px`
- 菜单和浮层跟随按钮，不要写死右下角

## States

每个可交互控件至少覆盖：default / hover / focus-visible / disabled。  
列表还要：empty（居中、`--zl-text-faint`）、selected / current、danger hover。  
警告条：`--zl-danger-bg` + `--zl-danger-text-strong`。  
不要只做 hover 不做键盘焦点。

## Layout

- 侧边栏：顶栏 / 可选重复横幅 / 本页搜索 / 笔记列表 / 底部输入，`min-width: 260px`
- 管理页：全部笔记（指标、筛选、卡片 + 右侧档案）、重复标签页、插件设置。没有备忘或没有重复页时用标明「示例」的假数据撑开版式，示例不写入 `chrome.storage`，除非用户点「收成我的备忘」
- 页内控件：`pointer-events: none` 铺满，只有 FAB / 菜单 / 表单 / 浮层 `auto`
- 内容脚本样式只进 Shadow DOM，禁止写进宿主 `<head>`

## Accessibility

- 可点击目标不小于约 24px；FAB 保持 40px
- 焦点环用 token，不要 `outline: none` 后不补
- 空状态、错误、禁用要有文字，不只靠颜色
- 中文文案；`lang="zh-CN"`

## Do

- 先复用 `src/ui/color-field.ts`、`font-field.ts` 和现有按钮 / 卡片 class
- 新 Settings / Memo 字段跟现有表单密度走
- 页内深色只用于 FAB / 菜单 / 通知弹幕

## Don't

- 不要引入 React / UI 框架 / Tailwind / 外部字体
- 不要新造主色、渐变、玻璃拟态、大圆角营销卡
- 不要把弹幕字号 / 颜色硬编码进 chrome token
- 不要为了「更好看」提高弹幕层 z-index
- 不要把 Light 浮层改成深色来「统一」FAB
