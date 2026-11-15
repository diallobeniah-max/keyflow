import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm, open, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readPsdThumbnail, readPsdComposite } from '../electron/psd-preview.ts';
import sharp from 'sharp';
import { deflateSync } from 'node:zlib';
import { createHash } from 'node:crypto';

test('extracts only the embedded JPEG from a PSD or PSB resource', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'keyflow-psd-test-'));
  try {
    for (const version of [1, 2]) {
      const header = Buffer.alloc(30);
      header.write('8BPS'); header.writeUInt16BE(version, 4);
      const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
      const meta = Buffer.alloc(28); meta.writeUInt32BE(1, 0);
      const resource = Buffer.alloc(12);
      resource.write('8BIM'); resource.writeUInt16BE(1036, 4);
      resource.writeUInt32BE(meta.length + jpeg.length, 8);
      const sectionLength = Buffer.alloc(4);
      sectionLength.writeUInt32BE(resource.length + meta.length + jpeg.length);
      const path = join(dir, `${version}.psd`);
      await writeFile(path, Buffer.concat([header, sectionLength, resource, meta, jpeg]));
      assert.deepEqual(await readPsdThumbnail(path), jpeg);
      await writeFile(path, Buffer.from('8BPS'));
      assert.equal(await readPsdThumbnail(path), null);
    }
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('preserves the composite alpha channel indicated by the layer count', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'keyflow-alpha-test-'));
  try {
    const path = join(dir, 'alpha.psd');
    const header = Buffer.alloc(30);
    header.write('8BPS'); header.writeUInt16BE(1, 4); header.writeUInt16BE(4, 12);
    header.writeUInt32BE(1, 14); header.writeUInt32BE(1, 18);
    header.writeUInt16BE(8, 22); header.writeUInt16BE(3, 24);
    const layer = Buffer.alloc(10); layer.writeUInt32BE(6); layer.writeUInt32BE(2, 4); layer.writeInt16BE(-1, 8);
    await writeFile(path, Buffer.concat([header, Buffer.alloc(4), layer, Buffer.from([0, 0, 177, 202, 227, 128])]));
    const png = await readPsdComposite(path); assert.ok(png);
    const {data,info} = await sharp(png).raw().toBuffer({resolveWithObject:true});
    assert.equal(info.channels, 4); assert.deepEqual([...data], [100, 149, 199, 128]);
  } finally { await rm(dir, {recursive:true, force:true}); }
});

test('decodes ZIP and ZIP-predicted composite rows', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'keyflow-zip-test-'));
  try {
    const header = Buffer.alloc(30);
    header.write('8BPS'); header.writeUInt16BE(1,4); header.writeUInt16BE(3,12);
    header.writeUInt32BE(1,14); header.writeUInt32BE(2,18); header.writeUInt16BE(8,22); header.writeUInt16BE(3,24);
    for (const type of [2,3]) {
      const path = join(dir, `${type}.psd`);
      const planar = type === 2 ? [100,120,40,80,0,200] : [100,20,40,40,0,200];
      await writeFile(path, Buffer.concat([header, Buffer.alloc(8), Buffer.from([0,type]), deflateSync(Buffer.from(planar))]));
      const result = await readPsdComposite(path); assert.ok(result);
      const data = await sharp(result).raw().toBuffer();
      assert.deepEqual([...data],[100,40,0,120,80,200]);
    }
  } finally { await rm(dir, {recursive:true,force:true}); }
});

test('reads big-endian 16-bit RGB composites in raw, RLE, and ZIP files', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'keyflow-16bit-test-'));
  try {
    const header = Buffer.alloc(30);
    header.write('8BPS'); header.writeUInt16BE(1,4); header.writeUInt16BE(3,12);
    header.writeUInt32BE(1,14); header.writeUInt32BE(1,18); header.writeUInt16BE(16,22); header.writeUInt16BE(3,24);
    const planar = Buffer.from([0x12,0x34,0x56,0x78,0x9a,0xbc]);
    for (const type of [0,1,2]) {
      const path = join(dir, `${type}.psd`);
      const table = Buffer.from([0,3,0,3,0,3]);
      const rle = Buffer.from([1,0x12,0x34,1,0x56,0x78,1,0x9a,0xbc]);
      const data = type === 0 ? planar : type === 1 ? Buffer.concat([table,rle]) : deflateSync(planar);
      await writeFile(path, Buffer.concat([header,Buffer.alloc(8),Buffer.from([0,type]),data]));
      const result = await readPsdComposite(path); assert.ok(result);
      assert.deepEqual([...(await sharp(result).raw().toBuffer())], [0x12,0x56,0x9a]);
    }
  } finally { await rm(dir,{recursive:true,force:true}); }
});

