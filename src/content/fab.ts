import type { FabEdge } from '@shared/types';

const FAB_SIZE = 44;
const EDGE_MARGIN = 0;
const DRAG_THRESHOLD_PX = 4;
const COLLAPSE_DELAY_MS = 2200;

export interface FabPosition {
  edge: FabEdge;
  topRatio: number;
}

/** Viewport geometry of the button, used to anchor menus and panels next to it. */
export interface FabAnchor {
  edge: FabEdge;
  top: number;
  size: number;
}

export interface FloatingButtonOptions {
  edge: FabEdge;
  topRatio: number;
  autoHide: boolean;
  onClick(): void;
  onMoved(pos: FabPosition): void;
  onAnchorChange(anchor: FabAnchor): void;
}

/**
 * Draggable floating action button.
 *
 * The button snaps to the nearest viewport edge after a drag and, when auto-hide
 * is on, tucks itself mostly off-screen while idle so it stops covering page
 * content. Hovering, focusing or opening a panel brings it back.
 *
 * Vertical position is stored as a ratio so it survives viewport resizes.
 */
export class FloatingButton {
  private el: HTMLButtonElement;
  private opts: FloatingButtonOptions;
  private edge: FabEdge;
  private topRatio: number;
  private autoHide: boolean;
  private top = 0;
  private left = 0;
  private dragging = false;
  private movedDuringDrag = false;
  private pointerId: number | null = null;
  private grabOffsetX = 0;
  private grabOffsetY = 0;
  private pointerStartX = 0;
  private pointerStartY = 0;
  private hovered = false;
  private pinned = false;
  private collapseTimer: number | null = null;

  constructor(opts: FloatingButtonOptions) {
    this.opts = opts;
    this.edge = opts.edge;
    this.topRatio = clamp(opts.topRatio, 0, 1);
    this.autoHide = opts.autoHide;

    this.el = document.createElement('button');
    this.el.type = 'button';
    this.el.className = 'zl-fab';
    this.el.innerHTML = `
      <svg class="zl-fab-mark" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M7 7h10L8 17h10" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    `;
    this.el.title = '打开 Zilean 侧边栏（可拖动）';

    this.el.addEventListener('pointerdown', (e) => this.onPointerDown(e));
    this.el.addEventListener('pointermove', (e) => this.onPointerMove(e));
    this.el.addEventListener('pointerup', (e) => this.onPointerUp(e));
    this.el.addEventListener('pointercancel', () => this.endDrag());

    this.el.addEventListener('click', (e) => {
      e.stopPropagation();
      // A drag ends with a click event too; ignore it so dragging never opens the menu.
      if (this.movedDuringDrag) {
        this.movedDuringDrag = false;
        return;
      }
      this.opts.onClick();
    });

    this.el.addEventListener('pointerenter', () => {
      this.hovered = true;
      this.expand();
    });
    this.el.addEventListener('pointerleave', () => {
      this.hovered = false;
      this.scheduleCollapse();
    });
    this.el.addEventListener('focus', () => this.expand());
    this.el.addEventListener('blur', () => this.scheduleCollapse());

    window.addEventListener('resize', () => this.applyPosition());

    this.applyPosition();
    this.scheduleCollapse();
  }

  get element(): HTMLButtonElement {
    return this.el;
  }

  anchor(): FabAnchor {
    return { edge: this.edge, top: this.top, size: FAB_SIZE };
  }

  setAutoHide(autoHide: boolean): void {
    if (this.autoHide === autoHide) return;
    this.autoHide = autoHide;
    if (autoHide) this.scheduleCollapse();
    else this.expand();
  }

  setPosition(pos: FabPosition): void {
    if (this.dragging) return;
    if (this.edge === pos.edge && Math.abs(this.topRatio - pos.topRatio) < 0.001) return;
    this.edge = pos.edge;
    this.topRatio = clamp(pos.topRatio, 0, 1);
    this.applyPosition();
  }

