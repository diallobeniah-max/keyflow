import yauzl from "yauzl";

export interface PreviewArchiveEntry { name: string; size: number; directory: boolean }
export interface PreviewArchive { entries: PreviewArchiveEntry[]; total: number; truncated: boolean }

/** Read only the central directory; never extract or open archive members. */
export function readZipListing(path: string, signal?: AbortSignal): Promise<PreviewArchive | null> {
  if (signal?.aborted) return Promise.resolve(null);
  return new Promise(resolve => {
    let archive: yauzl.ZipFile | null = null, done = false;
    const entries: PreviewArchiveEntry[] = [];
    const finish = (result: PreviewArchive | null) => {
      if (done) return;
      done = true; clearTimeout(timer); signal?.removeEventListener("abort", abort);
      archive?.close(); resolve(result);
    };
    const abort = () => finish(null);
    const timer = setTimeout(abort, 10000);
    signal?.addEventListener("abort", abort, {once:true});
    yauzl.open(path, {lazyEntries:true, autoClose:false, decodeStrings:true, strictFileNames:true}, (error, file) => {
      if (done) { file?.close(); return; }
      if (error || !file) { finish(null); return; }
      archive = file;
      file.on("error", () => finish(null));
      file.on("end", () => finish({entries, total:file.entryCount, truncated:entries.length < file.entryCount}));
      file.on("entry", entry => {
        if (done) return;
        entries.push({name:entry.fileName.slice(0,1024), size:entry.uncompressedSize, directory:entry.fileName.endsWith("/")});
        if (entries.length >= 1000) finish({entries, total:file.entryCount, truncated:entries.length < file.entryCount});
        else file.readEntry();
      });
      file.readEntry();
    });
  });
}
