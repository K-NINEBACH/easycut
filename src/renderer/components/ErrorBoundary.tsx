import { Component, type ReactNode } from 'react';

/** 화면을 그리다 예상 못 한 오류가 나면 흰 화면 대신 쉬운 안내 (작업은 자동 저장돼 있음) */
export default class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error): { error: Error } {
    return { error };
  }

  componentDidCatch(error: Error): void {
    console.error('[easycut] 화면 오류', error);
  }

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center" data-testid="error-boundary">
        <h2 className="text-xl font-semibold">화면에 문제가 생겼어요</h2>
        <p className="text-sm text-gray-600">작업 내용은 자동으로 저장돼 있어요. 아래 버튼을 눌러 다시 열어 주세요.</p>
        <div className="flex gap-2">
          <button
            className="ez-btn-primary px-5 py-2.5 text-sm"
            onClick={() => this.setState({ error: null })}
          >
            다시 시도
          </button>
          <button
            className="ez-btn-secondary px-5 py-2.5 text-sm"
            onClick={() => void navigator.clipboard.writeText(`${error.message}\n${error.stack ?? ''}`)}
          >
            오류 내용 복사
          </button>
        </div>
      </div>
    );
  }
}
