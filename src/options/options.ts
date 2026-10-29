import { pickDuplicateIdsToClose, type DuplicateGroup } from '@shared/duplicates';
import { filterMemosForUrl } from '@shared/match';
import { sendRuntimeMessage, type DuplicateSnapshotResponse } from '@shared/messages';
import {
  createId,
  getAll,
  removeMemo,
  setMemos,
  setSettings,
  subscribe,
  upsertMemo,
} from '@shared/storage';
import { DEFAULT_SETTINGS, type BackupFile, type MatchMode, type Memo, type Settings } from '@shared/types';
import { createColorField, type ColorField } from '@ui/color-field';
import { createFontField, type FontField } from '@ui/font-field';
import { createVoiceField, type VoiceField } from '@ui/voice-field';

const MODE_LABEL: Record<MatchMode, string> = {
  exact: '精确',
  prefix: '前缀',
  domain: '域名',
  regex: '正则',
};

type NotesView = 'notes' | 'dups' | 'settings';
type KindFilter = 'all' | 'float' | 'pin' | 'shot' | 'video';
type NoteKind = Exclude<KindFilter, 'all'>;

interface NoteView {
  memo: Memo;
  sample: boolean;
  kind: NoteKind;
  title: string;
  quote: string;
  note: string;
  tags: string[];
  badge: string;
  tone: 'ok' | 'bad' | 'neutral';
}

let currentMemos: Memo[] = [];
let currentSettings: Settings | null = null;
let notesView: NotesView = 'notes';
let kindFilter: KindFilter = 'all';
let domainFilter = '';
let memoQuery = '';
let selectedMemoId = '';
let duplicateGroups: DuplicateGroup[] = [];
let editorColorField: ColorField | null = null;
let editorFontField: FontField | null = null;
let editorVoice: VoiceField | null = null;
let settingsFontField: FontField | null = null;

async function refresh(): Promise<void> {
  const { memos, settings } = await getAll();
  currentMemos = memos;
  currentSettings = settings;
  renderSettings(settings);
  renderMemoList();
  if (notesView === 'dups') renderDuplicates();
}

function renderSettings(settings: Settings): void {
  (document.getElementById('set-visible') as HTMLInputElement).checked = settings.visibleByDefault;
  (document.getElementById('set-loop') as HTMLInputElement).checked = settings.loop;
  (document.getElementById('set-duplicates') as HTMLInputElement).checked =
    settings.duplicateDetection;
  (document.getElementById('set-fab-autohide') as HTMLInputElement).checked = settings.fabAutoHide;
  (document.getElementById('set-color') as HTMLInputElement).value = settings.defaultColor;
  (document.getElementById('set-size') as HTMLInputElement).value = String(settings.defaultFontSize);
  settingsFontField?.setValue(settings.defaultFontFamily);
  chrome.storage.local.getBytesInUse?.(null, (bytes) => {
    const label = document.getElementById('storage-bytes');
    const bar = document.getElementById('storage-bar');
    if (!label || !bar) return;
    const mb = bytes / (1024 * 1024);
    label.textContent = mb < 1 ? `${(bytes / 1024).toFixed(1)} KB / 10 MB` : `${mb.toFixed(2)} MB / 10 MB`;
    bar.style.width = `${Math.min(100, (bytes / (10 * 1024 * 1024)) * 100)}%`;
  });
}

function renderMemoList(): void {
  const list = document.getElementById('memo-list')!;
  const issuesEl = document.getElementById('issues')!;
  const sampleNote = document.getElementById('sample-note')!;
  list.replaceChildren();

  const bundle = collectViews();
  const usingSamples = bundle.sample;
  const source = bundle.views;
  sampleNote.hidden = !usingSamples;
  sampleNote.textContent = bundle.note;

  const { issues } = filterMemosForUrl(currentMemos, 'https://example.com/');
  if (issues.length > 0) {
    issuesEl.hidden = false;
    issuesEl.textContent = `检测到 ${issues.length} 条非法正则: ${issues
      .map((i) => i.memoId)
      .join(', ')}`;
  } else {
    issuesEl.hidden = true;
    issuesEl.textContent = '';
  }

  renderMetrics(source, usingSamples);
  renderDomainChips(source.map((view) => view.memo));
  renderLegend(source);

  const q = memoQuery.trim().toLowerCase();
  const filtered = source
    .filter((view) => {
      if (domainFilter && hostOf(view.memo.pattern) !== domainFilter) return false;
      if (!q) return true;
      const hay = `${view.title} ${view.quote} ${view.note} ${view.memo.pattern}`.toLowerCase();
      return hay.includes(q);
    })
    .sort((a, b) => b.memo.updatedAt - a.memo.updatedAt);

  if (!filtered.some((view) => view.memo.id === selectedMemoId)) {
    selectedMemoId = filtered[0]?.memo.id ?? '';
  }

  if (filtered.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'empty';
    empty.textContent = '没有符合的备忘。';
    list.appendChild(empty);
  } else {
    for (const view of filtered) {
      list.appendChild(renderNoteCard(view));
    }
  }

  renderDetail(filtered.find((view) => view.memo.id === selectedMemoId));
}

