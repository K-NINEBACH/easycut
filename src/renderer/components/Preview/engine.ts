// 미리보기 엔진 (PRD F8): 프록시를 <video> 2개(현재 클립 / 다음 클립 미리 로딩)로 재생하고
// 그 프레임을 WebGL 캔버스에 그린다. 클립 i 는 항상 슬롯 i % 2 를 쓴다.
import { clipIndexAt, layoutTimeline, sourceTime, transitionAt, type TimelineLayout } from '@shared/timeline';
import { STAB_FPS, stabilizeWindow } from '@shared/stabilize';
import { TRANSITION_BY_ID } from '@shared/transitions';
import { mediaUrl } from '@shared/mediaUrl';
import type { MediaItem, Project, VideoClip } from '@shared/types';
import { getProject } from '../../store/project';
import { useUiStore } from '../../store/ui';
import { GlRenderer, type SourceParams } from './glRenderer';
import { MusicPreview } from './music';

export type PreviewStatus = 'empty' | 'preparing' | 'missing' | 'ok';

export interface LutProvider {
  (clip: VideoClip): { key: string; data: Uint8Array; size: number } | null;
}

const FIT_INDEX = { blur: 0, black: 1, fill: 2 } as const;

interface Slot {
  video: HTMLVideoElement;
  gain: GainNode | null;
  /** 지금 텍스처에 올라가 있는 프레임이 어느 클립 것인지 */
  uploadedClip: string | null;
  uploadedTime: number;
  lutKey: string | null;
}

export class PreviewEngine {
  private gl: GlRenderer;
  private slots: [Slot, Slot];
  private images = new Map<string, HTMLImageElement>();
  /** 배경음악 (PRD F5) */
  readonly music: MusicPreview;
  private audio: AudioContext | null = null;
  private raf = 0;
  private cache: { clips: VideoClip[]; transitions: Project['transitions']; layout: TimelineLayout } | null = null;
  private status: PreviewStatus = 'empty';
  private approx = false;
  lutProvider: LutProvider | null = null;
  onStatus: ((s: PreviewStatus) => void) | null = null;
  /** 근사 전환을 보여주는 중 → "실제 결과와 조금 달라요" */
  onApprox: ((approx: boolean) => void) | null = null;
  /** 오디오 출력 (음악 미리보기 등에서 같이 사용) */
  get audioContext(): AudioContext | null {
    return this.audio;
  }

  constructor(
    canvas: HTMLCanvasElement,
    host: HTMLElement
  ) {
    this.gl = new GlRenderer(canvas);
    const make = (): Slot => {
      const v = document.createElement('video');
      v.crossOrigin = 'anonymous';
      v.preload = 'auto';
      v.playsInline = true;
      v.style.display = 'none';
      // 속도를 바꿔도 음높이 유지 (렌더의 atempo 와 같게)
      v.preservesPitch = true;
      host.appendChild(v);
      return { video: v, gain: null, uploadedClip: null, uploadedTime: -1, lutKey: null };
    };
    this.slots = [make(), make()];
    this.music = new MusicPreview(host);
  }

