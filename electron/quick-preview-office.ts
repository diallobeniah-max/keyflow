import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface OfficeBounds { x: number; y: number; width: number; height: number }
export interface OfficeKeys { key: number; modifiers: number; escape: boolean }

/** One isolated Windows preview handler; never pass a path through a shell. */
export class OfficePreviewProcess {
  private static retirement: Promise<void> = Promise.resolve();
  private child: ChildProcessWithoutNullStreams | null = null;
  private starting = false;
  private generation = 0;
  private pending: ((ready: boolean) => void) | null = null;
  private timer: NodeJS.Timeout | null = null;
  private output = '';

  constructor(private readonly onClose: () => void = () => {}, private readonly onExit: () => void = () => {}) {}

  async start(parent: number, path: string, bounds: OfficeBounds, keys: OfficeKeys = { key: 0x20, modifiers: 0, escape: true }): Promise<boolean> {
    if (process.platform !== 'win32' || this.child || this.starting || !Number.isSafeInteger(parent) || parent <= 0) return false;
    const packaged = process.resourcesPath && join(process.resourcesPath, 'quick-preview', 'office-handler-worker.ps1');
    const development = join(dirname(fileURLToPath(import.meta.url)), '..', 'electron', 'office-handler-worker.ps1');
    const script = packaged && existsSync(packaged) ? packaged : development;
    if (!existsSync(script)) return false;
    const generation = ++this.generation;
    this.starting = true;
    // Another preview may be stopped while this start is waiting. Wait for the
    // latest retirement as well, so its COM handler has time to shut down.
    let retirement: Promise<void>;
    do {
      retirement = OfficePreviewProcess.retirement;
      await retirement;
    } while (retirement !== OfficePreviewProcess.retirement && generation === this.generation);
    if (generation !== this.generation) return false;
    this.starting = false;
    return new Promise(resolve => {
      this.pending = resolve;
      this.output = '';
      const child = spawn('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-STA', '-File', script], { windowsHide: true, stdio: 'pipe' });
      this.child = child;
      this.timer = setTimeout(() => { this.finish(false); this.stop(); }, 20000);
      child.stderr.resume();
      child.stdout.setEncoding('utf8');
      child.stdout.on('data', (chunk: string) => {
        if (this.child !== child) return;
        this.output += chunk;
        if (this.output.length > 4096) { this.finish(false); this.stop(); return; }
        for (let end = this.output.indexOf('\n'); end >= 0; end = this.output.indexOf('\n')) {
          const line = this.output.slice(0, end).trim(); this.output = this.output.slice(end + 1);
          if (line === 'READY') this.finish(true);
          else if (line === 'CLOSE') this.onClose();
          else if (line === 'ERROR') { this.finish(false); this.stop(); }
        }
      });
      child.on('error', () => { if (this.child === child) this.stop(); });
      child.stdin.on('error', () => { if (this.child === child) this.stop(); });
      child.on('exit', () => { if (this.child === child) { this.child = null; this.finish(false); this.onExit(); } });
      child.stdin.write(JSON.stringify({ parent, path, ...bounds, ...keys }) + '\n');
    });
  }

  resize(bounds: OfficeBounds): void {
    if (!this.child || this.child.stdin.destroyed) return;
    const values = [bounds.x, bounds.y, bounds.width, bounds.height];
    if (!values.every(Number.isSafeInteger) || bounds.width < 1 || bounds.height < 1) return;
    this.child.stdin.write(`R ${values.join(' ')}\n`);
  }

  focus(): void { if (this.child && !this.child.stdin.destroyed) this.child.stdin.write('F\n'); }

  stop(): void {
    this.generation++;
    this.starting = false;
    const child = this.child; this.child = null;
    this.finish(false);
    if (!child) return;
    if (!child.stdin.destroyed) child.stdin.end('Q\n');
    const retired = new Promise<void>(resolve => {
      let settled = false;
      const finish = () => { if (settled) return; settled = true; clearTimeout(timer); resolve(); };
      const timer = setTimeout(() => { if (child.exitCode === null) child.kill(); finish(); }, 1000);
      timer.unref();
      if (child.exitCode !== null) finish(); else child.once('exit', finish);
    });
    OfficePreviewProcess.retirement = Promise.all([OfficePreviewProcess.retirement, retired]).then(() => {});
  }

  private finish(ready: boolean): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const resolve = this.pending; this.pending = null;
    resolve?.(ready);
  }
}
