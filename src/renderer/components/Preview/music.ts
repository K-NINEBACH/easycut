// 미리보기 배경음악 (PRD F5). 음악 프록시를 <audio> 2개(현재 곡 / 다음 곡 미리 로딩)로 재생한다.
// 볼륨·페이드는 렌더와 같은 수식(timeline.musicFade), 덕킹은 단순 근사 (말소리 장면에서 50%).
import { clipIndexAt, musicAt, musicFade, type TimelineLayout } from '@shared/timeline';
import { mediaUrl } from '@shared/mediaUrl';
import type { Project } from '@shared/types';

/** 미리보기 덕킹 근사: 소리가 나는 장면 구간에서 음악 볼륨 50% */
export const PREVIEW_DUCK = 0.5;

interface Slot {
  el: HTMLAudioElement;
  gain: GainNode | null;
}

export class MusicPreview {
  private slots: [Slot, Slot];
  private ctx: AudioContext | null = null;

  constructor(host: HTMLElement) {
    const make = (): Slot => {
      const el = document.createElement('audio');
      el.crossOrigin = 'anonymous';
      el.preload = 'auto';
      el.style.display = 'none';
      host.appendChild(el);
      return { el, gain: null };
    };
    this.slots = [make(), make()];
  }

  connect(ctx: AudioContext): void {
    if (this.ctx) return;
    this.ctx = ctx;
    for (const s of this.slots) {
      const src = ctx.createMediaElementSource(s.el);
      s.gain = ctx.createGain();
      s.gain.gain.value = 0;
      src.connect(s.gain).connect(ctx.destination);
    }
  }

  /** 매 프레임 호출. t: 재생 위치, total: 영상 전체 길이 */
  update(p: Project, layout: TimelineLayout, t: number, playing: boolean): void {
    const track = p.musicTrack;
    const at = t < layout.total ? musicAt(track, t) : null;
    if (!at) {
      this.stop();
      return;
    }
    const media = new Map(p.media.map((m) => [m.id, m]));
    const clip = track[at.index];
    const m = media.get(clip.mediaId);
    const cur = this.slots[at.index % 2];
    if (!m?.proxyPath || m.missing || m.proxyStatus !== 'ready') {
      this.setGain(cur, 0);
      cur.el.pause();
      return;
    }
    this.ensureSrc(cur.el, m.proxyPath);

    // 소리 크기 = 볼륨 × 페이드 × (말소리 장면이면 덕킹)
    const { volume, fadeIn, fadeOut, ducking } = p.music;
    let g = volume * musicFade(t, layout.total, fadeIn, fadeOut);
    if (ducking) {
      const vc = p.videoTrack[clipIndexAt(layout, t)];
      const vm = vc && media.get(vc.mediaId);
      if (vc && vm?.hasAudio && !vc.muted && vc.volume > 0 && vc.imageDuration === undefined) g *= PREVIEW_DUCK;
    }
    this.setGain(cur, playing ? g : 0);
    this.sync(cur.el, at.sourceTime, playing);

    // 다음 곡 미리 준비
    const other = this.slots[(at.index + 1) % 2];
    const next = track[at.index + 1];
    const nm = next && media.get(next.mediaId);
    this.setGain(other, 0);
    if (!other.el.paused) other.el.pause();
    if (next && nm?.proxyPath && nm.proxyStatus === 'ready') {
      this.ensureSrc(other.el, nm.proxyPath);
      if (other.el.readyState >= 1 && Math.abs(other.el.currentTime - next.inPoint) > 0.05 && !other.el.seeking) {
        other.el.currentTime = next.inPoint;
      }
    }
  }

  stop(): void {
    for (const s of this.slots) {
      if (!s.el.paused) s.el.pause();
      this.setGain(s, 0);
    }
  }

  destroy(): void {
    for (const s of this.slots) {
      s.el.pause();
      s.el.removeAttribute('src');
      s.el.load();
      s.el.remove();
    }
  }

  /** 테스트용: 지금 들리는 음악 소리 크기 */
  get currentGains(): number[] {
    return this.slots.map((s) => s.gain?.gain.value ?? 0);
  }

  get elements(): HTMLAudioElement[] {
    return this.slots.map((s) => s.el);
  }

  private ensureSrc(el: HTMLAudioElement, path: string): void {
    const url = mediaUrl(path);
    if (el.dataset.src !== url) {
      el.dataset.src = url;
      el.src = url;
    }
  }

  private sync(el: HTMLAudioElement, expected: number, play: boolean): void {
    if (el.readyState < 1) return;
    const diff = Math.abs(el.currentTime - expected);
    if (play) {
      if (el.paused) {
        if (diff > 0.05) el.currentTime = expected;
        void el.play().catch(() => undefined);
      } else if (diff > 0.3 && !el.seeking) {
        el.currentTime = expected;
      }
    } else {
      if (!el.paused) el.pause();
      if (diff > 0.1 && !el.seeking) el.currentTime = expected;
    }
  }

  private setGain(s: Slot, value: number): void {
    if (!s.gain) return;
    if (Math.abs(s.gain.gain.value - value) > 0.001) s.gain.gain.value = value;
  }
}