  start(): void {
    const loop = (): void => {
      try {
        this.frame();
      } catch (e) {
        console.error('[preview]', e);
      }
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  destroy(): void {
    cancelAnimationFrame(this.raf);
    for (const s of this.slots) {
      s.video.pause();
      s.video.removeAttribute('src');
      s.video.load();
      s.video.remove();
    }
    this.music.destroy();
    void this.audio?.close();
  }

  setQuality(q: 'smooth' | 'sharp'): void {
    if (q === 'sharp') this.gl.setSize(1920, 1080);
    else this.gl.setSize(960, 540);
  }

  /** 첫 재생(사용자 동작) 때 오디오 연결 */
  ensureAudio(): AudioContext {
    if (!this.audio) {
      this.audio = new AudioContext();
      for (const s of this.slots) {
        const src = this.audio.createMediaElementSource(s.video);
        s.gain = this.audio.createGain();
        s.gain.gain.value = 0;
        src.connect(s.gain).connect(this.audio.destination);
      }
      this.music.connect(this.audio);
    }
    if (this.audio.state === 'suspended') void this.audio.resume();
    return this.audio;
  }

  private layout(p: Project): TimelineLayout {
    const c = this.cache;
    if (c && c.clips === p.videoTrack && c.transitions === p.transitions) return c.layout;
    const layout = layoutTimeline(p.videoTrack, p.transitions);
    this.cache = { clips: p.videoTrack, transitions: p.transitions, layout };
    return layout;
  }

  private setStatus(s: PreviewStatus): void {
    if (s !== this.status) {
      this.status = s;
      this.onStatus?.(s);
    }
  }

  private setApprox(a: boolean): void {
    if (a !== this.approx) {
      this.approx = a;
      this.onApprox?.(a);
    }
  }

  private image(path: string): HTMLImageElement {
    let img = this.images.get(path);
    if (!img) {
      img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = mediaUrl(path);
      this.images.set(path, img);
    }
    return img;
  }

  private frame(): void {
    const p = getProject();
    const ui = useUiStore.getState();
    if (ui.playing) this.ensureAudio();
    if (!p || p.videoTrack.length === 0) {
      this.pauseAll();
      this.music.stop();
      this.gl.clear();
      this.setStatus('empty');
      this.setApprox(false);
      return;
    }
    const layout = this.layout(p);
    const media = new Map(p.media.map((m) => [m.id, m]));
    const scrub = ui.scrub;

    // 어떤 클립을 보여줄지
    let ia: number;
    let ib: number | null = null;
    let progress = 1;
    let transition = 0;
    let t = Math.min(Math.max(0, ui.playhead), Math.max(0, layout.total - 1e-3));
    if (scrub) {
      ia = p.videoTrack.findIndex((c) => c.id === scrub.clipId);
      if (ia < 0) ia = clipIndexAt(layout, t);
    } else {
      const tr = transitionAt(layout, t);
      if (tr) {
        ia = tr.index;
        ib = tr.index + 1;
        progress = 1 - tr.progress;
        const info = layout.transitions[tr.index]!;
        const def = TRANSITION_BY_ID[info.type];
        transition = def.shader;
        this.setApprox(def.approximate);
      } else {
        ia = clipIndexAt(layout, t);
        this.setApprox(false);
      }
    }

    const playing = ui.playing && !scrub;
    this.music.update(p, layout, ui.playhead, playing);
    const active = ib === null ? [ia] : [ia, ib];
    const used = new Set<number>();
    const sources: (SourceParams | null)[] = [];
    let status: PreviewStatus = 'ok';

    active.forEach((k, order) => {
      const clip = p.videoTrack[k];
      const cl = layout.clips[k];
      const m = media.get(clip.mediaId);
      const slotIdx = (k % 2) as 0 | 1;
      used.add(slotIdx);
      const slot = this.slots[slotIdx];
      const weight = ib === null ? 1 : order === 0 ? progress : 1 - progress;

      if (!m || m.missing) {
        if (order === 0) status = 'missing';
        this.setGain(slot, 0);
        sources.push(null);
        return;
      }
      if (m.proxyStatus !== 'ready' || !m.proxyPath) {
        if (order === 0) status = 'preparing';
        this.setGain(slot, 0);
        sources.push(null);
        return;
      }

      const lut = this.lutProvider?.(clip) ?? null;
      if (lut && slot.lutKey !== lut.key) {
        this.gl.setLut(slotIdx, lut.data, lut.size);
        slot.lutKey = lut.key;
      }

      if (m.type === 'image') {
        this.setGain(slot, 0);
        if (!slot.video.paused) slot.video.pause();
        const img = this.image(m.proxyPath);
        if (!img.complete || img.naturalWidth === 0) {
          sources.push(null);
          return;
        }
        if (slot.uploadedClip !== clip.id) {
          this.gl.upload(slotIdx, img, clip.fitMode === 'blur');
          slot.uploadedClip = clip.id;
          slot.uploadedTime = 0;
        }
        sources.push({ width: img.naturalWidth, height: img.naturalHeight, fit: FIT_INDEX[clip.fitMode], lut: !!lut });
        return;
      }

      const v = slot.video;
      this.ensureSrc(v, m);
      const expected = scrub ? scrub.sourceTime : sourceTime(clip, cl, t);
      this.sync(v, expected, playing, clip.speed);
      this.setGain(slot, playing && !clip.muted && m.hasAudio ? clip.volume * weight : 0);

      if (v.readyState >= 2 && !v.seeking) {
        if (slot.uploadedClip !== clip.id || v.currentTime !== slot.uploadedTime || playing) {
          this.gl.upload(slotIdx, v, clip.fitMode === 'blur' && needsBackground(v.videoWidth, v.videoHeight));
          slot.uploadedClip = clip.id;
          slot.uploadedTime = v.currentTime;
        }
      }
      if (slot.uploadedClip !== clip.id || !v.videoWidth) {
        sources.push(null);
        return;
      }
      // 영역을 고르는 동안에는 원본 화면을 그대로 보여 준다
      const stab = clip.stabilize && ui.pickRegion !== clip.id ? clip.stabilize : null;
      // 올라간 프레임 번호로 맞춘다 (프록시는 초당 30장): 시간이 어긋나면 고정한 대상이 미리보기에서만 떨린다
      const crop = stab ? stabilizeWindow(stab, Math.floor(slot.uploadedTime * STAB_FPS + 1e-3) / STAB_FPS) : undefined;
      sources.push({ width: v.videoWidth, height: v.videoHeight, fit: FIT_INDEX[clip.fitMode], lut: !!lut, crop });
    });

    // 다음 클립을 다른 슬롯에 미리 로딩 (경계에서 멈춤 없이)
    const next = (ib ?? ia) + 1;
    if (!scrub && next < p.videoTrack.length && !used.has(next % 2)) {
      const clip = p.videoTrack[next];
      const m = media.get(clip.mediaId);
      const slot = this.slots[(next % 2) as 0 | 1];
      used.add(next % 2);
      this.setGain(slot, 0);
      if (m?.type === 'video' && m.proxyStatus === 'ready' && m.proxyPath && !m.missing) {
        this.ensureSrc(slot.video, m);
        this.sync(slot.video, clip.inPoint, false, clip.speed);
      } else if (m?.type === 'image' && m.proxyPath) {
        this.image(m.proxyPath);
      }
    }
    for (let i = 0; i < 2; i++) {
      if (!used.has(i)) {
        const s = this.slots[i];
        if (!s.video.paused) s.video.pause();
        this.setGain(s, 0);
      }
    }

    this.setStatus(status);
    const [a, b] = sources;
    if (!a && !b) {
      this.gl.clear();
      return;
    }
    // 클립 i 는 슬롯 i % 2. 첫 클립이 슬롯 1 이면 텍스처 역할을 바꿔서 그린다.
    this.gl.draw({ a, b: ib === null ? null : (b ?? null), transition: ib === null ? 0 : transition, progress }, ia % 2 === 1);
  }

  private ensureSrc(v: HTMLVideoElement, m: MediaItem): void {
    const url = mediaUrl(m.proxyPath!);
    if (v.dataset.src !== url) {
      v.dataset.src = url;
      v.src = url;
    }
  }

  private sync(v: HTMLVideoElement, expected: number, play: boolean, speed: number): void {
    if (v.playbackRate !== speed) v.playbackRate = speed;
    if (v.readyState < 1) return;
    const diff = Math.abs(v.currentTime - expected);
    if (play) {
      if (v.paused) {
        if (diff > 0.05) v.currentTime = expected;
        void v.play().catch(() => undefined);
      } else if (diff > 0.3 && !v.seeking) {
        v.currentTime = expected;
      }
    } else {
      if (!v.paused) v.pause();
      if (diff > 0.5 / 30 && !v.seeking) v.currentTime = expected;
    }
  }

  private setGain(s: Slot, value: number): void {
    if (s.gain && Math.abs(s.gain.gain.value - value) > 0.001) s.gain.gain.value = value;
  }

  private pauseAll(): void {
    for (const s of this.slots) {
      if (!s.video.paused) s.video.pause();
      this.setGain(s, 0);
    }
  }
}

function needsBackground(w: number, h: number): boolean {
  return w > 0 && h > 0 && Math.abs(w / h - 16 / 9) > 0.01;
}
