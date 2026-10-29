import { filterMemosForUrl, suggestPatternForUrl } from '@shared/match';
import {
  pickDuplicateIdsToClose,
  type DuplicateGroup,
  type DuplicateTabInfo,
} from '@shared/duplicates';
import {
  sendRuntimeMessage,
  type DuplicateCheckResponse,
  type DuplicateSnapshotResponse,
  type RuntimeMessage,
} from '@shared/messages';
import {
  createId,
  getAll,
  removeMemo,
  setSettings,
  subscribe,
  upsertMemo,
} from '@shared/storage';
import type { MatchMode, Memo, Settings } from '@shared/types';
import { createColorField, type ColorField } from '@ui/color-field';
import { createFontField, type FontField } from '@ui/font-field';
import { createVoiceField, type VoiceField } from '@ui/voice-field';

const SCOPE_LABEL: Record<MatchMode, string> = {
  exact: '仅此地址',
  prefix: '这条路径',
  domain: '整个站点',
  regex: '自定义规则',
};

let currentUrl = '';
let currentTitle = '';
let currentTabId: number | undefined;
let currentSettings: Settings | null = null;
let addColorField: ColorField | null = null;
let addFontField: FontField | null = null;
let addVoice: VoiceField | null = null;
let openAddForm: ((draft?: string, memo?: Memo) => void) | null = null;
let editingMemo: Memo | null = null;
let duplicateGroups: DuplicateGroup[] = [];
let duplicateDetectionEnabled = true;

async function getActiveTab(): Promise<chrome.tabs.Tab | null> {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return tab ?? null;
}

