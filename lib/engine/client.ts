import type { Request } from './worker';

const TERMINAL = new Set(['mc', 'fragility', 'optimize', 'compare', 'error']);

/**
 * One worker per kind of job. Sending while a job is still running terminates
 * it: the newer scenario makes the older answer useless, and killing the worker
 * is the only way to stop a tight loop.
 */
export class Lane {
  private w: Worker | null = null;
  private busy = false;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  send(req: Request, on: (msg: any) => void) {
    if (this.busy) this.dispose();
    this.w ??= new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    this.busy = true;
    this.w.onmessage = (e) => {
      if (TERMINAL.has(e.data.type)) this.busy = false;
      on(e.data);
    };
    this.w.onerror = (e) => {
      this.busy = false;
      on({ type: 'error', message: e.message || 'engine worker crashed' });
    };
    this.w.postMessage(req);
  }

  dispose() {
    this.w?.terminate();
    this.w = null;
    this.busy = false;
  }
}
