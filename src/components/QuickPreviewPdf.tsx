import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

/** Render one page at a time to keep large documents responsive. */
export function QuickPreviewPdf({ url }: { url: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const container = useRef<HTMLDivElement>(null);
  const [document, setDocument] = useState<PDFDocumentProxy | null>(null);
  const [page, setPage] = useState(1);
  const [width, setWidth] = useState(700);
  const [error, setError] = useState("");

  useEffect(() => {
    let disposed = false;
    let loadingTask: { destroy: () => Promise<void> } | undefined;
    setDocument(null); setPage(1); setError("");
    void (async () => {
      try {
        const pdf = await import("pdfjs-dist");
        if (disposed) return;
        pdf.GlobalWorkerOptions.workerSrc = workerUrl;
        const task = pdf.getDocument({ url, useSystemFonts: true });
        loadingTask = task;
        const result = await task.promise;
        if (!disposed) setDocument(result);
      } catch {
        if (!disposed) setError("This PDF could not be displayed. It may be damaged or password protected.");
      }
    })();
    return () => { disposed = true; void loadingTask?.destroy(); };
  }, [url]);

  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(200, entry.contentRect.width - 32)));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!document || !canvas.current) return;
    let disposed = false;
    let task: RenderTask | undefined;
    void (async () => {
      try {
        const pdfPage = await document.getPage(page);
        if (disposed || !canvas.current) return;
        const base = pdfPage.getViewport({ scale: 1 });
        const scale = Math.min(2, width / base.width);
        const viewport = pdfPage.getViewport({ scale });
        const target = canvas.current;
        target.width = Math.ceil(viewport.width);
        target.height = Math.ceil(viewport.height);
        const context = target.getContext("2d");
        if (!context) throw new Error("Canvas unavailable");
        task = pdfPage.render({ canvas: target, canvasContext: context, viewport });
        await task.promise;
      } catch (err) {
        if (!disposed && (err as Error)?.name !== "RenderingCancelledException") setError("This PDF page could not be displayed.");
      }
    })();
    return () => { disposed = true; task?.cancel(); };
  }, [document, page, width]);

  return (
    <div className="qpo-pdf" ref={container}>
      {error ? <p className="qpo-unsupported-hint" role="alert">{error}</p> : (
        <>
          <div className="qpo-pdf-controls" aria-label="PDF page controls">
            <button type="button" disabled={!document || page <= 1} onClick={() => setPage(p => p - 1)}>Previous</button>
            <span aria-live="polite">{document ? `Page ${page} of ${document.numPages}` : "Loading PDF…"}</span>
            <button type="button" disabled={!document || page >= document.numPages} onClick={() => setPage(p => p + 1)}>Next</button>
          </div>
          <div className="qpo-pdf-scroll"><canvas ref={canvas} aria-label={`PDF page ${page}`} /></div>
        </>
      )}
    </div>
  );
}