function renderNoteCard(view: NoteView): HTMLElement {
  const { memo } = view;
  const card = document.createElement('article');
  card.className = 'note-card' + (memo.id === selectedMemoId ? ' selected' : '');
  card.addEventListener('click', () => {
    selectedMemoId = memo.id;
    renderMemoList();
  });

  const rail = document.createElement('div');
  rail.className = 'note-rail';
  rail.style.background = memo.color && !/^#fff(?:fff)?$/i.test(memo.color) ? memo.color : 'var(--zl-accent)';

  const body = document.createElement('div');
  body.className = 'note-body';

  const head = document.createElement('div');
  head.className = 'note-head';
  const titles = document.createElement('div');
  titles.className = 'note-titles';
  const h = document.createElement('h3');
  h.textContent = view.title;
  const url = document.createElement('div');
  url.className = 'note-url';
  url.textContent = memo.pattern;
  titles.append(h, url);
  const meta = document.createElement('div');
  meta.className = 'note-meta';
  const pill = document.createElement('span');
  pill.className = `pill ${view.tone}`;
  pill.textContent = view.badge;
  const time = document.createElement('time');
  time.textContent = formatAgo(memo.updatedAt);
  meta.append(pill, time);
  head.append(titles, meta);

  const quote = document.createElement('blockquote');
  quote.className = 'note-quote';
  quote.style.borderColor = rail.style.background;
  quote.textContent = view.quote;

  const comment = document.createElement('p');
  comment.className = 'note-comment';
  comment.textContent = view.note;

  const foot = document.createElement('div');
  foot.className = 'note-foot';
  foot.addEventListener('click', (event) => event.stopPropagation());
  const tags = document.createElement('div');
  tags.className = 'note-tags';
  for (const tag of view.tags) {
    const chip = document.createElement('span');
    chip.textContent = tag;
    tags.appendChild(chip);
  }
  const edit = document.createElement('button');
  edit.type = 'button';
  edit.className = 'btn primary';
  edit.textContent = view.sample ? '收成我的备忘' : '编辑';
  edit.addEventListener('click', () => openEditor(memo, view.sample));
  foot.append(tags, edit);

  body.append(head, quote, comment, foot);
  card.append(rail, body);
  return card;
}

function viewFromMemo(memo: Memo, sample: boolean): NoteView {
  const kind: NoteKind = memo.selector ? 'pin' : 'float';
  const title = memo.text.length > 36 ? `${memo.text.slice(0, 36)}…` : memo.text;
  return {
    memo,
    sample,
    kind,
    title,
    quote: memo.text,
    note: memo.selector ? `钉在 ${memo.elementLabel || memo.selector} 上，鼠标移过去才会出现。` : '打开匹配页面时，这句话会从一侧飘过。',
    tags: [`#${MODE_LABEL[memo.matchMode]}`],
    badge: memo.selector ? '钉在元素上' : '飘过',
    tone: memo.enabled ? 'ok' : 'neutral',
  };
}

