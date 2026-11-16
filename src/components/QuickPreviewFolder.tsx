import { useEffect, useMemo, useRef, useState } from 'react';
import { CaretDown, CaretRight, File, Folder, GridFour, ListBullets, MagnifyingGlass, TreeStructure } from '@phosphor-icons/react';

export interface FolderEntry { name:string; directory:boolean; size:number|null; modified:number|null }
export interface FolderListing { entries:FolderEntry[]; truncated:boolean }

function FolderGridIcon({entry}:{entry:FolderEntry}) {
  const ref=useRef<HTMLSpanElement>(null);
  const [thumbnail,setThumbnail]=useState<string|null>(null);
  useEffect(()=>{
    const element=ref.current;
    if(!element || entry.directory || !/\.(png|jpe?g|gif|webp|bmp|tiff?|avif|ps[db])$/i.test(entry.name)) return;
    let generation=0;
    const observer=new IntersectionObserver(([visibility])=>{
      const current=++generation;
      if(!visibility.isIntersecting) {setThumbnail(null);return;}
      void window.electronAPI?.quickPreview?.folderEntryThumbnail(entry.name).then(value=>{if(current===generation)setThumbnail(value)});
    },{rootMargin:'100px'});
    observer.observe(element);
    return ()=>{generation++;observer.disconnect()};
  },[entry.name,entry.directory]);
  return <span ref={ref} className="qpo-folder-grid-icon">{thumbnail?<img className="qpo-folder-grid-thumbnail" src={thumbnail} alt=""/>:entry.directory?<Folder className="qpo-folder-icon" weight="fill" size={48} aria-hidden="true"/>:<File size={48} aria-hidden="true"/>}</span>;
}

