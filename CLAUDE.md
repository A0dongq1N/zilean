# CLAUDE.md

此文件为在本仓库中协作开发的 AI 助手（Claude Code / Cursor Agent 等）提供上下文与约定。人类开发者也可作为快速入门参考。

## 项目概述

Zilean 是一个 Chrome Manifest V3 浏览器插件：为特定 URL 保存备忘，当用户打开匹配的网页时，备忘以弹幕形式在屏幕上滚动显示。

**核心技术栈**：TypeScript (严格模式) + Vite + `@crxjs/vite-plugin` + `chrome.storage.local`。UI 使用原生 TS + CSS，**不引入 React / UI 框架**，保持包体轻量。

## 常用命令

```bash
npm install          # 安装依赖
npm run dev          # Vite 开发模式，生成 dist/ 供浏览器加载
npm run build        # 生产构建 (先 tsc --noEmit 再 vite build)
npm test             # vitest 单测 (一次性运行)
npm run test:watch   # vitest watch 模式
node scripts/make-icons.mjs   # 重新生成 src/assets/icon-{16,48,128}.png
```

在 Chrome 中加载：`chrome://extensions` → 开启开发者模式 → "加载已解压的扩展程序" → 选择 `dist/` 目录。代码修改后需要重新 `npm run build`（或 `npm run dev` 保持构建），并在扩展管理页点击刷新按钮。

## 架构

### 三个执行上下文

Chrome 扩展天然包含三种独立的 JS 运行环境，数据通过 `chrome.storage.local` 串联：

```
┌──────────────────┐   storage      ┌──────────────────┐
│ content script   │ <──onChanged──>│ chrome.storage   │
│ (每个网页都运行) │                │      .local      │
└──────────────────┘                │  memos, settings │
                                    └──────────────────┘
┌──────────────────┐                         ▲
│ panel / options  │ ────── 读写 ────────────┘
│   (扩展页面)     │
└──────────────────┘
┌──────────────────┐
│ service worker   │ onInstalled 初始化、setPanelBehavior、消息中转
└──────────────────┘
```

**关键原则**：任何上下文修改 storage 后，其它已打开的上下文通过 `chrome.storage.onChanged` 自动刷新；**没有** content ↔ panel 的直连消息机制。新增功能时优先沿用这套数据流。

### 目录结构

```
src/
  shared/          # 三个上下文共享的纯逻辑，不依赖 DOM 和 Chrome 特定 API 之外的东西
    types.ts       # Memo / Settings / BackupFile + DEFAULT_SETTINGS
    storage.ts     # chrome.storage.local 封装: getAll / upsertMemo / subscribe
    match.ts       # URL 匹配四种模式 + suggestPatternForUrl
    match.test.ts  # 已有单测；新增匹配规则必须补测
  content/         # 所有 content script 代码
    index.ts       # 入口：挂 Shadow DOM + 浮动按钮 + 菜单 + 订阅 storage
    danmaku.ts     # DanmakuEngine 类，Web Animations API 驱动
    quick-add.ts   # 页内的快速添加面板 (Shadow DOM 内)
    overlay.css    # Shadow DOM 内联样式 (通过 ?inline 导入)
  ui/              # 跨页面复用的 DOM 组件工厂 (非纯逻辑，故不在 shared/ 下)
    color-field.ts # 预设色块 + 色盘 + 十六进制输入的组合控件
  panel/           # 点击工具栏图标后打开的侧边栏 (chrome.sidePanel)
  options/         # chrome.runtime.openOptionsPage() 打开的全量管理页
  background/      # service worker
  assets/          # 图标 PNG (由 scripts/make-icons.mjs 生成)
manifest.config.ts # @crxjs/vite-plugin 读取的 manifest 定义
```

### 路径别名

- `@shared/*` → `src/shared/*`（纯逻辑）
- `@ui/*` → `src/ui/*`（DOM 组件工厂）

新增别名时 `tsconfig.json` 和 `vite.config.ts` **两处都要改**。

## 关键实现细节（改代码前先读）

### Shadow DOM 隔离