function sampleViews(): NoteView[] {
  const now = Date.now();
  const base = (partial: Memo, extra: Omit<NoteView, 'memo' | 'sample'>): NoteView => ({
    memo: partial,
    sample: true,
    ...extra,
  });
  return [
    base(
      {
        id: 'sample-float',
        pattern: 'github.com/reactjs/rfcs/pull/229',
        matchMode: 'prefix',
        text: 'useOptimistic 可以在异步 Action 期间先画出乐观结果，请求失败再滚回去。',
        color: '#f59e0b',
        enabled: true,
        createdAt: now - 10 * 60 * 1000,
        updatedAt: now - 10 * 60 * 1000,
      },
      {
        kind: 'float',
        title: 'React 19 Actions 与乐观更新',
        quote: 'useOptimistic hook allows developers to render an optimistic payload immediately during async Action dispatching.',
        note: '管理后台的即时标记可以不再手写临时 pending 状态。下季度重构这个模块。',
        tags: ['#架构设计', '#前端工程', '#RFC解读'],
        badge: '锚点锁定',
        tone: 'ok',
      },
    ),
    base(
      {
        id: 'sample-pin',
        pattern: 'figma.com/community/file/tokens-core',
        matchMode: 'prefix',
        text: 'Token 导出要确认 webhook 是不是已经迁到 v2。',
        color: '#ef4444',
        selector: 'button#run-action-workflow',
        elementLabel: 'button · 导出',
        enabled: true,
        createdAt: now - 26 * 60 * 60 * 1000,
        updatedAt: now - 26 * 60 * 60 * 1000,
      },
      {
        kind: 'pin',
        title: 'Figma Tokens 发布脚本',
        quote: 'Token exporter must sync via GitHub Actions commit webhook every 10 minutes.',
        note: '页面结构变过，原始锚点对不上。这是示例，收成备忘后会按你填的选择器保存。',
        tags: ['#DesignSystem', '#待验证'],
        badge: '定位失效',
        tone: 'bad',
      },
    ),
    base(
      {
        id: 'sample-video',
        pattern: 'bilibili.com/video/BV1Ax411c7dK?t=1420',
        matchMode: 'prefix',
        text: 'WebWorker 线性内存要预留 initial: 256，避免扩容时卡帧。',
        color: '#10b981',
        enabled: true,
        createdAt: now - 3 * 24 * 60 * 60 * 1000,
        updatedAt: now - 3 * 24 * 60 * 60 * 1000,
      },
      {
        kind: 'video',
        title: 'WebAssembly 性能优化：23:40 打点',
        quote: '在 WebWorker 线程初始化线性内存时，务必预留 initial: 256 页面。',
        note: '这解释了渲染大量节点时偶尔卡帧的原因。示例不会写入本地，除非你收成备忘。',
        tags: ['#WebAssembly', '#性能调优'],
        badge: '23:40 打点',
        tone: 'ok',
      },
    ),
    base(
      {
        id: 'sample-shot',
        pattern: 'developer.mozilla.org/en-US/docs/Web/CSS/anchor',
        matchMode: 'prefix',
        text: 'CSS anchor 定位要看 Chromium 125 以后的兼容表。',
        color: '#3b82f6',
        enabled: true,
        createdAt: now - 5 * 24 * 60 * 60 * 1000,
        updatedAt: now - 5 * 24 * 60 * 60 * 1000,
      },
      {
        kind: 'shot',
        title: 'MDN：CSS Anchor Positioning 兼容表',
        quote: '区域截图还没有单独的存储字段。这条示例只用来把版式摆出来。',
        note: '收成备忘后，会保存成一条普通文字备忘，不会带上图片。',
        tags: ['#CSS', '#规范跟踪'],
        badge: '页面快照',
        tone: 'neutral',
      },
    ),
  ];
}

function collectViews(): { views: NoteView[]; sample: boolean; note: string } {
  if (kindFilter === 'shot' || kindFilter === 'video') {
    return {
      views: sampleViews().filter((view) => view.kind === kindFilter),
      sample: true,
      note: '这种记录还没有单独的数据。下面是示例版式，点「收成我的备忘」才会存成一条普通备忘。',
    };
  }
  if (currentMemos.length === 0) {
    const views = sampleViews().filter((view) => kindFilter === 'all' || view.kind === kindFilter);
    return {
      views,
      sample: true,
      note: '还没有你的备忘。下面按稿子摆了四条示例，不会写进本地。',
    };
  }
  const views = currentMemos
    .map((memo) => viewFromMemo(memo, false))
    .filter((view) => kindFilter === 'all' || view.kind === kindFilter);
  return { views, sample: false, note: '' };
}

