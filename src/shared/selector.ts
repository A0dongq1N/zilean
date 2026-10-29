const SKIP_TAGS = new Set(['HTML', 'BODY', 'HEAD', 'SCRIPT', 'STYLE', 'LINK']);

export function isPickableElement(el: Element | null): el is Element {
  if (!el || SKIP_TAGS.has(el.tagName)) return false;
  if (el.id === 'zilean-root-host' || el.closest('#zilean-root-host')) return false;
  return true;
}

export function describeElement(el: Element): string {
  const tag = el.tagName.toLowerCase();
  const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 24);
  if (text) return `${tag} · ${text}`;
  if (el.id) return `${tag}#${el.id}`;
  return tag;
}

export function buildSelector(el: Element, root: ParentNode = document): string {
  if (el.id) {
    const byId = `#${cssEscape(el.id)}`;
    if (count(root, byId) === 1) return byId;
  }

  const parts: string[] = [];
  let node: Element | null = el;
  while (node && node.nodeType === 1 && !SKIP_TAGS.has(node.tagName)) {
    if (node.id && count(root, `#${cssEscape(node.id)}`) === 1) {
      parts.unshift(`#${cssEscape(node.id)}`);
      break;
    }
    let part = node.tagName.toLowerCase();
    const parent = node.parentElement;
    if (parent) {
      const same = [...parent.children].filter((child) => child.tagName === node!.tagName);
      if (same.length > 1) {
        part += `:nth-of-type(${same.indexOf(node) + 1})`;
      }
    }
    parts.unshift(part);
    node = node.parentElement;
    if (parts.length >= 8) break;
  }
  return parts.join(' > ');
}

export function querySelectorSafe(selector: string, root: ParentNode = document): Element[] {
  const raw = selector.trim();
  if (!raw) return [];
  try {
    return [...root.querySelectorAll(raw)].filter((el) => isPickableElement(el));
  } catch {
    return [];
  }
}

function count(root: ParentNode, selector: string): number {
  try {
    return root.querySelectorAll(selector).length;
  } catch {
    return 0;
  }
}

function cssEscape(value: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return CSS.escape(value);
  }
  return value.replace(/[^a-zA-Z0-9_-]/g, (ch) => `\\${ch}`);
}