test('decodes 16-bit ZIP prediction as big-endian sample differences', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'keyflow-16bit-predict-'));
  try {
    const header = Buffer.alloc(30);
    header.write('8BPS'); header.writeUInt16BE(1,4); header.writeUInt16BE(3,12);
    header.writeUInt32BE(1,14); header.writeUInt32BE(2,18); header.writeUInt16BE(16,22); header.writeUInt16BE(3,24);
    // Each second value is stored as the 16-bit difference from the first.
    const predicted = Buffer.from([0x12,0x34,0x11,0x11, 0x30,0x00,0x10,0x00, 0xff,0x00,0x02,0x00]);
    const path = join(dir, 'predicted.psd');
    await writeFile(path, Buffer.concat([header,Buffer.alloc(8),Buffer.from([0,3]),deflateSync(predicted)]));
    const result = await readPsdComposite(path); assert.ok(result);
    assert.deepEqual([...(await sharp(result).raw().toBuffer())], [0x12,0x30,0xff,0x23,0x40,0x01]);
  } finally { await rm(dir,{recursive:true,force:true}); }
});

test('decodes a flattened RGB PackBits composite and rejects truncated data', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'keyflow-composite-test-'));
  try {
    const path = join(dir, 'composite.psd');
    const header = Buffer.alloc(30);
    header.write('8BPS'); header.writeUInt16BE(1, 4);
    header.writeUInt16BE(3, 12); header.writeUInt32BE(1, 14);
    header.writeUInt32BE(2, 18); header.writeUInt16BE(8, 22);
    header.writeUInt16BE(3, 24);
    const lengths = Buffer.alloc(6); for (let i = 0; i < 3; i++) lengths.writeUInt16BE(3, i * 2);
    const psd = Buffer.concat([header, Buffer.alloc(4), Buffer.alloc(4), Buffer.from([0, 1]), lengths,
      Buffer.from([1, 255, 0, 1, 0, 255, 1, 0, 0])]);
    await writeFile(path, psd);
    const png = await readPsdComposite(path);
    assert.ok(png);
    const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
    assert.equal(info.width, 2); assert.equal(info.height, 1);
    assert.deepEqual([...data], [255, 0, 0, 0, 255, 0]);
    await writeFile(path, psd.subarray(0, psd.length - 1));
    assert.equal(await readPsdComposite(path), null);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('samples a composite above 60 million pixels without a full-sized pixel buffer', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'keyflow-large-psb-'));
  const path = join(dir, 'large.psb');
  try {
    const width = 8192, height = 8192;
    const header = Buffer.alloc(30);
    header.write('8BPS'); header.writeUInt16BE(2,4); header.writeUInt16BE(1,12);
    header.writeUInt32BE(height,14); header.writeUInt32BE(width,18); header.writeUInt16BE(8,22); header.writeUInt16BE(1,24);
    // Empty color, resource, and PSB layer sections, then raw planar composite.
    const prefix = Buffer.concat([header, Buffer.alloc(4), Buffer.alloc(8), Buffer.alloc(2)]);
    await writeFile(path, prefix);
    const file = await open(path, 'r+');
    try {
      await file.truncate(prefix.length + width * height);
      // The center sample of the first 4x4 output area.
      await file.write(Buffer.from([220]), 0, 1, prefix.length + 2 * width + 2);
    } finally { await file.close(); }
    const result = await readPsdComposite(path); assert.ok(result);
    const {data, info} = await sharp(result).greyscale().raw().toBuffer({resolveWithObject:true});
    assert.equal(info.width, 2048); assert.equal(info.height, 2048);
    assert.equal(data[0], 220); assert.equal(data[1], 0);
    const controller = new AbortController(); controller.abort();
    assert.equal(await readPsdComposite(path, controller.signal), null);
  } finally { await rm(dir, {recursive:true,force:true}); }
});