function hostOf(pattern: string): string {
  try {
    if (/^https?:\/\//i.test(pattern)) return new URL(pattern).host;
  } catch {
    /* 不是完整 URL */
  }
  return pattern.split('/')[0] || pattern;
}

function renderMetrics(source: NoteView[], sample: boolean): void {
  const root = document.getElementById('metrics')!;
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const domains = new Set(source.map((view) => hostOf(view.memo.pattern)));
  const pinned = source.filter((view) => view.kind === 'pin').length;
  const shots = source.filter((view) => view.kind === 'shot').length;
  const videos = source.filter((view) => view.kind === 'video').length;
  const week = source.filter((view) => view.memo.updatedAt >= weekAgo).length;
  const items = [
    ['全部记忆笔记', String(source.length), sample ? '示例' : `分布于 ${domains.size} 个地址`],
    ['近 7 天', String(week), '按最后修改'],
    ['DOM 图钉', String(pinned), '鼠标移到元素上才出现'],
    ['划词 / 截图 / 视频', `${source.length - pinned} / ${shots} / ${videos}`, sample ? '后两项是示例版式' : '后两项还没有单独字段'],
  ];
  root.replaceChildren();
  for (const [label, value, hint] of items) {
    const card = document.createElement('div');
    card.className = 'metric';
    const k = document.createElement('span');
    k.textContent = label;
    const v = document.createElement('b');
    v.textContent = value;
    const h = document.createElement('small');
    h.textContent = hint;
    card.append(k, v, h);
    root.appendChild(card);
  }
  const memoCount = document.getElementById('nav-memo-count');
  if (memoCount) memoCount.textContent = String(currentMemos.length || source.length);
}

function renderLegend(source: NoteView[]): void {
  const root = document.getElementById('color-legend');
  if (!root) return;
  const buckets = [
    ['#f59e0b', '灵感与关键定义'],
    ['#3b82f6', '技术架构与方案'],
    ['#10b981', '待办与验证结论'],
    ['#a855f7', '文献引用及论据'],
  ] as const;
  root.replaceChildren();
  for (const [color, label] of buckets) {
    const row = document.createElement('div');
    const count = source.filter((view) => (view.memo.color ?? '').toLowerCase() === color).length;
    row.innerHTML = `<i style="background:${color}"></i><span></span><b></b>`;
    row.querySelector('span')!.textContent = label;
    row.querySelector('b')!.textContent = String(count);
    root.appendChild(row);
  }
}

function renderDomainChips(source: Memo[]): void {
  const root = document.getElementById('domain-chips')!;
  const counts = new Map<string, number>();
  for (const memo of source) {
    const host = hostOf(memo.pattern);
    counts.set(host, (counts.get(host) ?? 0) + 1);
  }
  root.replaceChildren();
  const all = document.createElement('button');
  all.type = 'button';
  all.className = 'chip' + (domainFilter === '' ? ' on' : '');
  all.textContent = '全部地址';
  all.addEventListener('click', () => {
    domainFilter = '';
    renderMemoList();
  });
  root.appendChild(all);
  for (const [host, count] of counts) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'chip' + (domainFilter === host ? ' on' : '');
    btn.textContent = `${host} (${count})`;
    btn.addEventListener('click', () => {
      domainFilter = domainFilter === host ? '' : host;
      renderMemoList();
    });
    root.appendChild(btn);
  }
}

const SWATCHES = ['#f59e0b', '#3b82f6', '#10b981', '#a855f7', '#fb7185'];

