// 앱 로고: 블루→민트 그라데이션 둥근 네모 + 흰 재생 표시 (설치 아이콘 build/icon.svg 와 같은 모양)
export default function Logo({ size = 32 }: { size?: number }): JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <linearGradient id="ez-logo" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#3b82f6" />
          <stop offset="1" stopColor="#10b981" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill="url(#ez-logo)" />
      <path d="M25 19.5v25a2 2 0 0 0 3 1.7l20.5-12.5a2 2 0 0 0 0-3.4L28 17.8a2 2 0 0 0-3 1.7z" fill="#fff" />
    </svg>
  );
}
