import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { isAbsolute, normalize, relative, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { protocol } from 'electron';
import { MEDIA_SCHEME, parseMediaUrl } from '@shared/mediaUrl';
import { extOf } from '@shared/mediaFormats';

const MIME: Record<string, string> = {
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  mov: 'video/quicktime',
  mkv: 'video/x-matroska',
  m4a: 'audio/mp4',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  aac: 'audio/aac',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  json: 'application/json',
  ttf: 'font/ttf',
  otf: 'font/otf',
  woff2: 'font/woff2',
  cube: 'text/plain'
};

/** app ready 전에 호출해야 함 */
export function registerMediaSchemePrivileges(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: MEDIA_SCHEME,
      privileges: { standard: true, secure: true, stream: true, supportFetchAPI: true, corsEnabled: true }
    }
  ]);
}

export interface MediaAccess {
  /** 이 경로 아래는 모두 허용 (현재 프로젝트 폴더) */
  allowedRoots: () => string[];
  /** 개별 허용 파일 (불러온 원본) */
  allowedFiles: Set<string>;
  resourcesDir: string;
}

function isInside(root: string, p: string): boolean {
  const rel = relative(root, p);
  return !!rel && !rel.startsWith('..') && !isAbsolute(rel);
}

/**
 * ezcut-media:// 요청을 파일로 응답. <video> 탐색을 위해 Range 요청(206)을 직접 처리한다.
 * 허용된 위치(프로젝트 폴더, 불러온 원본, resources)의 파일만 연다.
 */
export function registerMediaProtocol(access: MediaAccess): void {
  protocol.handle(MEDIA_SCHEME, async (request) => {
    const parsed = parseMediaUrl(request.url);
    if (!parsed) return new Response('bad url', { status: 400 });

    let filePath: string;
    if (parsed.kind === 'res') {
      filePath = resolve(access.resourcesDir, normalize(parsed.path));
      if (!isInside(access.resourcesDir, filePath)) return new Response('forbidden', { status: 403 });
    } else {
      filePath = resolve(parsed.path);
      const ok =
        access.allowedFiles.has(filePath) || access.allowedRoots().some((root) => isInside(root, filePath));
      if (!ok) return new Response('forbidden', { status: 403 });
    }

    let size: number;
    try {
      const st = await stat(filePath);
      if (!st.isFile()) return new Response('not found', { status: 404 });
      size = st.size;
    } catch {
      return new Response('not found', { status: 404 });
    }

    const type = MIME[extOf(filePath)] ?? 'application/octet-stream';
    const headers: Record<string, string> = {
      'Content-Type': type,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'no-cache'
    };

    const range = parseRange(request.headers.get('range'), size);
    if (range === 'invalid') {
      return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
    }
    if (range) {
      const { start, end } = range;
      headers['Content-Range'] = `bytes ${start}-${end}/${size}`;
      headers['Content-Length'] = String(end - start + 1);
      return new Response(toWeb(createReadStream(filePath, { start, end })), { status: 206, headers });
    }
    headers['Content-Length'] = String(size);
    return new Response(toWeb(createReadStream(filePath)), { status: 200, headers });
  });
}

function toWeb(stream: NodeJS.ReadableStream): ReadableStream {
  return Readable.toWeb(stream as Readable) as unknown as ReadableStream;
}

export function parseRange(header: string | null, size: number): { start: number; end: number } | null | 'invalid' {
  if (!header) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m) return null;
  let start: number;
  let end: number;
  if (m[1] === '') {
    // bytes=-500 → 마지막 500바이트
    const n = Number(m[2]);
    if (!n) return 'invalid';
    start = Math.max(0, size - n);
    end = size - 1;
  } else {
    start = Number(m[1]);
    end = m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1);
  }
  if (start >= size || start > end) return 'invalid';
  return { start, end };
}

