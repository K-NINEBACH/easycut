// 미리보기 자막 (PRD F4). 렌더의 ASS 와 같은 값(shared/subtitles.ts)으로 그린다:
// 크기·여백은 1080p 픽셀 → 미리보기 폭 비례(100cqw / 1920), 글자 크기는 libass 와 같은 기준으로 환산.
import { useMemo } from 'react';
import { resourceUrl } from '@shared/mediaUrl';
import {
  FONTS,
  FREE_POS_MARGIN,
  MARGIN_H,
  MARGIN_V,
  PLAY_RES,
  effectiveStyle,
  resolveStyle,
  visibleSubtitles,
  wrapSubtitle
} from '@shared/subtitles';
import * as ops from '@shared/ops';
import { liveEdit, useProjectStore } from '../../store/project';
import { useUiStore } from '../../store/ui';
import { useTimelineLayout } from '../../hooks/useTimelineLayout';

// 동봉 글꼴을 한 번만 등록. 화면 글꼴(Pretendard 일반 굵기)과 섞이지 않게 자막 전용 이름으로
const cssFamily = (family: string): string => `EzSub ${family}`;
let fontsInjected = false;
export function ensureSubtitleFonts(): void {
  if (fontsInjected) return;
  fontsInjected = true;
  const css = Object.values(FONTS)
    .map(
      (f) =>
        `@font-face{font-family:"${cssFamily(f.family)}";src:url("${resourceUrl(`fonts/${f.file}`)}");font-weight:${f.bold ? 700 : 400};font-display:block}`
    )
    .join('\n');
  const el = document.createElement('style');
  el.dataset.ezcut = 'subtitle-fonts';
  el.textContent = css;
  document.head.appendChild(el);
}

const u = (px: number): string => `calc(${px} * 100cqw / ${PLAY_RES.width})`;

/** #RRGGBB + 불투명도 → rgba() */
const boxBackground = (hex: string, alpha: number): string =>
  `rgba(${parseInt(hex.slice(1, 3), 16)},${parseInt(hex.slice(3, 5), 16)},${parseInt(hex.slice(5, 7), 16)},${alpha})`;

export default function SubtitleOverlay(): JSX.Element | null {
  ensureSubtitleFonts();
  const subs = useProjectStore((s) => s.project?.subtitles);
  const def = useProjectStore((s) => s.project?.defaultSubtitleStyle);
  const playhead = useUiStore((s) => s.playhead);
  const layout = useTimelineLayout();
  const items = useMemo(() => (subs ? visibleSubtitles(layout, subs) : []), [layout, subs]);
  const cur = items.find((x) => playhead >= x.start && playhead < x.end);
  if (!cur || !def) return null;
  const sub = cur.sub;

  // 끌어서 옮기기: "이 자막만" 모양이 있는 자막은 그 자막만, 아니면 모든 자막 (패널의 모양 바꾸기와 같은 규칙)
  const startDrag = (e: React.PointerEvent<HTMLDivElement>): void => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    useUiStore.getState().select({ kind: 'subtitle', id: sub.id });
    const frame = e.currentTarget.parentElement!.getBoundingClientRect();
    const box = e.currentTarget.getBoundingClientRect();
    // 누른 점과 덩어리 가운데의 차이를 유지
    const dx = e.clientX - (box.left + box.width / 2);
    const dy = e.clientY - (box.top + box.height / 2);
    const target = sub.styleOverride ? sub.id : 'all';
    let live: ReturnType<typeof liveEdit> | null = null;
    const move = (ev: PointerEvent): void => {
      const x = (ev.clientX - dx - frame.left) / frame.width;
      const y = (ev.clientY - dy - frame.top) / frame.height;
      const m = FREE_POS_MARGIN;
      const pos = { x: Math.min(1 - m, Math.max(m, x)), y: Math.min(1 - m, Math.max(m, y)) };
      live ??= liveEdit(target === 'all' ? '자막 옮기기' : '이 자막 옮기기');
      live.update((p) => ops.setSubtitleStyle(p, target, pos));
    };
    const up = (): void => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      live?.end();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  return (
    <SubtitleText
      text={sub.text}
      style={resolveStyle(effectiveStyle(def, sub))}
      testId="subtitle-overlay"
      onPointerDown={startDrag}
    />
  );
}

/** 자막 한 덩어리 (미리보기·모양 카드 공용) */
export function SubtitleText({
  text,
  style,
  testId,
  onPointerDown
}: {
  text: string;
  style: ReturnType<typeof resolveStyle>;
  testId?: string;
  /** 있으면 끌어서 옮길 수 있다 (미리보기) */
  onPointerDown?: (e: React.PointerEvent<HTMLDivElement>) => void;
}): JSX.Element {
  const { preset, size, position, pos } = style;
  const box = preset.boxAlpha !== undefined;
  const lines = wrapSubtitle(text);
  // 직접 옮긴 자리면 덩어리 가운데를 그 점에 (ASS \an5\pos 와 같게)
  const place: React.CSSProperties = pos
    ? {
        left: `${(pos.x / PLAY_RES.width) * 100}%`,
        top: `${(pos.y / PLAY_RES.height) * 100}%`,
        width: 'max-content',
        transform: 'translate(-50%, -50%)'
      }
    : {
        left: u(MARGIN_H),
        right: u(MARGIN_H),
        ...(position === 'top' ? { top: u(MARGIN_V) } : position === 'bottom' ? { bottom: u(MARGIN_V) } : { top: '50%', transform: 'translateY(-50%)' })
      };
  return (
    <div
      className={`absolute text-center ${onPointerDown ? 'cursor-move' : 'pointer-events-none'}`}
      style={place}
      data-testid={testId}
      onPointerDown={onPointerDown}
    >
      {lines.map((line, i) => (
        <div key={i} style={{ lineHeight: u(size), height: u(size) }}>
          <span
            style={{
              fontFamily: `"${cssFamily(preset.font.family)}"`,
              fontWeight: preset.font.bold ? 700 : 400,
              fontSize: u(size * preset.font.ratio),
              color: preset.color,
              whiteSpace: 'pre',
              ...(box
                ? {
                    background: boxBackground(preset.boxColor ?? '#000000', preset.boxAlpha!),
                    padding: `${u(preset.outline)} ${u(preset.outline)}`,
                    boxDecorationBreak: 'clone'
                  }
                : {
                    WebkitTextStroke: `${u(preset.outline * 2)} ${preset.outlineColor}`,
                    paintOrder: 'stroke fill'
                  })
            }}
          >
            {line}
          </span>
        </div>
      ))}
    </div>
  );
}