内容脚本在 `document.documentElement` 下挂载一个 `<div id="zilean-root-host">`，`attachShadow({mode:'open'})`。CSS 通过 `import cssText from './overlay.css?inline'` 拿到字符串后注入 `<style>` 标签。**不要**直接用 `<link>` 或把样式注入到主文档 `<head>`，会污染宿主页。

Shadow 内容器规则：
- 底层 `.zl-root`：`position:fixed; inset:0; pointer-events:none; z-index:2147483646;` — 弹幕轨道
- 浮动按钮 `.zl-fab` 和菜单、快速添加面板：`pointer-events:auto` — 只有这些接收事件

### DanmakuEngine (`src/content/danmaku.ts`)

- 通过 `ResizeObserver` 监听视口变化并 `computeLanes()` 重算轨道数，轨高 = `defaultFontSize + 2*LANE_PADDING`
- 每条弹幕：时长 `(viewportW + itemWidth) / speed * 1000` ms，easing `linear`，`element.animate` 返回的 `Animation` 对象存入 `active: Set<Animation>` 以便 `stop()` 批量 cancel
- 调度：每一"轮"(cycle) 遍历乱序后的 memos 列表，按 `lane.freeAt` 最早空闲的轨道安排；本轮结束后若 `loop=true` 通过 `setTimeout` 启动下一轮
- `setMemos()` / `setSettings()` 在运行中被调用时会 `restart()`，避免旧弹幕残留

### URL 匹配 (`src/shared/match.ts`)

四种 `MatchMode` 的语义：
- `exact`：字符串全等（含 query/hash）
- `prefix`：`url.startsWith(pattern)`
- `domain`：`host === pattern || host.endsWith('.' + pattern)`（包含子域）
- `regex`：`new RegExp(pattern).test(url)`，非法正则**静默返回 false**；`filterMemosForUrl` 会把非法正则收集进 `issues` 数组供 options 页显示

新增匹配模式时，务必同步更新：`MatchMode` 类型、`matchUrl` / `filterMemosForUrl` / `suggestPatternForUrl` 三个函数、`MODE_LABEL`（panel.ts + options.ts 各一份）、`src/options/index.html` / `src/panel/index.html` / `src/content/quick-add.ts` 里的 `<select>` 选项、以及 `match.test.ts` 单测。

### 存储约定

- Key 固定两个：`memos`（`Memo[]`）和 `settings`（`Settings`）。**不要**引入新 top-level key；需要新字段就扩展 `Settings`。
- 写入优先走 `src/shared/storage.ts` 的 `upsertMemo` / `removeMemo` / `setSettings`，它们会触发 `onChanged` 供其它上下文刷新。**不要**直接调 `chrome.storage.local.set`（除了 service worker 的初始化场景）。
- 新增 `Settings` 字段时记得更新 `DEFAULT_SETTINGS`（向后兼容）和 options 页的 UI 绑定。

### 备份文件格式

`BackupFile` 有 `app: 'zilean'` 和 `version: 1` 两个校验字段。导入时按 memo `id` 合并，冲突以 `updatedAt` 新者胜。升级备份格式时：提升 `version`、保留读取旧版本的能力、在 `sanitizeMemo` 里兼容。

## 编码约定

- **严格 TS**：`noUnusedLocals` + `noUnusedParameters` 开启，未使用的变量会直接编译失败。
- **不写废话注释**：不要用注释重复描述代码做了什么，只注释"为什么"或非显而易见的约束。
- **不引入 UI 框架**：panel / options 保持手写 DOM；跨页面复用的 DOM 片段放 `src/ui/`，纯数据逻辑放 `src/shared/`。若未来要加复杂交互，先讨论是否真的需要 React，而非直接引入。
- **错误处理**：content script 里所有异步错误要 `.catch()` 吞掉或 `console.warn`，**绝不能让弹幕层异常影响宿主页**。
- **Chrome API 类型**：用 `@types/chrome`，不要 `any`。
- **中文注释和 UI 文案**：本项目主语言是中文，新增面向用户的文案保持中文；代码注释中英文都可以，简洁为要。

## 测试策略

