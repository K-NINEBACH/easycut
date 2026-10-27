// 앱 아이콘 만들기: build/icon.svg → build/icon.png (512×512, electron-builder 가 .ico 로 바꿔 씀)
// 실행: npx electron scripts/make-icon.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { app, BrowserWindow } from 'electron';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'build');
const svg = readFileSync(join(dir, 'icon.svg'), 'utf8');

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 512, height: 512, show: false, transparent: true, frame: false, useContentSize: true });
  const html = `<html><body style="margin:0;background:transparent">${svg.replace('<svg ', '<svg width="512" height="512" ')}</body></html>`;
  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
  await new Promise((r) => setTimeout(r, 300));
  const img = await win.webContents.capturePage({ x: 0, y: 0, width: 512, height: 512 });
  writeFileSync(join(dir, 'icon.png'), img.resize({ width: 512, height: 512 }).toPNG());
  console.log('build/icon.png', img.getSize());
  app.quit();
});
