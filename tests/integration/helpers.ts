import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

export const FIXTURES = join(__dirname, '..', 'fixtures');

export interface StreamInfo {
  codec_name: string;
  width: number;
  height: number;
  r_frame_rate: string;
  pix_fmt: string;
  color_transfer?: string;
}

export function probeStream(path: string, select = 'v:0'): StreamInfo {
  const out = execFileSync('ffprobe', ['-v', 'error', '-select_streams', select, '-show_streams', '-of', 'json', path], {
    encoding: 'utf8'
  });
  return JSON.parse(out).streams[0];
}

export function probeFormat(path: string): { duration: number; streams: { codec_type: string }[] } {
  const out = execFileSync('ffprobe', ['-v', 'error', '-show_format', '-show_streams', '-of', 'json', path], {
    encoding: 'utf8'
  });
  const j = JSON.parse(out);
  return { duration: Number(j.format.duration), streams: j.streams };
}

export async function waitFor(cond: () => boolean, timeoutMs: number): Promise<void> {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > timeoutMs) throw new Error('시간 초과');
    await new Promise((r) => setTimeout(r, 100));
  }
}