单测集中在 `src/shared/` 下（`match.test.ts` / `color.test.ts`，vitest + jsdom）。新增纯函数逻辑（如匹配、颜色解析、备份合并）要补单测。DOM 相关（DanmakuEngine、panel、options）目前依赖人工在浏览器中验证——如果要加自动化测试，优先选集成度更高的工具（如 Playwright 加载扩展），不要强行给 DanmakuEngine 写脆弱的 jsdom 测试。

测试命令：
```bash
npm test               # 单次运行
npm run test:watch     # 开发时 watch
```

## 常见修改场景速查

| 想做的事 | 改哪里 |
| --- | --- |
| 新增一个 `Settings` 字段 | `shared/types.ts`（含 `DEFAULT_SETTINGS`）→ `options/index.html` + `options.ts` 加控件 → 若影响弹幕，`content/index.ts` 订阅里同步给 `DanmakuEngine` |
| 新增 `Memo` 字段 | `shared/types.ts` → `content/quick-add.ts` 表单 → `panel/panel.ts` 显示 & 内联添加表单 → `options/index.html` + `options.ts` 表格 & 编辑 dialog → `options.ts` 的 `sanitizeMemo`（导入容错） |
| 改弹幕外观 | `content/overlay.css`（Shadow DOM 内样式）+ 可能调 `DanmakuEngine.scheduleMemo` 里的 inline style |
| 改 panel / options 外观 | `panel/panel.css` 或 `options/options.css`，普通 `<link>` 注入，不用 Shadow DOM |
| 新增一种 URL 匹配模式 | 见上文"URL 匹配"那一节的清单 |
| 新增需要 host 权限的功能 | `manifest.config.ts` 的 `permissions` / `host_permissions` → `npm run build` 后 Chrome 会提示重新授权 |
| 新增 service worker 逻辑 | `background/service-worker.ts`；注意 SW 会被浏览器随时终止，**不要存内存状态**，所有持久化走 `chrome.storage` |

## 构建产物布局

`npm run build` 生成的 `dist/` 结构：

- `manifest.json` — @crxjs 基于 `manifest.config.ts` 生成，并把源路径改写成构建后的哈希路径
- `service-worker-loader.js` — @crxjs 生成的 SW 入口加载器
- `src/panel/index.html`、`src/options/index.html` — HTML 入口
- `assets/*.js`、`assets/*.css` — 代码拆分后的 chunk（含内容脚本 loader、色板组件等）
- `src/assets/icon-*.png` — 图标

## 注意事项和陷阱

- **Vite HMR + content script**：@crxjs 对 content script 的 HMR 支持有限，改内容脚本代码后有时需要在扩展管理页手动点刷新。
- **CSP 限制**：MV3 默认 CSP 禁止 `eval` 和 inline script，构建产物已遵守。引入新依赖前确认其不使用 `new Function()`。
- **Shadow DOM 不能使用外部字体**：`overlay.css` 里用系统字体栈。
- **弹幕层 z-index**：用 `2147483646`（`2^31 - 2`）；若遇到被页面遮挡，不要盲目再 +1，先排查是否页面用了 `position: fixed; z-index: 2147483647` 的老黑科技。
- **图标是脚本生成的**：`src/assets/icon-*.png` 不要手工编辑；要换设计改 `scripts/make-icons.mjs` 或直接替换 PNG 文件（同名覆盖）。
- **`@crxjs/vite-plugin` 目前是 beta**：升级时留意 manifest 生成差异（尤其 content script 的资源注入和 `web_accessible_resources` 的自动推断）。
- **Side Panel 行为**：点击工具栏图标打开侧边栏依赖 `chrome.sidePanel.setPanelBehavior({openPanelOnActionClick:true})`，在 service worker 顶层调用即可（不要放到 `onInstalled` 里，SW 被唤醒时也要重新设置才保险——目前代码是模块顶层调用）。侧边栏会跨 tab 保持打开，所以 `panel.ts` 订阅了 `chrome.tabs.onActivated` / `onUpdated` / `chrome.windows.onFocusChanged`；新增跟"当前 tab"相关的面板功能时记得挂类似监听。
- **Chrome 版本要求**：`chrome.sidePanel` API 需要 Chrome 114+ / Edge 114+。低版本浏览器加载扩展会直接报 "Unrecognized manifest key side_panel"。