  /** Keep the button fully visible while a menu or panel anchored to it is open. */
  setPinned(pinned: boolean): void {
    this.pinned = pinned;
    if (pinned) this.expand();
    else this.scheduleCollapse();
  }

  private onPointerDown(e: PointerEvent): void {
    if (e.button !== 0) return;
    this.pointerId = e.pointerId;
    this.dragging = true;
    this.movedDuringDrag = false;
    this.pointerStartX = e.clientX;
    this.pointerStartY = e.clientY;
    this.grabOffsetX = e.clientX - this.left;
    this.grabOffsetY = e.clientY - this.top;
    this.el.setPointerCapture(e.pointerId);
    this.el.classList.add('zl-fab-dragging');
    this.expand();
  }

  private onPointerMove(e: PointerEvent): void {
    if (!this.dragging || e.pointerId !== this.pointerId) return;
    if (!this.movedDuringDrag) {
      const dx = Math.abs(e.clientX - this.pointerStartX);
      const dy = Math.abs(e.clientY - this.pointerStartY);
      if (dx < DRAG_THRESHOLD_PX && dy < DRAG_THRESHOLD_PX) return;
      this.movedDuringDrag = true;
    }

    e.preventDefault();
    this.left = clamp(e.clientX - this.grabOffsetX, 0, this.viewportW() - FAB_SIZE);
    this.top = clamp(e.clientY - this.grabOffsetY, 0, this.viewportH() - FAB_SIZE);
    this.el.style.left = this.left + 'px';
    this.el.style.top = this.top + 'px';
    this.opts.onAnchorChange(this.anchor());
  }

  private onPointerUp(e: PointerEvent): void {
    if (!this.dragging || e.pointerId !== this.pointerId) return;
    if (this.movedDuringDrag) {
      this.edge = this.left + FAB_SIZE / 2 < this.viewportW() / 2 ? 'left' : 'right';
      this.topRatio = clamp(this.top / Math.max(1, this.viewportH() - FAB_SIZE), 0, 1);
      this.opts.onMoved({ edge: this.edge, topRatio: this.topRatio });
    }
    this.endDrag();
    this.applyPosition();
  }

  private endDrag(): void {
    if (this.pointerId !== null && this.el.hasPointerCapture(this.pointerId)) {
      this.el.releasePointerCapture(this.pointerId);
    }
    this.pointerId = null;
    this.dragging = false;
    this.el.classList.remove('zl-fab-dragging');
    this.scheduleCollapse();
  }

  private applyPosition(): void {
    const maxTop = Math.max(0, this.viewportH() - FAB_SIZE - EDGE_MARGIN / 2);
    this.top = clamp(this.topRatio * (this.viewportH() - FAB_SIZE), EDGE_MARGIN / 2, maxTop);
    this.left =
      this.edge === 'left' ? EDGE_MARGIN : Math.max(0, this.viewportW() - FAB_SIZE - EDGE_MARGIN);

    this.el.style.left = this.left + 'px';
    this.el.style.top = this.top + 'px';
    this.el.classList.toggle('zl-fab-edge-left', this.edge === 'left');
    this.el.classList.toggle('zl-fab-edge-right', this.edge === 'right');
    this.opts.onAnchorChange(this.anchor());
  }

  private expand(): void {
    this.clearCollapseTimer();
    this.el.classList.remove('zl-fab-collapsed');
  }

  private scheduleCollapse(): void {
    this.clearCollapseTimer();
    if (!this.autoHide || this.pinned || this.hovered || this.dragging) return;
    this.collapseTimer = window.setTimeout(() => {
      this.collapseTimer = null;
      this.el.classList.add('zl-fab-collapsed');
    }, COLLAPSE_DELAY_MS);
  }

  private clearCollapseTimer(): void {
    if (this.collapseTimer === null) return;
    window.clearTimeout(this.collapseTimer);
    this.collapseTimer = null;
  }

  private viewportW(): number {
    return window.innerWidth || document.documentElement.clientWidth;
  }

  private viewportH(): number {
    return window.innerHeight || document.documentElement.clientHeight;
  }
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}