test('unprofiled CMYK composites decode primary colors across compression types', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'keyflow-cmyk-'));
  try {
    const header = Buffer.alloc(30);
    header.write('8BPS'); header.writeUInt16BE(1,4); header.writeUInt16BE(4,12);
    header.writeUInt32BE(1,14); header.writeUInt32BE(4,18); header.writeUInt16BE(8,22); header.writeUInt16BE(4,24);
    const planes = [Buffer.from([0,255,255,255]),Buffer.from([255,0,255,255]),Buffer.from([255,255,0,255]),Buffer.from([255,255,255,0])];
    for (const compression of [0,1,2]) {
      const path = join(dir, `${compression}.psd`);
      const data = compression === 0 ? Buffer.concat(planes) : compression === 2 ? deflateSync(Buffer.concat(planes)) : Buffer.concat([Buffer.from([0,5,0,5,0,5,0,5]),...planes.map(p=>Buffer.concat([Buffer.from([3]),p]))]);
      await writeFile(path,Buffer.concat([header,Buffer.alloc(8),Buffer.from([0,compression]),data]));
      const result = await readPsdComposite(path); assert.ok(result);
      assert.deepEqual([...(await sharp(result).raw().toBuffer())],[0,255,255,255,0,255,255,255,0,0,0,0]);
    }
    const record = Buffer.alloc(12); record.write('8BIM'); record.writeUInt16BE(1000,4);
    const length = Buffer.alloc(4); length.writeUInt32BE(record.length);
    const path = join(dir,'resources.psd');
    await writeFile(path,Buffer.concat([header,length,record,Buffer.alloc(4),Buffer.from([0,0]),...planes]));
    assert.ok(await readPsdComposite(path), 'non-profile metadata must not prevent preview');
    record.writeUInt16BE(1039,4);
    await writeFile(path,Buffer.concat([header,length,record,Buffer.alloc(4),Buffer.from([0,0]),...planes]));
    assert.equal(await readPsdComposite(path),null, 'profiled files must not receive an unprofiled conversion');
    const alphaHeader = Buffer.from(header); alphaHeader.writeUInt16BE(5,12);
    const layer = Buffer.alloc(10); layer.writeUInt32BE(6); layer.writeUInt32BE(2,4); layer.writeInt16BE(-1,8);
    await writeFile(path,Buffer.concat([alphaHeader,Buffer.alloc(4),layer,Buffer.from([0,0]),...planes,Buffer.alloc(4,128)]));
    const transparent = await readPsdComposite(path); assert.ok(transparent);
    assert.deepEqual([...(await sharp(transparent).raw().toBuffer())], [0,255,255,128,255,0,255,128,255,255,0,128,0,0,0,128]);
    const predicted = Buffer.concat(planes.map(p => Buffer.from([p[0],...p.subarray(1).map((v,i)=>(v-p[i]+256)%256)])));
    await writeFile(path,Buffer.concat([header,Buffer.alloc(8),Buffer.from([0,3]),deflateSync(predicted)]));
    assert.deepEqual([...(await sharp(await readPsdComposite(path)).raw().toBuffer())],[0,255,255,255,0,255,255,255,0,0,0,0]);
    const mixedHeader = Buffer.from(header); mixedHeader.writeUInt32BE(3,18);
    const mixed = [[200,150,100,220],[255,180,40,90],[123,231,45,200]];
    const mixedPlanes = Buffer.from([0,1,2,3].flatMap(channel => mixed.map(pixel => pixel[channel])));
    await writeFile(path,Buffer.concat([mixedHeader,Buffer.alloc(8),Buffer.from([0,0]),mixedPlanes]));
    // Expected values independently checked with psd-tools and Pillow.
    assert.deepEqual([...(await sharp(await readPsdComposite(path)).raw().toBuffer())],[173,129,86,90,64,14,96,181,35]);
    const header16 = Buffer.from(header); header16.writeUInt16BE(16,22);
    const words = Buffer.concat(planes.map(p => Buffer.from([...p].flatMap(v=>[v,v]))));
    await writeFile(path,Buffer.concat([header16,Buffer.alloc(8),Buffer.from([0,2]),deflateSync(words)]));
    assert.deepEqual([...(await sharp(await readPsdComposite(path)).raw().toBuffer())],[0,255,255,255,0,255,255,255,0,0,0,0]);
    const predicted16 = Buffer.concat(planes.map(p => {
      const values = [...p].map(v => v * 257);
      const result = Buffer.alloc(values.length * 2);
      values.forEach((v,i) => result.writeUInt16BE(i ? (v - values[i-1] + 65536) % 65536 : v, i*2));
      return result;
    }));
    await writeFile(path,Buffer.concat([header16,Buffer.alloc(8),Buffer.from([0,3]),deflateSync(predicted16)]));
    assert.deepEqual([...(await sharp(await readPsdComposite(path)).raw().toBuffer())],[0,255,255,255,0,255,255,255,0,0,0,0]);
  } finally { await rm(dir,{recursive:true,force:true}); }
});