function renderDetail(view: NoteView | undefined): void {
  const root = document.getElementById('memo-detail')!;
  root.replaceChildren();
  if (!view) {
    const empty = document.createElement('p');
    empty.className = 'empty';
    empty.textContent = '选一条笔记，这里看原文和批注。';
    root.appendChild(empty);
    return;
  }
  const { memo } = view;
  const head = document.createElement('div');
  head.className = 'inspector-head';
  const title = document.createElement('h2');
  title.textContent = view.sample ? '示例档案' : '笔记深度档案';
  const id = document.createElement('span');
  id.className = 'note-url';
  id.textContent = view.sample ? '示例 · 未保存' : memo.id.slice(0, 8);
  head.append(title, id);

  const quoteLabel = document.createElement('div');
  quoteLabel.className = 'inspector-label';
  quoteLabel.textContent = '引用的原文';
  const quote = document.createElement('blockquote');
  quote.className = 'note-quote';
  quote.textContent = view.quote;

  const noteLabel = document.createElement('div');
  noteLabel.className = 'inspector-label';
  noteLabel.textContent = '批注';
  const note = document.createElement('p');
  note.className = 'note-comment';
  note.textContent = view.note;

  const pattern = document.createElement('div');
  pattern.className = 'note-url';
  pattern.textContent = memo.pattern;

  const swatches = document.createElement('div');
  swatches.className = 'swatches';
  for (const color of SWATCHES) {
    const dot = document.createElement('button');
    dot.type = 'button';
    dot.className = 'swatch' + (memo.color?.toLowerCase() === color ? ' on' : '');
    dot.style.background = color;
    dot.addEventListener('click', () => {
      if (view.sample) {
        openEditor({ ...memo, color }, true);
        return;
      }
      upsertMemo({ ...memo, color, updatedAt: Date.now() });
    });
    swatches.appendChild(dot);
  }

  const tags = document.createElement('div');
  tags.className = 'note-tags';
  for (const tag of view.tags) {
    const chip = document.createElement('span');
    chip.textContent = tag;
    tags.appendChild(chip);
  }

  const actions = document.createElement('div');
  actions.className = 'detail-actions';
  const edit = document.createElement('button');
  edit.type = 'button';
  edit.className = 'btn primary';
  edit.textContent = view.sample ? '收成我的备忘' : '打开编辑';
  edit.addEventListener('click', () => openEditor(memo, view.sample));
  actions.appendChild(edit);
  if (!view.sample) {
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'btn secondary danger';
    del.textContent = '删除记忆';
    del.addEventListener('click', () => {
      if (confirm('确认删除这条备忘？')) removeMemo(memo.id);
    });
    actions.appendChild(del);
  }
  root.append(head, quoteLabel, quote, noteLabel, note, pattern, swatches, tags, actions);
}

function formatAgo(ts: number): string {
  const delta = Date.now() - ts;
  const min = Math.round(delta / 60000);
  if (min < 1) return '刚刚';
  if (min < 60) return `${min} 分钟前`;
  const hour = Math.round(min / 60);
  if (hour < 24) return `${hour} 小时前`;
  const day = Math.round(hour / 24);
  if (day < 30) return `${day} 天前`;
  return formatTime(ts);
}

function sampleDuplicateGroup(): DuplicateGroup {
  const url = 'https://github.com/features/actions';
  return {
    key: 'sample',
    urlSample: url,
    tabs: [
      { id: -1, windowId: 1, url, title: '窗口 1 · 最早打开', active: false },
      { id: -2, windowId: 3, url, title: '窗口 3 · 正在看', active: true },
    ],
  };
}

function renderDuplicates(): void {
  const list = document.getElementById('dup-list')!;
  const metrics = document.getElementById('dup-metrics')!;
  const note = document.getElementById('dup-sample-note')!;
  const usingSample = duplicateGroups.length === 0;
  const groups = usingSample ? [sampleDuplicateGroup()] : duplicateGroups;
  note.hidden = !usingSample;
  const tabCount = groups.reduce((sum, group) => sum + group.tabs.length, 0);
  metrics.replaceChildren();
  for (const [label, value, hint] of [
    ['重复组', String(groups.length), usingSample ? '示例' : '地址完全相同'],
    ['涉及标签', String(tabCount), '每组至少会留下一个'],
  ] as const) {
    const card = document.createElement('div');
    card.className = 'metric';
    const k = document.createElement('span');
    k.textContent = label;
    const v = document.createElement('b');
    v.textContent = value;
    const h = document.createElement('small');
    h.textContent = hint;
    card.append(k, v, h);
    metrics.appendChild(card);
  }

  list.replaceChildren();
  for (const group of groups) {
    list.appendChild(renderDuplicateCard(group, usingSample));
  }
}