export function QuickPreviewFolder({ listing }: { listing:FolderListing|null }) {
  const [query,setQuery]=useState('');
  const [view,setView]=useState<'list'|'grid'|'tree'>('list');
  const [selected,setSelected]=useState<string|null>(null);
  const [nested,setNested]=useState<{parent:string;entry:FolderEntry}|null>(null);
  const [expanded,setExpanded]=useState<Record<string,FolderListing|null>>({});
  const [expanding,setExpanding]=useState<string|null>(null);
  const [thumbnail,setThumbnail]=useState<string|null>(null);
  const entries=useMemo(()=>listing?.entries.filter(entry=>entry.name.toLocaleLowerCase().includes(query.toLocaleLowerCase())) ?? [],[listing,query]);
  const active=nested?.entry ?? entries.find(entry=>entry.name===selected);
  useEffect(()=>{
    let cancelled=false;
    setThumbnail(null);
    if (active && !active.directory && !nested) void window.electronAPI?.quickPreview?.folderEntryThumbnail(active.name).then(value=>{if(!cancelled)setThumbnail(value)});
    return ()=>{cancelled=true};
  },[active,nested]);
  const open=(entry:FolderEntry)=>{ if(nested?.entry===entry) void window.electronAPI?.quickPreview?.openExpandedFolderEntry(nested.parent,entry.name); else void window.electronAPI?.quickPreview?.openFolderEntry(entry.name); };
  const toggle=async(entry:FolderEntry)=>{
    if(Object.prototype.hasOwnProperty.call(expanded,entry.name)){setExpanded(previous=>{const next={...previous};delete next[entry.name];return next});return;}
    setExpanding(entry.name);
    try {const children=await window.electronAPI?.quickPreview?.expandFolderEntry(entry.name);setExpanded(previous=>({...previous,[entry.name]:children??null}));}
    finally {setExpanding(null)}
  };
  const formatSize=(size:number|null)=>size===null?'—':size<1024?`${size} B`:size<1048576?`${(size/1024).toFixed(1)} KB`:`${(size/1048576).toFixed(1)} MB`;
  return <section className={`qpo-folder qpo-folder--${view}`} aria-label="Folder contents">
    <div className="qpo-folder-toolbar">
      <strong>Contents</strong>
      <label className="qpo-folder-search"><MagnifyingGlass aria-hidden="true"/><input value={query} onChange={event=>setQuery(event.target.value)} placeholder="Search in folder" aria-label="Search in folder"/></label>
      <button type="button" className="qpo-toolbar-btn" aria-label="List view" aria-pressed={view==='list'} onClick={()=>setView('list')}><ListBullets/></button>
      <button type="button" className="qpo-toolbar-btn" aria-label="Grid view" aria-pressed={view==='grid'} onClick={()=>setView('grid')}><GridFour/></button>
      <button type="button" className="qpo-toolbar-btn" aria-label="Expandable list view" aria-pressed={view==='tree'} onClick={()=>setView('tree')}><TreeStructure/></button>
    </div>
    {!listing ? <p role="alert">This folder could not be read.</p> : <>
      <div className="qpo-folder-body">
        <div className={`qpo-folder-entries qpo-folder-entries--${view}`} aria-label="Items" onKeyDown={event=>{
          if(event.ctrlKey||event.altKey||event.metaKey||!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(event.key))return;
          const target=event.target as HTMLElement;
          if(!target.classList.contains('qpo-folder-entry'))return;
          const buttons=Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('.qpo-folder-entry'));
          const index=buttons.indexOf(target as HTMLButtonElement);
          const step=event.key==='ArrowUp'||event.key==='ArrowLeft'?-1:1;
          const next=buttons[index+step];if(next){event.preventDefault();next.focus();next.click();}
        }}>
          {view!=='grid'&&<div className="qpo-folder-columns" aria-hidden="true"><span/><span>Name</span><span>Type</span><span>Modified</span><span>Size</span></div>}
          {entries.map(entry=><div key={entry.name} className={view==='tree'?'qpo-folder-tree-group':undefined}>
          <div className="qpo-folder-row">{view==='tree'&&<span className="qpo-folder-expander">{entry.directory&&<button type="button" className="qpo-toolbar-btn" aria-label={`${Object.prototype.hasOwnProperty.call(expanded,entry.name)?'Collapse':'Expand'} ${entry.name}`} aria-expanded={Object.prototype.hasOwnProperty.call(expanded,entry.name)} disabled={expanding===entry.name} onClick={()=>void toggle(entry)}>{Object.prototype.hasOwnProperty.call(expanded,entry.name)?<CaretDown/>:<CaretRight/>}</button>}</span>}
          <button type="button" className="qpo-folder-entry" aria-pressed={!nested&&selected===entry.name} onClick={()=>{setNested(null);setSelected(entry.name)}} onDoubleClick={()=>{setNested(null);void window.electronAPI?.quickPreview?.openFolderEntry(entry.name)}} onKeyDown={event=>{if(event.key==='Enter'){event.preventDefault();void window.electronAPI?.quickPreview?.openFolderEntry(entry.name)}}}>
            {view==='grid'?<FolderGridIcon entry={entry}/>:entry.directory?<Folder className="qpo-folder-icon" weight="fill" size={20} aria-hidden="true"/>:<File size={20} aria-hidden="true"/>}<span className="qpo-folder-entry-name">{entry.name}</span>
            {view!=='grid'&&<><span>{entry.directory?'Folder':'File'}</span><span>{entry.modified?new Date(entry.modified).toLocaleDateString():'—'}</span><span>{formatSize(entry.size)}</span></>}
          </button></div>
          {view==='tree'&&Object.prototype.hasOwnProperty.call(expanded,entry.name)&&<div className="qpo-folder-nested">{expanded[entry.name]?expanded[entry.name]!.entries.map(child=><button type="button" key={child.name} className="qpo-folder-entry" aria-pressed={nested?.parent===entry.name&&nested.entry.name===child.name} onClick={()=>{setSelected(null);setNested({parent:entry.name,entry:child})}} onDoubleClick={()=>void window.electronAPI?.quickPreview?.openExpandedFolderEntry(entry.name,child.name)} onKeyDown={event=>{if(event.key==='Enter'){event.preventDefault();void window.electronAPI?.quickPreview?.openExpandedFolderEntry(entry.name,child.name)}}}>{child.directory?<Folder className="qpo-folder-icon" weight="fill" size={20}/>:<File size={20}/>}<span className="qpo-folder-entry-name">{child.name}</span><span>{child.directory?'Folder':'File'}</span><span>{child.modified?new Date(child.modified).toLocaleDateString():'—'}</span><span>{formatSize(child.size)}</span></button>):<p>Unable to read this folder.</p>}{expanded[entry.name]?.entries.length===0&&<p>This folder is empty.</p>}{expanded[entry.name]?.truncated&&<p>Showing the first 500 items.</p>}</div>}
          </div>)}
          {entries.length===0&&<p>{query?'No matching items.':'This folder is empty.'}</p>}
        </div>
        {view!=='grid'&&<aside className="qpo-folder-detail" aria-label="Selected item details">
          {active?<><div className="qpo-folder-detail-icon">{thumbnail?<img className="qpo-folder-thumbnail" src={thumbnail} alt=""/>:active.directory?<Folder className="qpo-folder-icon" weight="fill" size={48}/>:<File size={48}/>}</div><strong>{active.name}</strong><p>{active.directory?'Folder':'File'}</p>{thumbnail&&<p>Windows thumbnail</p>}<dl><dt>Modified</dt><dd>{active.modified?new Date(active.modified).toLocaleString():'—'}</dd><dt>Size</dt><dd>{formatSize(active.size)}</dd></dl><button type="button" className="qpo-folder-open" onClick={()=>open(active)}>Preview {active.directory?'folder':'file'}</button></>:<p>Select an item to see its details.</p>}
        </aside>}
      </div>
      <footer className="qpo-folder-footer">{view==='grid'&&active?`${active.name} · ${active.directory?'Folder':formatSize(active.size)} · `:''}{listing.entries.length} items{listing.truncated?' · showing the first 500':''}</footer>
    </>}
  </section>;
}
