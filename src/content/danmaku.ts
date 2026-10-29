import { resolveFontStack } from '@shared/fonts';
import type { Memo, Settings } from '@shared/types';

interface Lane {
  /** Timestamp (ms) at which the lane becomes free for a new item. */
  freeAt: number;
  /** Vertical position in px from the top of viewport. */
  top: number;
}

export interface DanmakuOptions {
  settings: Settings;
  memos: Memo[];
  loop: boolean;
  visible: boolean;
}

export interface DanmakuNotice {
  id: string;
  text: string;
  onClick?: () => void;
}

const LANE_PADDING = 8;
const DANMAKU_SPEED_PX_PER_SEC = 140;

export class DanmakuEngine {
  private container: HTMLElement;
  private memos: Memo[] = [];
  private settings: Settings;
  private loop: boolean;
  private visible: boolean;
  private lanes: Lane[] = [];
  private running = false;
  private disposed = false;
  private cycleTimer: number | null = null;
  private active = new Set<Animation>();
  private notices = new Map<string, { item: HTMLElement; anim: Animation }>();
  private resizeObserver: ResizeObserver;

  constructor(container: HTMLElement, opts: DanmakuOptions) {
    this.container = container;
    this.memos = opts.memos;
    this.settings = opts.settings;
    this.loop = opts.loop;
    this.visible = opts.visible;
    this.computeLanes();
    this.applyVisibility();

    this.resizeObserver = new ResizeObserver(() => this.computeLanes());
    this.resizeObserver.observe(document.documentElement);
  }

  setMemos(memos: Memo[]): void {
    this.memos = memos;
    if (this.running) {
      this.restart();
    }
  }

  setSettings(settings: Settings): void {
    this.settings = settings;
    this.computeLanes();
  }

  setLoop(loop: boolean): void {
    this.loop = loop;
  }

  show(): void {
    this.visible = true;
    this.applyVisibility();
    if (!this.running) this.start();
  }

  hide(): void {
    this.visible = false;
    this.applyVisibility();
    this.stop();
  }

  toggle(): boolean {
    if (this.visible) this.hide();
    else this.show();
    return this.visible;
  }

  isVisible(): boolean {
    return this.visible;
  }

  enqueueNotice(notice: DanmakuNotice): void {
    if (this.disposed) return;
    this.scheduleNotice(notice);
  }

  clearNotices(prefix?: string): void {
    for (const [id, notice] of this.notices) {
      if (prefix && !id.startsWith(prefix)) continue;
      notice.anim.cancel();
    }
  }

  start(): void {
    if (this.disposed || this.running) return;
    if (this.memos.length === 0) return;
    this.running = true;
    this.runCycle();
  }

  stop(): void {
    this.running = false;
    if (this.cycleTimer !== null) {
      window.clearTimeout(this.cycleTimer);
      this.cycleTimer = null;
    }
    this.active.forEach((a) => a.cancel());
    this.active.clear();
    this.notices.clear();
    this.container.replaceChildren();
  }

  restart(): void {
    this.stop();
    if (this.visible) this.start();
  }

  dispose(): void {
    this.disposed = true;
    this.stop();
    this.resizeObserver.disconnect();
  }

  private applyVisibility(): void {
    if (this.visible) {
      this.container.classList.remove('hidden');
    } else {
      this.container.classList.add('hidden');
    }
  }

  private computeLanes(): void {
    const viewportH = window.innerHeight || document.documentElement.clientHeight;
    const rowHeight = this.settings.defaultFontSize + LANE_PADDING * 2;
    const count = Math.max(1, Math.floor(viewportH / rowHeight) - 1);
    const lanes: Lane[] = [];
    for (let i = 0; i < count; i++) {
      lanes.push({
        freeAt: 0,
        top: 40 + i * rowHeight,
      });
    }
    this.lanes = lanes;
  }

  private runCycle(): void {
    if (!this.running || this.disposed) return;
    const now = performance.now();
    const memos = shuffle([...this.memos]);
    let maxEndTime = now;

    for (const memo of memos) {
      const schedule = this.scheduleMemo(memo, now);
      if (schedule !== null) {
        maxEndTime = Math.max(maxEndTime, schedule);
      }
    }

    const cycleDuration = Math.max(1000, maxEndTime - now + 500);
    if (this.loop) {
      this.cycleTimer = window.setTimeout(() => this.runCycle(), cycleDuration);
    } else {
      this.cycleTimer = window.setTimeout(() => {
        this.running = false;
      }, cycleDuration);
    }
  }

