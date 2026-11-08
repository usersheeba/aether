import type { Handler as PagedHandler } from 'pagedjs';

interface PagedBreakToken {
  node?: Node | null;
}

interface PagedChunker {
  source: DocumentFragment;
}

function findAncestors(element: Element, selector: string): Element[] {
  const ancestors: Element[] = [];
  let current: Element | null = element;

  while (current) {
    if (current.matches(selector)) ancestors.unshift(current);
    current = current.parentElement;
  }

  return ancestors;
}

function nextSignificantNode(node: Node, limit: Node): Node | null {
  let sibling = node.nextSibling;
  while (sibling) {
    if (sibling === limit) return null;
    if (sibling.nodeType !== Node.COMMENT_NODE && !(sibling.nodeType === Node.TEXT_NODE && !sibling.textContent?.trim())) {
      return sibling;
    }
    sibling = sibling.nextSibling;
  }

  let parent = node.parentNode;
  while (parent && parent !== limit) {
    sibling = parent.nextSibling;
    while (sibling) {
      if (sibling === limit) return null;
      if (sibling.nodeType !== Node.COMMENT_NODE && !(sibling.nodeType === Node.TEXT_NODE && !sibling.textContent?.trim())) {
        return sibling;
      }
      sibling = sibling.nextSibling;
    }
    parent = parent.parentNode;
  }

  return null;
}

export function createRepeatTableHeadersHandler(BaseHandler: typeof PagedHandler) {
  return class RepeatTableHeadersHandler extends BaseHandler {
    private chunker: PagedChunker | null = null;
    private splitTableRefs: string[] = [];

    afterPageLayout(
      _pageElement: HTMLElement,
      _page: unknown,
      breakToken: PagedBreakToken | null | undefined,
      chunker: PagedChunker
    ): void {
      this.chunker = chunker;
      this.splitTableRefs = [];
      if (!breakToken?.node || breakToken.node.nodeType !== Node.ELEMENT_NODE) return;

      const node = breakToken.node as Element;
      const tables = findAncestors(node, 'table');
      if (node.matches('table')) tables.push(node);
      if (!tables.length) return;

      this.splitTableRefs = tables
        .map((table) => table.getAttribute('data-ref'))
        .filter((ref): ref is string => ref !== null);

      const header = node.matches('thead') ? node : node.closest('thead');
      const lastHeaderChild = header?.lastChild;
      if (lastHeaderChild) {
        const afterHeader = nextSignificantNode(lastHeaderChild, chunker.source);
        if (afterHeader) breakToken.node = afterHeader;
      }
    }

    layout(rendered: HTMLElement): void {
      if (!this.chunker) return;

      for (const ref of this.splitTableRefs) {
        const renderedTable = Array.from(rendered.querySelectorAll<HTMLTableElement>('table')).find(
          (table) => table.getAttribute('data-ref') === ref
        );
        if (!renderedTable || renderedTable.hasAttribute('data-repeated-headers')) continue;
        renderedTable.setAttribute('data-repeated-headers', 'true');

        const sourceTable = Array.from(this.chunker.source.querySelectorAll<HTMLTableElement>('table')).find(
          (table) => table.getAttribute('data-ref') === ref
        );
        const sourceHeader = sourceTable?.querySelector('thead');
        if (!sourceTable || !sourceHeader || renderedTable.querySelector('thead')) continue;

        const sourceColgroup = sourceTable.querySelector('colgroup');
        if (sourceColgroup) renderedTable.insertBefore(sourceColgroup.cloneNode(true), renderedTable.firstChild);
        renderedTable.insertBefore(sourceHeader.cloneNode(true), renderedTable.firstChild);
      }
    }
  };
}
