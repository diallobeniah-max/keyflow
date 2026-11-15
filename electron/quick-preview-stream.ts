import { createReadStream, type ReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { Readable } from "node:stream";

/** The protocol is installed only on the isolated preview session. */
export class PreviewStream {
  private selected: { token: string; path: string; mime: string } | null = null;
  private active = new Set<ReadStream>();
  private generation = 0;

  async select(path: string, mime: string): Promise<string> {
    this.clear();
    const token = randomBytes(32).toString("hex");
    this.selected = { token, path, mime };
    return `keyflow-preview://file/${token}`;
  }

  clear(): void {
    this.generation++;
    this.selected = null;
    for (const stream of this.active) stream.destroy(new Error("Preview changed"));
    this.active.clear();
  }

  destroy(): void { this.clear(); }

  async serve(request: Request): Promise<Response> {
    const selected = this.selected, generation = this.generation;
    if (!selected || request.url !== `keyflow-preview://file/${selected.token}` || !["GET", "HEAD"].includes(request.method)) return new Response(null, {status:404});
    try {
      const file = await stat(selected.path);
      if (selected !== this.selected || generation !== this.generation || !file.isFile()) return new Response(null, {status:404});
      const size = file.size;
      let start = 0, end = size - 1;
      const range = request.headers.get("range");
      if (range) {
        const match = /^bytes=(\d*)-(\d*)$/.exec(range);
        if (!match || (!match[1] && !match[2]) || size === 0) return new Response(null, {status:416,headers:{"Content-Range":`bytes */${size}`}});
        if (!match[1]) { const suffix = Number(match[2]); start = Math.max(0, size - suffix); }
        else { start = Number(match[1]); if (match[2]) end = Math.min(Number(match[2]), end); }
        if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start > end || start >= size) return new Response(null, {status:416,headers:{"Content-Range":`bytes */${size}`}});
      }
      const headers: Record<string, string> = {
        "Content-Type": selected.mime,
        "Content-Length": String(range ? end - start + 1 : size),
        "Accept-Ranges": "bytes", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff",
        "Access-Control-Allow-Origin": "*", "Access-Control-Expose-Headers": "Accept-Ranges, Content-Length, Content-Range",
      };
      if (range) headers["Content-Range"] = `bytes ${start}-${end}/${size}`;
      if (request.method === "HEAD" || size === 0) return new Response(null, {status:range ? 206 : 200,headers});
      const stream = createReadStream(selected.path, {start,end});
      this.active.add(stream);
      stream.on("close", () => this.active.delete(stream));
      request.signal.addEventListener("abort", () => stream.destroy(), {once:true});
      return new Response(Readable.toWeb(stream) as ReadableStream<Uint8Array>, {status:range ? 206 : 200,headers});
    } catch { return new Response(null, {status:404}); }
  }
}