function renderDuplicateCard(group: DuplicateGroup, sample: boolean): HTMLElement {
  const card = document.createElement('article');
  card.className = 'dup-card';
  const head = document.createElement('div');
  head.className = 'dup-head';
  const title = document.createElement('div');
  title.className = 'dup-title';
  title.textContent = group.tabs.find((tab) => tab.title)?.title || group.urlSample;
  const url = document.createElement('div');
  url.className = 'memo-pattern';
  url.textContent = group.urlSample;
  head.append(title, url);

  const rows = document.createElement('div');
  rows.className = 'dup-rows';
  const keepId = group.tabs.find((tab) => tab.active)?.id ?? group.tabs[0]?.id;
  for (const tab of group.tabs) {
    const row = document.createElement('div');
    row.className = 'dup-row';
    const label = document.createElement('span');
    const mark = tab.id === keepId ? '建议留下 · ' : '';
    label.textContent = `${mark}窗口 ${tab.windowId}${tab.title ? ` · ${tab.title}` : ''}`;
    const go = document.createElement('button');
    go.type = 'button';
    go.className = 'btn secondary';
    go.textContent = tab.id === keepId ? '留下这个' : '切到这个';
    go.disabled = sample;
    go.addEventListener('click', () => {
      sendRuntimeMessage({
        type: 'zilean/activate-tab',
        tabId: tab.id,
        windowId: tab.windowId,
      }).catch(() => undefined);
    });
    row.append(label, go);
    rows.appendChild(row);
  }

  const foot = document.createElement('div');
  foot.className = 'detail-actions';
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'btn primary';
  const extra = pickDuplicateIdsToClose(group, keepId).length;
  close.textContent = `只留一个（关掉另外 ${extra} 个）`;
  close.disabled = sample;
  close.addEventListener('click', () => {
    sendRuntimeMessage({
      type: 'zilean/keep-one-duplicate',
      key: group.key,
      keepTabId: keepId,
    })
      .then(() => loadDuplicates())
      .catch(() => undefined);
  });
  foot.appendChild(close);
  card.append(head, rows, foot);
  return card;
}

async function loadDuplicates(): Promise<void> {
  try {
    const res = await sendRuntimeMessage<{ ok?: boolean } & DuplicateSnapshotResponse>({
      type: 'zilean/get-duplicates',
    });
    if (res?.ok) duplicateGroups = res.groups;
    const count = document.getElementById('nav-dup-count');
    if (count) {
      count.textContent = String(duplicateGroups.reduce((sum, group) => sum + group.tabs.length, 0));
    }
  } catch {
    duplicateGroups = [];
  }
  if (notesView === 'dups') renderDuplicates();
}