async function refresh(): Promise<void> {
  const tab = await getActiveTab();
  currentUrl = tab?.url ?? '';
  currentTitle = tab?.title ?? '';
  currentTabId = tab?.id;
  const { memos, settings } = await getAll();
  currentSettings = settings;
  const { matched } = filterMemosForUrl(memos, currentUrl);
  renderHeader(currentUrl, currentTitle, matched.length);
  renderMemos(matched);
  renderToggles(settings);
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

function renderHeader(url: string, title: string, count: number): void {
  const name = document.getElementById('page-title')!;
  const sub = document.getElementById('current-url')!;
  const host = hostOf(url);
  name.textContent = title.trim() || host || '这一页';
  name.title = url;
  if (!url) {
    sub.textContent = '当前标签页不可访问';
    return;
  }
  const bits = [host || url];
  if (count) bits.push(`${count} 条`);
  sub.textContent = bits.join(' · ');
}

function renderToggles(settings: Settings): void {
  setPressed('visible-default', settings.visibleByDefault);
  setPressed('loop', settings.loop);
}

function setPressed(id: string, on: boolean): void {
  const btn = document.getElementById(id) as HTMLButtonElement;
  const wasOn = btn.classList.contains('on');
  btn.classList.toggle('on', on);
  btn.setAttribute('aria-pressed', on ? 'true' : 'false');
  if (on && !wasOn) {
    btn.classList.remove('just-on');
    void btn.offsetWidth;
    btn.classList.add('just-on');
  } else if (!on) {
    btn.classList.remove('just-on');
  }
}

let pageMemos: Memo[] = [];
let chronoMode: 'timeline' | 'notes' = 'timeline';
let chronoIndex = -1;

interface ChronoNode {
  id: string;
  at: number;
  title: string;
  body: string;
  sample: boolean;
}

function renderMemos(matched: Memo[]): void {
  pageMemos = matched;
  renderChrono();
  paintMemos();
}

function paintMemos(): void {
  const list = document.getElementById('memo-list')!;
  const q = (document.getElementById('memo-search') as HTMLInputElement | null)?.value.trim().toLowerCase() ?? '';
  const until = selectedChronoUntil();
  const pool = until == null ? pageMemos : pageMemos.filter((memo) => memo.createdAt <= until);
  const shown = q
    ? pool.filter((memo) => `${memo.text} ${memo.elementLabel ?? ''}`.toLowerCase().includes(q))
    : pool;
  list.hidden = chronoMode === 'timeline';
  list.replaceChildren();

  if (pool.length === 0) {
    list.appendChild(renderEmpty());
    return;
  }
  if (shown.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.innerHTML = `<div class="empty-title">这一页里没有这句</div>`;
    list.appendChild(empty);
    return;
  }

  for (const memo of shown) {
    list.appendChild(renderMemoItem(memo));
  }
}

function chronoNodes(): ChronoNode[] {
  if (pageMemos.length === 0) return sampleChrono();
  const sorted = [...pageMemos].sort((a, b) => a.createdAt - b.createdAt);
  return [
    ...sorted.map((memo) => ({
      id: memo.id,
      at: memo.createdAt,
      title: memo.text.length > 32 ? `${memo.text.slice(0, 32)}…` : memo.text,
      body: memo.selector ? `钉在 ${memo.elementLabel || '元素'} 上` : '飘过的备忘',
      sample: false,
    })),
    { id: 'now', at: Date.now(), title: '当前时刻', body: '这一页现在能看到的备忘。', sample: false },
  ];
}

function sampleChrono(): ChronoNode[] {
  const now = Date.now();
  return [
    { id: 'sample-0', at: now - 10 * 86400000, title: '初始建立 URL 索引', body: '第一次打开这个地址，还没有写下备忘。', sample: true },
    { id: 'sample-1', at: now - 3 * 86400000, title: '3 天前 · 首次阅读留痕', body: '圈了两条关键定义，阅读到大约 72%。', sample: true },
    { id: 'sample-2', at: now - 86400000, title: '昨天 · 架构草案标注', body: 'Self-hosted runners 可以加到仓库、组织或企业。', sample: true },
    { id: 'sample-3', at: now, title: '当前时刻 · 最新快照', body: '正在看这一页。这是示例，不会写进本地。', sample: true },
  ];
}

function selectedChronoUntil(): number | null {
  const nodes = chronoNodes();
  if (nodes.length === 0 || chronoIndex >= nodes.length - 1) return null;
  return nodes[chronoIndex]?.at ?? null;
}

function renderChrono(): void {
  const nodes = chronoNodes();
  if (chronoIndex < 0 || chronoIndex >= nodes.length) chronoIndex = nodes.length - 1;
  const panel = document.getElementById('chrono-panel');
  if (panel) panel.hidden = chronoMode !== 'timeline';
  const finder = document.querySelector('.finder') as HTMLElement | null;
  if (finder) finder.hidden = chronoMode !== 'notes';
  document.querySelectorAll<HTMLButtonElement>('.chrono-tab').forEach((tab) => {
    tab.classList.toggle('on', tab.dataset.chrono === chronoMode);
  });

  const current = nodes[chronoIndex];
  const label = document.getElementById('scrub-label');
  const note = document.getElementById('chrono-note');
  const scrub = document.getElementById('time-scrub') as HTMLInputElement | null;
  if (label && current) label.textContent = chronoIndex === nodes.length - 1 ? '现在' : formatChronoWhen(current.at);
  if (scrub && nodes.length > 1) {
    scrub.value = String(Math.round((chronoIndex / (nodes.length - 1)) * 100));
  }
  if (note && current) {
    note.textContent = current.sample
      ? '示例时间轴，没有写进本地。网页没有快照，滑块倒不回当时的页面。'
      : chronoIndex === nodes.length - 1
        ? '现在。弹幕显示这一页的全部备忘。'
        : '回到这一刻之后写下的弹幕会先藏起来。网页本身倒不回去。';
  }

  const list = document.getElementById('chrono-nodes');
  if (!list) return;
  list.replaceChildren();
  for (const [index, node] of nodes.entries()) {
    const item = document.createElement('li');
    item.className = 'chrono-node' + (index === chronoIndex ? ' on' : '');
    const time = document.createElement('time');
    time.textContent = index === nodes.length - 1 ? '现在' : formatChronoWhen(node.at);
    const title = document.createElement('div');
    title.className = 'chrono-title';
    title.textContent = node.title;
    const body = document.createElement('p');
    body.textContent = node.body;
    item.append(time, title, body);
    item.addEventListener('click', () => {
      chronoIndex = index;
      renderChrono();
      paintMemos();
      pushChronoshift(selectedChronoUntil());
    });
    list.appendChild(item);
  }
}

function formatChronoWhen(at: number): string {
  const day = Math.floor((Date.now() - at) / 86400000);
  if (day <= 0) return '今天';
  if (day === 1) return '昨天';
  if (day < 30) return `${day} 天前`;
  const date = new Date(at);
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

function pushChronoshift(until: number | null): void {
  if (currentTabId == null) return;
  chrome.tabs.sendMessage(currentTabId, { type: 'zilean/chronoshift', until } satisfies RuntimeMessage).catch(() => undefined);
}

function moveChrono(step: number): void {
  const last = chronoNodes().length - 1;
  chronoIndex = Math.min(last, Math.max(0, chronoIndex + step));
  renderChrono();
  paintMemos();
  pushChronoshift(selectedChronoUntil());
}

function renderEmpty(): HTMLElement {
  const empty = document.createElement('div');
  empty.className = 'empty';
  empty.innerHTML = `
    <div class="empty-ghost">记得回头看一眼</div>
    <div class="empty-title">这一页还是安静的</div>
    <div class="empty-sub">写一句，或钉在某个按钮、标题上。鼠标移过去就会看到。</div>
  `;
  return empty;
}

function renderDuplicates(): void {
  const list = document.getElementById('duplicate-list')!;
  const banner = document.getElementById('dup-banner') as HTMLButtonElement;
  const count = document.getElementById('duplicate-count')!;
  const tabCount = duplicateGroups.reduce((sum, group) => sum + group.tabs.length, 0);
  count.textContent = String(tabCount);
  list.replaceChildren();

  const showBanner = duplicateDetectionEnabled && tabCount > 1;
  banner.hidden = !showBanner;
  if (!showBanner) closeDupSheet();

  if (!duplicateDetectionEnabled) {
    list.appendChild(renderSheetEmpty('重复页提示已关闭', '可在设置里重新打开'));
    return;
  }

  if (duplicateGroups.length === 0) {
    list.appendChild(renderSheetEmpty('没有发现重复页面', '打开多个相同地址时会出现在这里'));
    return;
  }

  for (const group of duplicateGroups) {
    list.appendChild(renderDuplicateGroup(group));
  }
}

function renderSheetEmpty(title: string, sub: string): HTMLElement {
  const empty = document.createElement('div');
  empty.className = 'empty';
  empty.innerHTML = `<div class="empty-title">${title}</div><div class="empty-sub">${sub}</div>`;
  return empty;
}

function renderDuplicateGroup(group: DuplicateGroup): HTMLElement {
  const el = document.createElement('div');
  el.className = 'dup-group';

  const head = document.createElement('div');
  head.className = 'dup-group-head';

  const title = document.createElement('div');
  title.className = 'dup-group-title';
  title.textContent = `同一地址开了 ${group.tabs.length} 个`;

  const closeIds = pickDuplicateIdsToClose(group, currentTabId);
  const closeOthers = document.createElement('button');
  closeOthers.type = 'button';
  closeOthers.className = 'danger';
  closeOthers.textContent = '只留一个';
  closeOthers.disabled = closeIds.length === 0;
  closeOthers.addEventListener('click', () => {
    if (closeOthers.disabled) return;
    closeOthers.disabled = true;
    void sendRuntimeMessage({
      type: 'zilean/keep-one-duplicate',
      key: group.key,
      keepTabId: currentTabId,
    });
  });

  head.appendChild(title);
  head.appendChild(closeOthers);

  const url = document.createElement('div');
  url.className = 'dup-url';
  url.textContent = group.urlSample;
  url.title = group.urlSample;

  el.appendChild(head);
  el.appendChild(url);

  for (const tab of group.tabs) {
    el.appendChild(renderDuplicateTab(tab));
  }

  return el;
}

function renderDuplicateTab(tab: DuplicateTabInfo): HTMLElement {
  const row = document.createElement('div');
  row.className = 'dup-tab';
  row.classList.toggle('active', Boolean(tab.active));

  const text = document.createElement('div');
  text.className = 'dup-tab-text';
  text.textContent = tab.title || '未命名页面';
  text.title = tab.title || tab.url;

  const meta = document.createElement('div');
  meta.className = 'dup-tab-meta';
  meta.textContent = tab.active ? '正在看' : `窗口 ${tab.windowId}`;

  const body = document.createElement('div');
  body.className = 'dup-tab-body';
  body.appendChild(text);
  body.appendChild(meta);

  const actions = document.createElement('div');
  actions.className = 'dup-tab-actions';

  const activate = document.createElement('button');
  activate.type = 'button';
  activate.textContent = '切过去';
  activate.addEventListener('click', () => {
    void sendRuntimeMessage({
      type: 'zilean/activate-tab',
      tabId: tab.id,
      windowId: tab.windowId,
    });
  });

  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'danger';
  close.textContent = '关掉';
  close.addEventListener('click', () => {
    void sendRuntimeMessage({ type: 'zilean/close-tab', tabId: tab.id });
  });

  actions.appendChild(activate);
  actions.appendChild(close);
  row.appendChild(body);
  row.appendChild(actions);
  return row;
}

function renderMemoItem(memo: Memo): HTMLElement {
  const el = document.createElement('article');
  el.className = 'note';
  el.tabIndex = 0;
  el.dataset.id = memo.id;
  el.classList.toggle('off', !memo.enabled);
  el.classList.toggle('editing', editingMemo?.id === memo.id);

  const bar = document.createElement('div');
  bar.className = 'note-bar';
  if (memo.color) bar.style.background = memo.color;

  const body = document.createElement('div');
  body.className = 'note-body';

  const text = document.createElement('div');
  text.className = 'note-text';
  text.textContent = memo.text;

  const meta = document.createElement('div');
  meta.className = 'note-meta';
  const where = memo.selector
    ? `钉在 ${memo.elementLabel || '页面元素'} 上`
    : SCOPE_LABEL[memo.matchMode];
  meta.textContent = `${where} · ${formatAgo(memo.updatedAt)}`;

  body.appendChild(text);
  body.appendChild(meta);

  const actions = document.createElement('div');
  actions.className = 'note-actions';

  const toggleBtn = document.createElement('button');
  toggleBtn.type = 'button';
  toggleBtn.textContent = memo.enabled ? '暂停' : '显示';
  toggleBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    upsertMemo({ ...memo, enabled: !memo.enabled, updatedAt: Date.now() });
  });

  const delBtn = document.createElement('button');
  delBtn.type = 'button';
  delBtn.className = 'danger';
  delBtn.textContent = '删除';
  delBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (confirm('删掉这条？')) removeMemo(memo.id);
  });

  actions.appendChild(toggleBtn);
  actions.appendChild(delBtn);

  el.appendChild(bar);
  el.appendChild(body);
  el.appendChild(actions);

  const edit = () => openAddForm?.(undefined, memo);
  el.addEventListener('click', edit);
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      edit();
    }
  });

  return el;
}

