import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import { CaretLeft, CaretRight, Minus, Plus, SidebarSimple } from "@phosphor-icons/react";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

function PdfThumbnail({ document, page, selected, onSelect }: { document: PDFDocumentProxy; page:number; selected:boolean; onSelect:()=>void }) {
  const holder=useRef<HTMLButtonElement>(null);
  const canvas=useRef<HTMLCanvasElement>(null);
  const [visible,setVisible]=useState(false);
  useEffect(()=>{
    const element=holder.current;if(!element)return;
    const observer=new IntersectionObserver(([entry])=>setVisible(entry.isIntersecting),{rootMargin:'150px'});
    observer.observe(element);return()=>observer.disconnect();
  },[]);
  useEffect(()=>{
    if(!visible || !canvas.current)return;
    let disposed=false;let task:RenderTask|undefined;
    void (async()=>{try{
      const pdfPage=await document.getPage(page);if(disposed||!canvas.current)return;
      const base=pdfPage.getViewport({scale:1});const viewport=pdfPage.getViewport({scale:Math.min(1,120/base.width)});
      const target=canvas.current;target.width=Math.ceil(viewport.width);target.height=Math.ceil(viewport.height);
      const context=target.getContext('2d');if(!context)return;
      task=pdfPage.render({canvas:target,canvasContext:context,viewport});await task.promise;
    }catch{/* Individual thumbnails may fail independently of the page. */}})();
    return()=>{disposed=true;task?.cancel();};
  },[document,page,visible]);
  return <button ref={holder} type="button" className="qpo-pdf-thumb" aria-label={`Page ${page}`} aria-current={selected?'page':undefined} onClick={onSelect}>
    <canvas ref={canvas} aria-hidden="true"/><span>{page}</span>
  </button>;
}

/** Render one full page and only visible thumbnails to bound work. */
export function QuickPreviewPdf({ url }: { url:string }) {
  const canvas=useRef<HTMLCanvasElement>(null), container=useRef<HTMLDivElement>(null);
  const [document,setDocument]=useState<PDFDocumentProxy|null>(null);
  const [page,setPage]=useState(1), [width,setWidth]=useState(700), [zoom,setZoom]=useState(100);
  const [fit,setFit]=useState(true), [showPages,setShowPages]=useState(true), [error,setError]=useState('');
  useEffect(()=>{
    let disposed=false;let loadingTask:{destroy:()=>Promise<void>}|undefined;
    setDocument(null);setPage(1);setError('');setFit(true);setZoom(100);
    void (async()=>{try{
      const pdf=await import('pdfjs-dist');if(disposed)return;pdf.GlobalWorkerOptions.workerSrc=workerUrl;
      const task=pdf.getDocument({url,useSystemFonts:true});loadingTask=task;
      const result=await task.promise;if(!disposed)setDocument(result);
    }catch{if(!disposed)setError('This PDF could not be displayed. It may be damaged or password protected.')}})();
    return()=>{disposed=true;void loadingTask?.destroy()};
  },[url]);
  useEffect(()=>{
    const element=container.current;if(!element)return;
    const observer=new ResizeObserver(([entry])=>setWidth(Math.max(200,entry.contentRect.width-32)));
    observer.observe(element);return()=>observer.disconnect();
  },[]);
  useEffect(()=>{
    if(!document||!canvas.current)return;
    let disposed=false;let task:RenderTask|undefined;
    void (async()=>{try{
      const pdfPage=await document.getPage(page);if(disposed||!canvas.current)return;
      const base=pdfPage.getViewport({scale:1});
      const requested=fit?width/base.width:zoom/100;
      const scale=Math.min(3,requested,Math.sqrt(16000000/(base.width*base.height)));
      const viewport=pdfPage.getViewport({scale});const target=canvas.current;
      target.width=Math.ceil(viewport.width);target.height=Math.ceil(viewport.height);
      const context=target.getContext('2d');if(!context)throw Error('Canvas unavailable');
      task=pdfPage.render({canvas:target,canvasContext:context,viewport});await task.promise;
    }catch(err){if(!disposed&&(err as Error)?.name!=='RenderingCancelledException')setError('This PDF page could not be displayed.')}})();
    return()=>{disposed=true;task?.cancel()};
  },[document,page,width,fit,zoom]);
  const changeZoom=(delta:number)=>{setFit(false);setZoom(value=>Math.max(25,Math.min(300,value+delta)));};
  useEffect(()=>{
    const handle=(event:KeyboardEvent)=>{
      const target=event.target as HTMLElement|null;
      if(target?.isContentEditable||['INPUT','TEXTAREA','SELECT'].includes(target?.tagName??''))return;
      if(event.key==='ArrowRight'&&document){event.preventDefault();setPage(value=>Math.min(document.numPages,value+1));}
      else if(event.key==='ArrowLeft'){event.preventDefault();setPage(value=>Math.max(1,value-1));}
      else if(event.key.toLowerCase()==='w'){event.preventDefault();setFit(true);}
      else if(event.key==='+'||event.key==='='){event.preventDefault();changeZoom(25);}
      else if(event.key==='-'){event.preventDefault();changeZoom(-25);}
    };
    window.addEventListener('keydown',handle);return()=>window.removeEventListener('keydown',handle);
  },[document]);
  return <div className="qpo-pdf">
    <div className="qpo-pdf-controls" aria-label="PDF controls">
      <button type="button" aria-label={showPages?'Hide page thumbnails':'Show page thumbnails'} aria-pressed={showPages} onClick={()=>setShowPages(value=>!value)}><SidebarSimple size={18}/></button>
      <button type="button" aria-label="Previous page" disabled={!document||page<=1} onClick={()=>setPage(value=>value-1)}><CaretLeft size={16}/></button>
      <span aria-live="polite">{document?`${page} / ${document.numPages}`:'Loading PDF…'}</span>
      <button type="button" aria-label="Next page" disabled={!document||page>=document.numPages} onClick={()=>setPage(value=>value+1)}><CaretRight size={16}/></button>
      <button type="button" aria-label="Zoom out" onClick={()=>changeZoom(-25)}><Minus size={16}/></button>
      <span>{fit?'Fit width':`${zoom}%`}</span>
      <button type="button" aria-label="Zoom in" onClick={()=>changeZoom(25)}><Plus size={16}/></button>
      <button type="button" aria-pressed={fit} onClick={()=>setFit(true)}>Fit to width</button>
    </div>
    {error?<p className="qpo-unsupported-hint" role="alert">{error}</p>:<div className="qpo-pdf-body">
      {showPages&&document&&<nav className="qpo-pdf-sidebar" aria-label="PDF pages"><strong>Pages ({document.numPages})</strong>{Array.from({length:Math.min(document.numPages,500)},(_,index)=><PdfThumbnail key={index} document={document} page={index+1} selected={page===index+1} onSelect={()=>setPage(index+1)}/>)}{document.numPages>500&&<p>First 500 pages shown. Use the page controls for later pages.</p>}</nav>}
      <div className="qpo-pdf-scroll" ref={container}><canvas ref={canvas} aria-label={`PDF page ${page}`}/></div>
    </div>}
  </div>;
}
