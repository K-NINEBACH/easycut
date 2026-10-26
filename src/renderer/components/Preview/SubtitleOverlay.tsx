// 미리보기 자막 (PRD F4). 렌더의 ASS 와 같은 값(shared/subtitles.ts)으로 그린다:
// 크기·여백은 1080p 픽셀 → 미리보기 폭 비례(100cqw / 1920), 글자 크기는 libass 와 같은 기준으로 환산.
import { useMemo } from 'react';
import { resourceUrl } from '@shared/mediaUrl';
import {
  FONTS,
  MARGIN_H,
  MARGIN_V,
  PLAY_RES,
  effectiveStyle,
  resolveStyle,
  visibleSubtitles,
  wrapSubtitle
} from '@shared/subtitles';
import { useProjectStore } from '../../store/project';
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

export default function SubtitleOverlay(): JSX.Element | null {
  ensureSubtitleFonts();
  const subs = useProjectStore((s) => s.project?.subtitles);
  const def = useProjectStore((s) => s.project?.defaultSubtitleStyle);
  const playhead = useUiStore((s) => s.playhead);
  const layout = useTimelineLayout();
  const items = useMemo(() => (subs ? visibleSubtitles(layout, subs) : []), [layout, subs]);
  const cur = items.find((x) => playhead >= x.start && playhead < x.end);
  if (!cur || !def) return null;
  return <SubtitleText text={cur.sub.text} style={resolveStyle(effectiveStyle(def, cur.sub))} testId="subtitle-overlay" />;
}

/** 자막 한 덩어리 (미리보기·모양 카드 공용) */
export function SubtitleText({
  text,
  style,
  testId
}: {
  text: string;
  style: ReturnType<typeof resolveStyle>;
  testId?: string;
}): JSX.Element {
  const { preset, size, position } = style;
  const box = preset.boxAlpha !== undefined;
  const lines = wrapSubtitle(text);
  const place: React.CSSProperties =
    position === 'top' ? { top: u(MARGIN_V) } : position === 'bottom' ? { bottom: u(MARGIN_V) } : { top: '50%', transform: 'translateY(-50%)' };
  return (
    <div
      className="pointer-events-none absolute text-center"
      style={{ left: u(MARGIN_H), right: u(MARGIN_H), ...place }}
      data-testid={testId}
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
                    background: `rgba(0,0,0,${preset.boxAlpha})`,
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
