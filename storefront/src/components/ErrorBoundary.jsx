// components/ErrorBoundary.jsx — B4 ErrorBoundary: KHONG BAO GIO MAN HINH TRANG.
// Global + theo trang. Trang loi co nut "Thu lai" + lien ket ve trang chu.
import React from 'react';
import { ErrorState } from './ui/States.jsx';
import Button from './ui/Button.jsx';

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
    this.reset = this.reset.bind(this);
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Khong in du lieu ca nhan / token ra console
    if (typeof console !== 'undefined' && console.error) {
      console.error('[ErrorBoundary]', this.props.name || 'app', error?.message || error);
    }
  }

  reset() {
    this.setState({ error: null });
    this.props.onReset?.();
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    // Loi 1 trang con -> render fallback cua trang do
    if (this.props.fallback) return this.props.fallback({ error, reset: this.reset });

    return (
      <div className="container" style={{ paddingBlock: 'var(--s-7)' }}>
        <ErrorState
          title="Rất tiếc, trang này gặp lỗi"
          description={this.props.quiet ? null : 'Đã xảy ra lỗi không mong muốn. Bạn có thể thử lại hoặc quay về trang chủ.'}
          onRetry={this.reset}
        />
        <div style={{ marginTop: 'var(--s-4)', display: 'flex', gap: 'var(--s-2)', justifyContent: 'center' }}>
          <Button variant="subtle" onClick={this.reset}>Tải lại trang</Button>
          <Button variant="ghost" onClick={() => { window.location.href = '/'; }}>Về trang chủ</Button>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
