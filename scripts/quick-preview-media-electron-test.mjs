import { app, BrowserWindow, protocol } from 'electron';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { makeZip } from './quick-preview-zip-fixture.mjs';

protocol.registerSchemesAsPrivileged([{scheme:'keyflow-preview',privileges:{standard:true,secure:true,stream:true,supportFetchAPI:true,corsEnabled:true}}]);
// The fixture owns its exit code even when destroying the last window.
app.on('window-all-closed', event => event.preventDefault());
(async () => {
const dir = await mkdtemp(join(tmpdir(), 'keyflow-media-test-'));
app.setPath('userData', join(dir, 'profile'));
const timer = setTimeout(() => app.exit(1), 45000);
let manager;
try {
  await app.whenReady();
  const { QuickPreviewWindowManager } = await import('../dist-electron/quick-preview-window.js');
  manager = new QuickPreviewWindowManager(false);
  const samples = 8000;
  const wav = Buffer.alloc(44 + samples * 2);
  wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
  wav.write('data', 36); wav.writeUInt32LE(samples * 2, 40);
  const audioPath = join(dir, 'sound.wav'); await writeFile(audioPath, wav);
  // Generate a self-contained, two-page PDF with a valid cross-reference table.
  const contents = ['First page fixture', 'Second page fixture'].map(text => `BT /F1 24 Tf 30 120 Td (${text}) Tj ET`);
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 200] /Resources << /Font << /F1 5 0 R >> >> /Contents 6 0 R >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 200] /Resources << /Font << /F1 5 0 R >> >> /Contents 7 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    ...contents.map(content => `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`),
  ];
  let pdf = '%PDF-1.4\n'; const offsets = [0];
  objects.forEach((object, i) => { offsets.push(Buffer.byteLength(pdf)); pdf += `${i+1} 0 obj\n${object}\nendobj\n`; });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${offsets.length}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  const pdfPath = join(dir, 'document.pdf'); await writeFile(pdfPath, pdf);
  const imageWidth = 2800, imageHeight = 2800, stride = imageWidth * 3;
  const bitmap = Buffer.alloc(54 + stride * imageHeight, 180);
  bitmap.fill(0, 0, 54);
  bitmap.write('BM'); bitmap.writeUInt32LE(bitmap.length, 2); bitmap.writeUInt32LE(54, 10);
  bitmap.writeUInt32LE(40, 14); bitmap.writeInt32LE(imageWidth, 18); bitmap.writeInt32LE(imageHeight, 22);
  bitmap.writeUInt16LE(1, 26); bitmap.writeUInt16LE(24, 28); bitmap.writeUInt32LE(0, 30);
  const imagePath = join(dir, 'large.bmp'); await writeFile(imagePath, bitmap);
  const tiffPath = join(dir, 'photo.tiff');
  await sharp({create:{width:96,height:64,channels:3,background:'#2468ac'}}).tiff().toFile(tiffPath);
  const archivePath = join(dir, 'archive.zip'); await writeFile(archivePath, makeZip(['images/','images/café.png']));
  const docxPath = join(dir, 'document.docx');
  const docxXml = '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Word preview fixture</w:t></w:r></w:p></w:body></w:document>';
  await writeFile(docxPath, makeZip([{name:'word/document.xml',content:docxXml}]));
  assert.equal(await manager.openPreview(audioPath), true);
  const win = BrowserWindow.getAllWindows()[0];
  let audio;
  for (let i = 0; i < 100; i++) {
    audio = await win.webContents.executeJavaScript(`(() => {const a=document.querySelector('audio'); return a && {ready:a.readyState, duration:a.duration, error:a.error?.code, message:a.error?.message, src:a.currentSrc, attr:a.getAttribute('src')};})()`);
    if (audio?.ready >= 1) break;
    await new Promise(r => setTimeout(r, 50));
  }
  console.log('Audio state:', audio, 'page:', await win.webContents.executeJavaScript(`({url:location.href,csp:[...document.querySelectorAll('meta[http-equiv]')].map(e=>e.outerHTML)})`));
  assert.ok(audio?.ready >= 1 && Number.isFinite(audio.duration) && audio.duration > 0, 'audio must decode metadata');
  assert.equal(await manager.openPreview(pdfPath), true);
  const until = async expression => {
    for (let i = 0; i < 100; i++) {
      const result = await win.webContents.executeJavaScript(expression);
      if (result) return result;
      await new Promise(r => setTimeout(r, 50));
    }
    throw new Error(`Timed out: ${expression}`);
  };
  await until(`document.body.innerText.includes('Page 1 of 2')`);
  await new Promise(r => setTimeout(r, 500));
  const first = await win.webContents.executeJavaScript(`document.querySelector('.qpo-pdf canvas')?.toDataURL()`);
  assert.ok(first?.length > 1000, 'first page must render');
  await win.webContents.executeJavaScript(`document.querySelector('.qpo-pdf-controls button:last-child').click()`);
  await until(`document.body.innerText.includes('Page 2 of 2')`);
  await new Promise(r => setTimeout(r, 500));
  const second = await win.webContents.executeJavaScript(`document.querySelector('.qpo-pdf canvas')?.toDataURL()`);
  assert.ok(second?.length > 1000 && second !== first, 'second page must render different content');
  const capture = await win.webContents.capturePage();
  await writeFile(resolve('artifacts/quick-preview-pdf-check.png'), capture.toPNG());
  assert.equal(await manager.openPreview(imagePath), true);
  await until(`document.querySelector('.qpo-image')?.naturalWidth === ${imageWidth}`);
  assert.equal(await manager.openPreview(tiffPath), true);
  await until(`document.querySelector('.qpo-image')?.naturalWidth === 96`);
  assert.equal(await manager.openPreview(archivePath), true);
  await until(`document.querySelector('.qpo-archive-list')?.innerText.includes('images/café.png')`);
  assert.equal(await manager.openPreview(docxPath), true);
  await until(`document.querySelector('.qpo-text-content')?.innerText.includes('Word preview fixture')`);
  if (process.env.KEYFLOW_TEST_VIDEO) {
    assert.equal(await manager.openPreview(process.env.KEYFLOW_TEST_VIDEO), true);
    await until(`document.querySelector('video')?.readyState >= 2`);
    const video = await win.webContents.executeJavaScript(`({width:document.querySelector('video').videoWidth,height:document.querySelector('video').videoHeight})`);
    assert.deepEqual(video, {width:160,height:120});
    console.log('PASS: video dimensions and initial frame decoded');
  }
  if (process.env.KEYFLOW_TEST_PSB) {
    const started = Date.now();
    assert.equal(await manager.openPreview(process.env.KEYFLOW_TEST_PSB), true);
    const expectedWidth = Number(process.env.KEYFLOW_TEST_PSD_WIDTH || 2048);
    await until(`document.querySelector('.qpo-image')?.naturalWidth === ${expectedWidth}`);
    console.log(`PASS: large PSB composite rendered in ${Date.now() - started} ms`);
  }
  if (process.env.KEYFLOW_TEST_SHELL_DOCUMENT) {
    assert.equal(await manager.openPreview(process.env.KEYFLOW_TEST_SHELL_DOCUMENT), true);
    await until(`document.querySelector('.qpo-image')?.naturalWidth > 0`);
    assert.equal(await win.webContents.executeJavaScript(`document.querySelector('.qpo-thumbnail-notice')?.textContent`), 'Windows thumbnail preview');
    console.log('PASS: installed Windows provider supplied a labeled document thumbnail');
  }
  const invalidAudio = join(dir, 'invalid.mp3'); await writeFile(invalidAudio, 'not an audio file');
  assert.equal(await manager.openPreview(invalidAudio), true);
  await until(`document.body.innerText.includes('This audio format could not be played')`);
  console.log('PASS: unreadable audio shows a useful error');
  console.log('PASS: WAV, PDF pages, ZIP contents, DOCX text, TIFF, and image larger than 20 MB rendered');
  clearTimeout(timer); manager.destroy(); try { await rm(dir, {recursive:true,force:true}); } catch {} app.exit(0);
} catch (error) {
  console.error(error); clearTimeout(timer); manager?.destroy(); try { await rm(dir, {recursive:true,force:true}); } catch {} app.exit(1);
}
})().catch(error => { console.error(error); app.exit(1); });
