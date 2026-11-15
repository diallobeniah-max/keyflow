import { crc32 } from 'node:zlib';

/** Create simple, valid stored ZIP records for preview tests. */
export function makeZip(names) {
  const local = [], central = [];
  let offset = 0;
  for (const item of names) {
    const name = typeof item === 'string' ? item : item.name;
    const filename = Buffer.from(name, 'utf8');
    const content = name.endsWith('/') ? Buffer.alloc(0) : Buffer.from(typeof item === 'string' ? 'sample' : item.content);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50,0); header.writeUInt16LE(20,4); header.writeUInt16LE(0x800,6);
    header.writeUInt32LE(crc32(content),14);
    header.writeUInt32LE(content.length,18); header.writeUInt32LE(content.length,22); header.writeUInt16LE(filename.length,26);
    local.push(header,filename,content);
    const record = Buffer.alloc(46);
    record.writeUInt32LE(0x02014b50,0); record.writeUInt16LE(20,4); record.writeUInt16LE(20,6); record.writeUInt16LE(0x800,8);
    record.writeUInt32LE(crc32(content),16);
    record.writeUInt32LE(content.length,20); record.writeUInt32LE(content.length,24); record.writeUInt16LE(filename.length,28); record.writeUInt32LE(offset,42);
    central.push(record,filename);
    offset += header.length + filename.length + content.length;
  }
  const directory = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50,0); end.writeUInt16LE(names.length,8); end.writeUInt16LE(names.length,10);
  end.writeUInt32LE(directory.length,12); end.writeUInt32LE(offset,16);
  return Buffer.concat([...local,directory,end]);
}
