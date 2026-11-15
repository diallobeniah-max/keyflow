import yauzl from "yauzl";
import { SaxesParser } from "saxes";
import { StringDecoder } from "node:string_decoder";
import type { Readable } from "node:stream";

const WORD_NAMESPACES = new Set([
  "http://schemas.openxmlformats.org/wordprocessingml/2006/main",
  "http://purl.oclc.org/ooxml/wordprocessingml/main",
]);
const MAX_XML = 8 * 1024 * 1024;
const MAX_TEXT = 512 * 1024;

/** Extract plain text only. DOCX content is never rendered as HTML or executed. */
export function readDocxText(path: string, signal?: AbortSignal): Promise<{ text: string; truncated: boolean } | null> {
  if (signal?.aborted) return Promise.resolve(null);
  return new Promise(resolve => {
    let zip: yauzl.ZipFile | null = null, input: Readable | null = null, done = false, seen = 0;
    const finish = (result: { text: string; truncated: boolean } | null) => {
      if (done) return;
      done = true; clearTimeout(timer); signal?.removeEventListener("abort", abort);
      input?.destroy(); zip?.close(); resolve(result);
    };
    const abort = () => finish(null);
    const timer = setTimeout(abort, 10000);
    signal?.addEventListener("abort", abort, {once:true});
    yauzl.open(path, {lazyEntries:true,autoClose:false,decodeStrings:true,strictFileNames:true}, (error, file) => {
      if (done) { file?.close(); return; }
      if (error || !file) { finish(null); return; }
      zip = file;
      file.on("error", () => finish(null));
      file.on("end", () => finish(null));
      file.on("entry", entry => {
        if (done) return;
        if (++seen > 10000) { finish(null); return; }
        if (entry.fileName !== "word/document.xml") { file.readEntry(); return; }
        if (entry.uncompressedSize > MAX_XML) { finish(null); return; }
        file.openReadStream(entry, (streamError, stream) => {
          if (done) { stream?.destroy(); return; }
          if (streamError || !stream) { finish(null); return; }
          input = stream;
          let text = "", inText = false, bytes = 0, truncated = false;
          const decoder = new StringDecoder("utf8");
          const parser = new SaxesParser({xmlns:true});
          parser.on("doctype", () => finish(null));
          const append = (value: string) => {
            const remaining = MAX_TEXT - text.length;
            if (value.length > remaining) truncated = true;
            if (remaining > 0) text += value.slice(0, remaining);
          };
          parser.on("opentag", tag => {
            if (!WORD_NAMESPACES.has(tag.uri)) return;
            if (tag.local === "t") inText = true;
            else if (tag.local === "tab") append("\t");
            else if (tag.local === "br" || tag.local === "cr") append("\n");
          });
          parser.on("text", value => { if (inText) append(value); });
          parser.on("closetag", tag => {
            if (!WORD_NAMESPACES.has(tag.uri)) return;
            if (tag.local === "t") inText = false;
            else if (tag.local === "p") append("\n");
            else if (tag.local === "tc") append("\t");
          });
          parser.on("error", () => finish(null));
          stream.on("error", () => finish(null));
          stream.on("data", (chunk: Buffer) => {
            if (done) return;
            bytes += chunk.length;
            if (bytes > MAX_XML) { finish(null); return; }
            try { parser.write(decoder.write(chunk)); } catch { finish(null); }
          });
          stream.on("end", () => {
            if (done) return;
            try { parser.write(decoder.end()).close(); if (!done) finish({text:text.trimEnd(), truncated}); } catch { finish(null); }
          });
        });
      });
      file.readEntry();
    });
  });
}
