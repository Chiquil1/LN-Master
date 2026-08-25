export function generateSelector(element: Element): string {
  if (!element) return '';

  const tagName = element.tagName.toLowerCase();

  if (element.id) {
    return `#${escapeSelector(element.id)}`;
  }

  const classes = Array.from(element.classList)
    .filter(
      c => !c.match(/^\d+$/) && !c.match(/^[a-f0-9]{8,}$/i) && c.length > 1,
    )
    .slice(0, 3);

  if (classes.length > 0) {
    return `${tagName}.${classes.join('.')}`;
  }

  const attrs = [
    'data-id',
    'data-chapter',
    'data-novel',
    'data-testid',
    'role',
    'aria-label',
  ];
  for (const attr of attrs) {
    const value = element.getAttribute(attr);
    if (value) {
      return `${tagName}[${attr}="${escapeAttr(value)}"]`;
    }
  }

  const nthChild = getNthChildSelector(element);
  if (nthChild) {
    return `${tagName}:nth-child(${nthChild})`;
  }

  return tagName;
}

function escapeSelector(str: string): string {
  return str.replace(/([!"#$%&'()*+,./:;<=>?@[\\\]^`{|}~])/g, '\\$1');
}

function escapeAttr(str: string): string {
  return str.replace(/"/g, '\\"');
}

function getNthChildSelector(element: Element): number | null {
  const parent = element.parentElement;
  if (!parent) return null;

  const siblings = Array.from(parent.children).filter(
    el => el.tagName === element.tagName,
  );
  const index = siblings.indexOf(element);
  return index >= 0 ? index + 1 : null;
}

export function generateSelectorPath(element: Element, maxDepth = 5): string {
  const path: string[] = [];
  let current: Element | null = element;
  let depth = 0;

  while (current && depth < maxDepth) {
    const selector = generateSelector(current);
    if (selector) path.unshift(selector);

    if (current.id) break;

    current = current.parentElement;
    depth++;
  }

  return path.join(' > ');
}

export function findCommonAncestor(elements: Element[]): Element | null {
  if (elements.length === 0) return null;
  if (elements.length === 1) return elements[0].parentElement;

  const paths = elements.map(el => {
    const path: Element[] = [];
    let current: Element | null = el;
    while (current) {
      path.unshift(current);
      current = current.parentElement;
    }
    return path;
  });

  let ancestor: Element | null = null;
  const minLength = Math.min(...paths.map(p => p.length));

  for (let i = 0; i < minLength; i++) {
    const candidate = paths[0][i];
    if (paths.every(p => p[i] === candidate)) {
      ancestor = candidate;
    } else {
      break;
    }
  }

  return ancestor;
}

export function generateContainerSelector(elements: Element[]): string {
  const ancestor = findCommonAncestor(elements);
  if (!ancestor) return '';

  const selector = generateSelector(ancestor);
  const childSelectors = elements.map(el => {
    const relPath = getRelativePath(ancestor, el);
    return relPath || generateSelector(el);
  });

  const uniqueChildren = [...new Set(childSelectors)];
  if (uniqueChildren.length === 1) {
    return `${selector} > ${uniqueChildren[0]}`;
  }

  return selector;
}

function getRelativePath(ancestor: Element, target: Element): string | null {
  const path: string[] = [];
  let current: Element | null = target;

  while (current && current !== ancestor) {
    path.unshift(generateSelector(current));
    current = current.parentElement;
  }

  if (current !== ancestor) return null;
  return path.join(' > ');
}

export function scoreSelector(
  selector: string,
  targetElements: Element[],
  allElements: Element[],
): number {
  let matches = 0;
  let falsePositives = 0;

  for (const el of targetElements) {
    if (matchesSelector(el, selector)) matches++;
  }

  for (const el of allElements) {
    if (!targetElements.includes(el) && matchesSelector(el, selector)) {
      falsePositives++;
    }
  }

  return matches * 10 - falsePositives * 5;
}

function matchesSelector(element: Element, selector: string): boolean {
  try {
    return element.matches(selector);
  } catch {
    return false;
  }
}

export function findBestSelector(
  targetElements: Element[],
  allElements: Element[],
): string {
  if (targetElements.length === 0) return '';

  const candidates = new Set<string>();

  for (const el of targetElements) {
    candidates.add(generateSelector(el));
    candidates.add(generateSelectorPath(el));
  }

  let bestSelector = '';
  let bestScore = -Infinity;

  for (const selector of candidates) {
    const score = scoreSelector(selector, targetElements, allElements);
    if (score > bestScore) {
      bestScore = score;
      bestSelector = selector;
    }
  }

  return bestSelector;
}

export function getSelectorVariants(baseSelector: string): string[] {
  const variants = [baseSelector];

  if (baseSelector.startsWith('#')) {
    const id = baseSelector.slice(1);
    variants.push(`[id="${id}"]`);
  }

  if (baseSelector.includes('.')) {
    const [tag, ...classes] = baseSelector.split('.');
    for (let i = 1; i <= classes.length; i++) {
      variants.push(`${tag}.${classes.slice(0, i).join('.')}`);
    }
  }

  if (baseSelector.includes('[')) {
    const attrMatch = baseSelector.match(/\[([^\]=]+)="([^"]+)"\]/);
    if (attrMatch) {
      variants.push(`[${attrMatch[1]}="${attrMatch[2]}"]`);
    }
  }

  return [...new Set(variants)];
}
