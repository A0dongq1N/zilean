# Zilean

一个 Chrome (Manifest V3) 浏览器插件：为指定的 URL 保存备忘，打开匹配页面时以弹幕形式滚动显示。

## 功能

- URL 绑定备忘，支持四种匹配模式：
  - `exact`：完整 URL 精确匹配（含 query/hash）
  - `prefix`：URL 前缀
  - `domain`：按域名匹配（包含子域）
  - `regex`：正则匹配
- Shadow DOM 弹幕层，样式不影响宿主页；分轨滚动，避免重叠
- 全局设置：默认显示、循环播放、默认颜色、字号、速度
- 单条备忘可单独覆盖颜色 / 字号 / 速度
- 页面右下角悬浮按钮，可快速：
  - 显示 / 隐藏弹幕
  - 切换循环播放
  - 在当前页快速添加备忘
  - 打开完整管理页
- 侧边栏 (Side Panel) 展示"当前页命中的备忘"，含启用、编辑、删除、内联添加（含预设色块 + 色盘 + 十六进制三种方式选色）；跨 tab 切换自动刷新
- Options 管理页：全量表格、全局设置、JSON 导入 / 导出备份

## 开发

```bash
npm install
npm run dev       # Vite 开发模式 (加载 dist/ 到浏览器)
npm run build     # 生产构建
npm test          # 单元测试 (vitest)
```

开发时，在 Chrome 中打开 `chrome://extensions` → 开启"开发者模式" → 点击"加载已解压的扩展程序" → 选择本项目根目录下 `dist/` 文件夹（或 `npm run dev` 后 Vite 生成的 `dist/`）。

## 项目结构

```
src/
  background/service-worker.ts   # onInstalled 初始化 + setPanelBehavior + 消息中转
  content/
    index.ts                     # 内容脚本入口：挂 Shadow DOM、浮动按钮、菜单
    danmaku.ts                   # 弹幕引擎 (分轨 + Web Animations API)
    quick-add.ts                 # 页面内"快速添加"面板
    overlay.css                  # Shadow DOM 样式 (内联注入)
  ui/color-field.ts              # 预设色块 + 色盘 + 十六进制输入的组合控件工厂
  panel/                         # 工具栏图标点击后打开的侧边栏 (chrome.sidePanel)
  options/                       # 完整管理页 + 导入/导出
  shared/
    types.ts                     # Memo / Settings / BackupFile 类型
    storage.ts                   # chrome.storage.local 封装 + onChanged 订阅
    match.ts                     # URL 匹配 + 建议 pattern 逻辑
    color.ts                     # 颜色预设 + 十六进制标准化
    *.test.ts                    # vitest 单测
  assets/                        # 自动生成的图标 PNG
manifest.config.ts               # 由 @crxjs/vite-plugin 读取
scripts/make-icons.mjs           # 生成 16/48/128 图标
vite.config.ts
```

## 数据存储

全部存入 `chrome.storage.local`：

- `memos`: `Memo[]`
- `settings`: `Settings`

导出的备份结构：

```jsonc
{
  "app": "zilean",
  "version": 1,
  "exportedAt": 1700000000000,
  "memos": [...],
  "settings": { ... }
}
```

导入按 `id` 合并，`updatedAt` 新者胜出。

## 行为说明

- 打开任意页面时，content script 读取全部 memo 并按当前 URL 过滤。
- 若命中 >0 条且"默认显示"开启，则自动开始播放；`loop = true` 时结束一轮后立即播下一轮。
- 任意标签页修改备忘或设置后，其他标签页通过 `chrome.storage.onChanged` 实时刷新弹幕内容。

## 图标

`scripts/make-icons.mjs` 直接输出纯色 + 三点图形的 PNG。若要替换为自定义设计，覆盖 `src/assets/icon-{16,48,128}.png` 即可。