test('applies a CMYK ICC profile to a flattened composite', async t => {
  let profile;
  try { profile = await readFile('C:/Windows/System32/spool/drivers/color/RSWOP.icm'); }
  catch { return t.skip('Windows SWOP profile unavailable'); }
  const dir = await mkdtemp(join(tmpdir(), 'keyflow-cmyk-profile-'));
  try {
    const header = Buffer.alloc(30);
    header.write('8BPS'); header.writeUInt16BE(1,4); header.writeUInt16BE(4,12);
    header.writeUInt32BE(1,14); header.writeUInt32BE(3,18); header.writeUInt16BE(8,22); header.writeUInt16BE(4,24);
    const record = Buffer.alloc(12); record.write('8BIM'); record.writeUInt16BE(1039,4); record.writeUInt32BE(profile.length,8);
    const length = Buffer.alloc(4); length.writeUInt32BE(record.length + profile.length + profile.length % 2);
    // These ink values were converted independently with Pillow ImageCms and this Windows profile.
    const samples = [[0,255,255,0],[128,64,32,80],[0,0,0,128]];
    const planes = Buffer.from([0,1,2,3].flatMap(c => samples.map(p => 255-p[c])));
    const path = join(dir,'profiled.psd');
    for (const compression of [0,2]) {
      await writeFile(path, Buffer.concat([header,length,record,profile,Buffer.alloc(profile.length % 2),Buffer.alloc(4),Buffer.from([0,compression]),compression ? deflateSync(planes) : planes]));
      const result = await readPsdComposite(path); assert.ok(result);
      assert.deepEqual([...(await sharp(result).raw().toBuffer())], [229,51,44,109,122,136,154,155,155]);
    }
    const alphaHeader = Buffer.from(header); alphaHeader.writeUInt16BE(5,12);
    const layer = Buffer.alloc(10); layer.writeUInt32BE(6); layer.writeUInt32BE(2,4); layer.writeInt16BE(-1,8);
    const alpha = Buffer.from([128,255,0]);
    for (const compression of [0,2]) {
      const data = Buffer.concat([planes,alpha]);
      await writeFile(path, Buffer.concat([alphaHeader,length,record,profile,Buffer.alloc(profile.length % 2),layer,Buffer.from([0,compression]),compression ? deflateSync(data) : data]));
      const result = await readPsdComposite(path); assert.ok(result);
      // Reference: ImageCms conversion followed by the PSD white-matte removal.
      assert.deepEqual([...(await sharp(result).raw().toBuffer())], [203,0,0,128,109,122,136,255,0,0,0,0]);
    }
    const broken = Buffer.from(profile); broken.writeUInt32BE(broken.length + 1, 0);
    await writeFile(path, Buffer.concat([header,length,record,broken,Buffer.alloc(profile.length % 2),Buffer.alloc(4),Buffer.from([0,0]),planes]));
    assert.equal(await readPsdComposite(path), null, 'invalid profile must not silently use an unprofiled conversion');
  } finally { await rm(dir,{recursive:true,force:true}); }
});

test('real CMYK merged transparency matches the reference decoder', async t => {
  const path = process.env.KEYFLOW_CMYK_ALPHA_FIXTURE;
  if (!path) return t.skip('Set KEYFLOW_CMYK_ALPHA_FIXTURE to the psd-tools cmyk-blend-modes.psd fixture');
  // Reference: Pillow CMYK conversion and psd-tools white-matte removal;
  // transparent RGB values are normalized because they are invisible.
  const result = await readPsdComposite(path); assert.ok(result);
  const { data, info } = await sharp(result).raw().toBuffer({resolveWithObject:true});
  assert.equal(info.width, 530); assert.equal(info.height, 512); assert.equal(info.channels, 4);
  for (let i = 0; i < data.length; i += 4) if (data[i + 3] === 0) data.fill(0, i, i + 3);
  assert.equal(createHash('sha256').update(data).digest('hex'), '2adbceabe5781be6d6c6b3640aa565e913b46a8f637ed2f60b198e8e7e9b4ec1');
});