function formatAgo(ts: number): string {
  const min = Math.round((Date.now() - ts) / 60000);
  if (min < 1) return '刚刚';
  if (min < 60) return `${min} 分钟前`;
  const hours = Math.round(min / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} 天前`;
  const d = new Date(ts);
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

function initToggleHandlers(): void {
  document.getElementById('visible-default')!.addEventListener('click', () => {
    if (!currentSettings) return;
    setSettings({
      ...currentSettings,
      visibleByDefault: !currentSettings.visibleByDefault,
    });
  });

  document.getElementById('loop')!.addEventListener('click', () => {
    if (!currentSettings) return;
    setSettings({
      ...currentSettings,
      loop: !currentSettings.loop,
    });
  });

  document.getElementById('memo-search')!.addEventListener('input', () => paintMemos());
  document.querySelectorAll<HTMLButtonElement>('.chrono-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      const mode = tab.dataset.chrono;
      if (mode !== 'timeline' && mode !== 'notes') return;
      chronoMode = mode;
      renderChrono();
      paintMemos();
    });
  });
  document.getElementById('time-scrub')!.addEventListener('input', (event) => {
    const nodes = chronoNodes();
    if (nodes.length <= 1) return;
    const value = Number((event.target as HTMLInputElement).value);
    chronoIndex = Math.round((value / 100) * (nodes.length - 1));
    renderChrono();
    paintMemos();
  });
  document.getElementById('time-scrub')!.addEventListener('change', () => {
    pushChronoshift(selectedChronoUntil());
  });
  document.getElementById('chrono-replay')!.addEventListener('click', () => {
    pushChronoshift(selectedChronoUntil());
  });
  document.getElementById('chrono-prev')!.addEventListener('click', () => moveChrono(-1));
  document.getElementById('chrono-next')!.addEventListener('click', () => moveChrono(1));
  document.getElementById('open-options')!.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });
}

function initAddForm(): void {
  const shell = document.getElementById('add-shell') as HTMLElement;
  const toggleBtn = document.getElementById('add-toggle') as HTMLButtonElement;
  const openBtn = document.getElementById('add-open') as HTMLButtonElement;
  const form = document.getElementById('add-form') as HTMLFormElement;
  const cancelBtn = document.getElementById('add-cancel') as HTMLButtonElement;
  const modeSelect = form.querySelector<HTMLSelectElement>('[name="matchMode"]')!;
  const patternInput = form.querySelector<HTMLInputElement>('[name="pattern"]')!;
  const textarea = form.querySelector<HTMLTextAreaElement>('[name="text"]')!;
  const moreBtn = document.getElementById('add-more') as HTMLButtonElement;
  const advanced = document.getElementById('add-advanced') as HTMLElement;
  const placeholder = document.querySelector('.composer-placeholder');
  const hint = document.getElementById('add-voice-hint') as HTMLElement;
  const voiceBtn = document.getElementById('add-voice') as HTMLButtonElement;
  const pickBtn = document.getElementById('add-pick') as HTMLButtonElement;
  const pickShellBtn = document.getElementById('add-pick-shell') as HTMLButtonElement;
  const pickBanner = document.getElementById('pick-banner') as HTMLElement;
  const pinHint = document.getElementById('add-pin-hint') as HTMLElement;
  const selectorInput = form.querySelector<HTMLInputElement>('[name="selector"]')!;
  const labelInput = form.querySelector<HTMLInputElement>('[name="elementLabel"]')!;

  addColorField = createColorField(currentSettings?.defaultColor ?? '#ffffff');
  document.getElementById('add-color-mount')!.appendChild(addColorField.element);

  addFontField = createFontField(currentSettings?.defaultFontFamily);
  document.getElementById('add-font-mount')!.appendChild(addFontField.element);

  const prefillPattern = () => {
    if (editingMemo) return;
    if (!currentUrl) return;
    patternInput.value = suggestPatternForUrl(currentUrl, modeSelect.value as MatchMode);
  };

  addVoice = createVoiceField(textarea);
  document.getElementById('add-voice-mount')!.appendChild(addVoice.button);
  if (!addVoice.available) {
    voiceBtn.hidden = true;
    addVoice.button.hidden = true;
  }
  const observer = new MutationObserver(() => {
    const text = textarea.getAttribute('data-voice-hint') ?? '';
    hint.hidden = !text;
    hint.textContent = text;
  });
  observer.observe(textarea, { attributes: true, attributeFilter: ['data-voice-hint'] });

  const openForm = (draft?: string, memo?: Memo) => {
    editingMemo = memo ?? null;
    form.hidden = false;
    shell.hidden = true;
    advanced.hidden = !memo;
    moreBtn.textContent = memo ? '收起选项' : '出现范围与样式';
    if (placeholder) placeholder.textContent = memo ? '改这一句' : '写一句，钉在这一页';
    if (memo) {
      modeSelect.value = memo.matchMode;
      patternInput.value = memo.pattern;
      textarea.value = memo.text;
      selectorInput.value = memo.selector ?? '';
      labelInput.value = memo.elementLabel ?? '';
      (form.querySelector<HTMLInputElement>('[name="fontSize"]')!).value =
        memo.fontSize != null ? String(memo.fontSize) : '';
      addColorField?.setValue(memo.color ?? currentSettings?.defaultColor ?? '#ffffff');
      addFontField?.setValue(memo.fontFamily ?? currentSettings?.defaultFontFamily);
    } else {
      modeSelect.value = 'exact';
      prefillPattern();
      textarea.value = draft ?? '';
      selectorInput.value = '';
      labelInput.value = '';
      (form.querySelector<HTMLInputElement>('[name="fontSize"]')!).value = '';
      addColorField?.setValue(currentSettings?.defaultColor ?? '#ffffff');
      addFontField?.setValue(currentSettings?.defaultFontFamily);
    }
    renderPinHint();
    renderMemosHighlight();
    setTimeout(() => textarea.focus(), 0);
  };
  openAddForm = openForm;

  const closeForm = () => {
    addVoice?.stop();
    editingMemo = null;
    form.hidden = true;
    shell.hidden = false;
    advanced.hidden = true;
    moreBtn.textContent = '出现范围与样式';
    if (placeholder) placeholder.textContent = '写一句，或点麦克风';
    hint.hidden = true;
    hint.textContent = '';
    selectorInput.value = '';
    labelInput.value = '';
    pickBtn.textContent = '钉在页面元素上';
    pickBanner.hidden = true;
    renderPinHint();
    renderMemosHighlight();
  };

  const renderPinHint = () => {
    const label = labelInput.value.trim();
    pinHint.hidden = !label;
    pinHint.textContent = label ? `已钉在 ${label} 上，悬停时会提示` : '';
  };

  const openAndListen = () => {
    openForm();
    addVoice?.start();
  };

  toggleBtn.addEventListener('click', () => openForm());
  openBtn.addEventListener('click', () => openForm());
  voiceBtn.addEventListener('click', () => {
    if (form.hidden) openAndListen();
  });
  const startPick = () => {
    pickBtn.textContent = '到网页上点一下…';
    pickBanner.hidden = false;
    pickBanner.textContent = '请点到网页上：移到按钮或文字上，再点一下。Esc 取消。';
    void sendRuntimeMessage<{ ok?: boolean; error?: string }>({
      type: 'zilean/start-element-pick',
    }).then((res) => {
      if (res && res.ok === false && res.error) {
        pickBanner.textContent = res.error;
      }
    });
  };
  pickBtn.addEventListener('click', startPick);
  pickShellBtn.addEventListener('click', startPick);
  cancelBtn.addEventListener('click', closeForm);
  moreBtn.addEventListener('click', () => {
    advanced.hidden = !advanced.hidden;
    moreBtn.textContent = advanced.hidden ? '出现范围与样式' : '收起选项';
  });
  modeSelect.addEventListener('change', prefillPattern);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = new FormData(form);
    const text = String(data.get('text') ?? '').trim();
    const pattern = String(data.get('pattern') ?? '').trim();
    if (!text || !pattern) return;
    const matchMode = String(data.get('matchMode')) as MatchMode;
    if (matchMode === 'regex') {
      try {
        new RegExp(pattern);
      } catch (err) {
        alert('这条规则写得不对: ' + (err instanceof Error ? err.message : String(err)));
        return;
      }
    }
    const now = Date.now();
    const memo: Memo = {
      id: editingMemo?.id ?? createId(),
      pattern,
      matchMode,
      text,
      color: addColorField?.getValue(),
      fontFamily: addFontField?.getValue(),
      fontSize: parseOptionalNumber(data.get('fontSize')),
      selector: String(data.get('selector') ?? '').trim() || undefined,
      elementLabel: String(data.get('elementLabel') ?? '').trim() || undefined,
      enabled: editingMemo?.enabled ?? true,
      createdAt: editingMemo?.createdAt ?? now,
      updatedAt: now,
    };
    await upsertMemo(memo);
    closeForm();
  });
}

function renderMemosHighlight(): void {
  const list = document.getElementById('memo-list');
  if (!list) return;
  for (const note of list.querySelectorAll<HTMLElement>('.note')) {
    note.classList.toggle('editing', note.dataset.id === editingMemo?.id);
  }
}

function parseOptionalNumber(v: FormDataEntryValue | null): number | undefined {
  if (v == null) return undefined;
  const s = String(v).trim();
  if (!s) return undefined;
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function watchActiveTab(): void {
  chrome.tabs.onActivated.addListener(() => {
    refresh().catch(() => undefined);
  });
  chrome.tabs.onUpdated.addListener((_tabId, changeInfo, tab) => {
    if (!tab.active) return;
    if (changeInfo.url || changeInfo.status === 'complete' || changeInfo.title) {
      refresh().catch(() => undefined);
    }
  });
  chrome.windows?.onFocusChanged?.addListener?.(() => {
    refresh().catch(() => undefined);
  });
}

async function refreshDuplicates(): Promise<void> {
  const res = await sendRuntimeMessage<{ ok?: boolean } & DuplicateSnapshotResponse>({
    type: 'zilean/get-duplicates',
  });
  if (!res?.ok) return;
  duplicateGroups = res.groups;
  duplicateDetectionEnabled = res.enabled;
  renderDuplicates();
}

async function checkDuplicatesNow(): Promise<void> {
  const res = await sendRuntimeMessage<{ ok?: boolean } & DuplicateCheckResponse>({
    type: 'zilean/check-duplicates',
  });
  if (!res?.ok) return;
  duplicateGroups = res.groups;
  duplicateDetectionEnabled = res.enabled;
  renderDuplicates();
}

function openDupSheet(): void {
  document.getElementById('dup-sheet')!.hidden = false;
}

function closeDupSheet(): void {
  document.getElementById('dup-sheet')!.hidden = true;
}

function consumeDraft(): void {
  if (!currentSettings) return;
  const draft = currentSettings.draftMemoText.trim();
  const selector = currentSettings.draftSelector.trim();
  const label = currentSettings.draftElementLabel.trim();
  if (!draft && !selector) return;
  const form = document.getElementById('add-form') as HTMLFormElement | null;
  const alreadyOpen = Boolean(form && !form.hidden);
  if (!alreadyOpen) openAddForm?.(draft || undefined);
  else if (draft) {
    const textarea = form?.querySelector<HTMLTextAreaElement>('[name="text"]');
    if (textarea && !textarea.value.trim()) textarea.value = draft;
  }
  if (form && selector) {
    const selectorInput = form.querySelector<HTMLInputElement>('[name="selector"]');
    const labelInput = form.querySelector<HTMLInputElement>('[name="elementLabel"]');
    const pinHint = document.getElementById('add-pin-hint');
    if (selectorInput) selectorInput.value = selector;
    if (labelInput) labelInput.value = label;
    if (pinHint) {
      pinHint.hidden = false;
      pinHint.textContent = `已钉在 ${label || '这个元素'} 上，悬停时会提示`;
    }
    const pickBanner = document.getElementById('pick-banner');
    if (pickBanner) pickBanner.hidden = true;
    const pickBtn = document.getElementById('add-pick');
    if (pickBtn) pickBtn.textContent = '重新选择元素';
  }
  setSettings({
    ...currentSettings,
    draftMemoText: '',
    draftSelector: '',
    draftElementLabel: '',
  }).catch(() => undefined);
}

function initDuplicateHandlers(): void {
  document.getElementById('dup-banner')!.addEventListener('click', () => {
    openDupSheet();
  });
  document.getElementById('dup-close')!.addEventListener('click', () => {
    closeDupSheet();
  });
  document.getElementById('check-duplicates')!.addEventListener('click', () => {
    checkDuplicatesNow().catch(() => undefined);
  });

  chrome.runtime.onMessage.addListener((message: RuntimeMessage) => {
    if (message.type !== 'zilean/duplicates-snapshot') return false;
    duplicateGroups = message.groups;
    duplicateDetectionEnabled = message.enabled;
    renderDuplicates();
    return false;
  });
}

async function init(): Promise<void> {
  initToggleHandlers();
  await refresh();
  await refreshDuplicates();
  initAddForm();
  initDuplicateHandlers();
  consumeDraft();
  watchActiveTab();
  subscribe(() => {
    refresh().then(() => consumeDraft()).catch(() => undefined);
  });
}

init().catch((err) => console.error('[zilean panel]', err));