function showView(view: NotesView): void {
  notesView = view;
  for (const id of ['notes', 'dups', 'settings'] as const) {
    document.getElementById(`view-${id}`)!.hidden = id !== view;
  }
  document.querySelectorAll<HTMLButtonElement>('.view-tab').forEach((btn) => {
    btn.classList.toggle('on', btn.dataset.view === view);
  });
  if (view === 'dups') {
    loadDuplicates().catch(() => undefined);
  }
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function openEditor(memo?: Memo, asNew = false): void {
  const dialog = document.getElementById('editor') as HTMLDialogElement;
  const form = document.getElementById('editor-form') as HTMLFormElement;
  const title = document.getElementById('editor-title')!;
  title.textContent = memo && !asNew ? '编辑备忘' : '添加备忘';

  form.reset();
  (form.elements.namedItem('enabled') as HTMLInputElement).checked = memo?.enabled ?? true;
  (form.elements.namedItem('text') as HTMLTextAreaElement).value = memo?.text ?? '';
  (form.elements.namedItem('matchMode') as HTMLSelectElement).value = memo?.matchMode ?? 'exact';
  (form.elements.namedItem('pattern') as HTMLInputElement).value = memo?.pattern ?? '';
  (form.elements.namedItem('selector') as HTMLInputElement).value = memo?.selector ?? '';
  (form.elements.namedItem('elementLabel') as HTMLInputElement).value = memo?.elementLabel ?? '';
  editorColorField?.setValue(memo?.color ?? currentSettings?.defaultColor ?? '#ffffff');
  editorFontField?.setValue(memo?.fontFamily ?? currentSettings?.defaultFontFamily);
  (form.elements.namedItem('fontSize') as HTMLInputElement).value =
    memo?.fontSize != null ? String(memo.fontSize) : '';

  form.dataset.memoId = memo && !asNew ? memo.id : '';
  dialog.showModal();
}

function initEditor(): void {
  const dialog = document.getElementById('editor') as HTMLDialogElement;
  const form = document.getElementById('editor-form') as HTMLFormElement;

  editorColorField = createColorField('#ffffff');
  const colorMount = document.getElementById('editor-color-mount')!;
  colorMount.appendChild(editorColorField.element);

  editorFontField = createFontField();
  const fontMount = document.getElementById('editor-font-mount')!;
  fontMount.appendChild(editorFontField.element);

  const textarea = form.querySelector<HTMLTextAreaElement>('[name="text"]')!;
  editorVoice = createVoiceField(textarea);
  document.getElementById('editor-voice-mount')!.appendChild(editorVoice.button);

  document.getElementById('editor-cancel')!.addEventListener('click', () => {
    dialog.close('cancel');
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = form.dataset.memoId || createId();
    const existing = currentMemos.find((m) => m.id === id);
    const now = Date.now();
    const data = new FormData(form);
    const memo: Memo = {
      id,
      text: String(data.get('text') ?? '').trim(),
      matchMode: (String(data.get('matchMode')) as MatchMode) || 'exact',
      pattern: String(data.get('pattern') ?? '').trim(),
      selector: String(data.get('selector') ?? '').trim() || undefined,
      elementLabel: String(data.get('elementLabel') ?? '').trim() || undefined,
      color: editorColorField?.getValue(),
      fontFamily: editorFontField?.getValue(),
      fontSize: parseOptionalNumber(data.get('fontSize')),
      enabled: (form.elements.namedItem('enabled') as HTMLInputElement).checked,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    if (!memo.text || !memo.pattern) return;
    if (memo.matchMode === 'regex') {
      try {
        new RegExp(memo.pattern);
      } catch (err) {
        alert('正则表达式不合法: ' + (err instanceof Error ? err.message : String(err)));
        return;
      }
    }
    await upsertMemo(memo);
    dialog.close('save');
  });
  dialog.addEventListener('close', () => editorVoice?.stop());
}

function parseOptionalNumber(v: FormDataEntryValue | null): number | undefined {
  if (v == null) return undefined;
  const s = String(v).trim();
  if (!s) return undefined;
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function initSettingsHandlers(): void {
  const visible = document.getElementById('set-visible') as HTMLInputElement;
  const loop = document.getElementById('set-loop') as HTMLInputElement;
  const duplicates = document.getElementById('set-duplicates') as HTMLInputElement;
  const fabAutoHide = document.getElementById('set-fab-autohide') as HTMLInputElement;
  const color = document.getElementById('set-color') as HTMLInputElement;
  const size = document.getElementById('set-size') as HTMLInputElement;

  settingsFontField = createFontField();
  document.getElementById('set-font-mount')!.appendChild(settingsFontField.element);

  const persist = () => {
    if (!currentSettings) return;
    const next: Settings = {
      ...currentSettings,
      visibleByDefault: visible.checked,
      loop: loop.checked,
      duplicateDetection: duplicates.checked,
      fabAutoHide: fabAutoHide.checked,
      defaultColor: color.value,
      defaultFontSize: Math.max(10, Math.min(72, Number(size.value) || currentSettings.defaultFontSize)),
      defaultFontFamily: settingsFontField?.getValue() ?? currentSettings.defaultFontFamily,
    };
    setSettings(next);
  };

  visible.addEventListener('change', persist);
  loop.addEventListener('change', persist);
  duplicates.addEventListener('change', persist);
  fabAutoHide.addEventListener('change', persist);
  color.addEventListener('change', persist);
  size.addEventListener('change', persist);
  settingsFontField.onChange(persist);

  document.getElementById('reset-fab')!.addEventListener('click', () => {
    if (!currentSettings) return;
    setSettings({
      ...currentSettings,
      fabEdge: DEFAULT_SETTINGS.fabEdge,
      fabTopRatio: DEFAULT_SETTINGS.fabTopRatio,
    });
  });
}

function initImportExport(): void {
  document.getElementById('export')!.addEventListener('click', async () => {
    const { memos, settings } = await getAll();
    const backup: BackupFile = {
      app: 'zilean',
      version: 1,
      exportedAt: Date.now(),
      memos,
      settings,
    };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    a.href = url;
    a.download = `zilean-backup-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });

  const input = document.getElementById('import') as HTMLInputElement;
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as Partial<BackupFile>;
      if (parsed.app !== 'zilean' || !Array.isArray(parsed.memos)) {
        throw new Error('文件不是有效的 Zilean 备份');
      }
      const { memos: existing, settings: existingSettings } = await getAll();
      const map = new Map<string, Memo>(existing.map((m) => [m.id, m]));
      let added = 0;
      let updated = 0;
      for (const raw of parsed.memos) {
        const m = sanitizeMemo(raw);
        if (!m) continue;
        const prev = map.get(m.id);
        if (!prev) {
          map.set(m.id, m);
          added++;
        } else if (m.updatedAt > prev.updatedAt) {
          map.set(m.id, m);
          updated++;
        }
      }
      await setMemos(Array.from(map.values()));
      if (parsed.settings) {
        await setSettings({ ...existingSettings, ...parsed.settings });
      }
      alert(`导入完成: 新增 ${added} 条，更新 ${updated} 条`);
    } catch (err) {
      alert('导入失败: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      input.value = '';
    }
  });
}

function sanitizeMemo(raw: unknown): Memo | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const id = typeof r.id === 'string' && r.id ? r.id : createId();
  const pattern = typeof r.pattern === 'string' ? r.pattern : '';
  const mode = r.matchMode;
  const matchMode: MatchMode =
    mode === 'exact' || mode === 'prefix' || mode === 'domain' || mode === 'regex'
      ? mode
      : 'exact';
  const text = typeof r.text === 'string' ? r.text : '';
  if (!pattern || !text) return null;
  const now = Date.now();
  return {
    id,
    pattern,
    matchMode,
    text,
    color: typeof r.color === 'string' ? r.color : undefined,
    fontFamily: typeof r.fontFamily === 'string' ? r.fontFamily : undefined,
    fontSize: typeof r.fontSize === 'number' ? r.fontSize : undefined,
    selector: typeof r.selector === 'string' && r.selector ? r.selector : undefined,
    elementLabel: typeof r.elementLabel === 'string' && r.elementLabel ? r.elementLabel : undefined,
    enabled: typeof r.enabled === 'boolean' ? r.enabled : true,
    createdAt: typeof r.createdAt === 'number' ? r.createdAt : now,
    updatedAt: typeof r.updatedAt === 'number' ? r.updatedAt : now,
  };
}

async function init(): Promise<void> {
  initEditor();
  initSettingsHandlers();
  initImportExport();

  document.getElementById('add-memo')!.addEventListener('click', () => openEditor());
  document.querySelectorAll<HTMLButtonElement>('.view-tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      const view = btn.dataset.view;
      if (view === 'notes' || view === 'dups' || view === 'settings') showView(view);
    });
  });
  document.getElementById('kind-chips')!.addEventListener('click', (event) => {
    const btn = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-kind]');
    if (!btn) return;
    const kind = btn.dataset.kind;
    if (kind !== 'all' && kind !== 'float' && kind !== 'pin' && kind !== 'shot' && kind !== 'video') return;
    kindFilter = kind;
    document.querySelectorAll('#kind-chips .type-btn').forEach((chip) => {
      chip.classList.toggle('on', chip === btn);
    });
    renderMemoList();
  });
  document.getElementById('memo-search')!.addEventListener('input', (event) => {
    memoQuery = (event.target as HTMLInputElement).value;
    renderMemoList();
  });
  document.getElementById('dup-refresh')!.addEventListener('click', () => {
    loadDuplicates().catch(() => undefined);
  });
  document.getElementById('set-tabs')!.addEventListener('click', (event) => {
    const btn = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-set]');
    if (!btn?.dataset.set) return;
    document.querySelectorAll<HTMLButtonElement>('.set-tab').forEach((tab) => {
      tab.classList.toggle('on', tab === btn);
    });
    document.querySelectorAll<HTMLElement>('.set-panel').forEach((panel) => {
      panel.hidden = panel.id !== `set-${btn.dataset.set}`;
    });
  });

  await refresh();
  loadDuplicates().catch(() => undefined);
  subscribe(() => {
    refresh().catch(() => undefined);
  });
}

init().catch((err) => console.error('[zilean options]', err));
