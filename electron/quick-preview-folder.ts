import { opendir, lstat } from 'node:fs/promises';
import { join } from 'node:path';

export interface PreviewFolderEntry {
  name: string;
  directory: boolean;
  size: number | null;
  modified: number | null;
}
export interface PreviewFolderListing {
  entries: PreviewFolderEntry[];
  truncated: boolean;
}

/** Read a bounded, non-recursive snapshot without following links. */
export async function readPreviewFolder(path: string, signal?: AbortSignal, onInitial?: (listing: PreviewFolderListing) => void): Promise<PreviewFolderListing> {
  const entries: PreviewFolderEntry[] = [];
  let truncated = false;
  const directory = await opendir(path);
  for await (const item of directory) {
    if (signal?.aborted) break;
    if (entries.length >= 500) { truncated = true; break; }
    entries.push({ name: item.name, directory: item.isDirectory(), size: null, modified: null });
  }
  entries.sort((a,b) => Number(b.directory) - Number(a.directory) || a.name.localeCompare(b.name, undefined, {numeric:true,sensitivity:'base'}));
  if (!signal?.aborted) onInitial?.({ entries: entries.map(entry=>({...entry})), truncated });
  // Limit concurrent filesystem work, especially on removable and network drives.
  let next = 0;
  await Promise.all(Array.from({length: 8}, async () => {
    while (!signal?.aborted) {
      const index = next++;
      if (index >= entries.length) return;
      const entry = entries[index];
      try {
        const stat = await lstat(join(path, entry.name));
        entry.size = stat.isFile() ? stat.size : null;
        entry.modified = stat.mtimeMs;
      } catch { /* An entry may disappear while Explorer is open. */ }
    }
  }));
  return { entries, truncated };
}