  /** Schedule a single memo onto the earliest free lane; returns end time (ms). */
  private scheduleMemo(memo: Memo, baseNow: number): number | null {
    if (this.lanes.length === 0) return null;
    const lane = this.lanes.reduce((a, b) => (a.freeAt <= b.freeAt ? a : b));
    const startAt = Math.max(lane.freeAt, baseNow);
    const delay = Math.max(0, startAt - baseNow);

    const item = document.createElement('span');
    item.className = 'zl-item';
    item.textContent = memo.text;
    const fontSize = memo.fontSize ?? this.settings.defaultFontSize;
    const color = memo.color ?? this.settings.defaultColor;
    const fontKey = memo.fontFamily ?? this.settings.defaultFontFamily;
    const speed = DANMAKU_SPEED_PX_PER_SEC;
    item.style.fontSize = fontSize + 'px';
    item.style.color = color;
    item.style.fontFamily = resolveFontStack(fontKey);
    item.style.top = lane.top + 'px';
    this.container.appendChild(item);

    const viewportW = window.innerWidth || document.documentElement.clientWidth;
    const itemWidth = Math.max(40, item.getBoundingClientRect().width);
    const duration = ((viewportW + itemWidth) / speed) * 1000;
    const leaveLeadMs = (itemWidth / speed) * 1000 + 150;

    const anim = item.animate(
      [
        { transform: `translate3d(${viewportW}px, 0, 0)` },
        { transform: `translate3d(${-itemWidth}px, 0, 0)` },
      ],
      {
        duration,
        delay,
        easing: 'linear',
        fill: 'forwards',
      },
    );
    this.active.add(anim);
    item.addEventListener('mouseenter', () => anim.pause());
    item.addEventListener('mouseleave', () => {
      if (anim.playState === 'paused') anim.play();
    });
    anim.onfinish = () => {
      this.active.delete(anim);
      item.remove();
    };
    anim.oncancel = () => {
      this.active.delete(anim);
      item.remove();
    };

    lane.freeAt = startAt + leaveLeadMs;
    return startAt + duration;
  }

  private scheduleNotice(notice: DanmakuNotice): void {
    if (this.lanes.length === 0) this.computeLanes();
    if (this.lanes.length === 0) return;
    this.clearNotices(notice.id);

    const lane = this.lanes.reduce((a, b) => (a.freeAt <= b.freeAt ? a : b));
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'zl-item zl-notice';
    item.textContent = notice.text;
    item.dataset.noticeId = notice.id;
    item.style.fontSize = Math.max(16, this.settings.defaultFontSize) + 'px';
    item.style.color = '#ffffff';
    item.style.fontFamily = resolveFontStack(this.settings.defaultFontFamily);
    item.style.top = lane.top + 'px';
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      notice.onClick?.();
    });
    this.container.appendChild(item);

    const viewportW = window.innerWidth || document.documentElement.clientWidth;
    const itemWidth = Math.max(80, item.getBoundingClientRect().width);
    const duration = ((viewportW + itemWidth) / DANMAKU_SPEED_PX_PER_SEC) * 1000;
    const leaveLeadMs = (itemWidth / DANMAKU_SPEED_PX_PER_SEC) * 1000 + 150;

    const anim = item.animate(
      [
        { transform: `translate3d(${viewportW}px, 0, 0)` },
        { transform: `translate3d(${-itemWidth}px, 0, 0)` },
      ],
      {
        duration,
        easing: 'linear',
        fill: 'forwards',
      },
    );
    this.active.add(anim);
    this.notices.set(notice.id, { item, anim });
    anim.onfinish = () => {
      this.active.delete(anim);
      this.notices.delete(notice.id);
      item.remove();
    };
    anim.oncancel = () => {
      this.active.delete(anim);
      this.notices.delete(notice.id);
      item.remove();
    };

    lane.freeAt = performance.now() + leaveLeadMs;
  }
}

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
