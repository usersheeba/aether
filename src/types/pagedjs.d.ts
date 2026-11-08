declare module 'pagedjs' {
  export interface PagedFlow {
    total: number;
  }

  export class Handler {
    constructor(chunker?: unknown, polisher?: unknown, caller?: unknown);
  }

  export class Previewer {
    constructor(options?: Record<string, unknown>);
    chunker: { stop: () => void };
    polisher: { destroy: () => void };
    preview(
      content: string | DocumentFragment | HTMLElement,
      stylesheets: Array<string | Record<string, string>>,
      renderTo: HTMLElement
    ): Promise<PagedFlow>;
  }

  export function registerHandlers(...handlers: Array<typeof Handler>): void;
}
