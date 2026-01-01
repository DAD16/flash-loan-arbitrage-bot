import { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('ErrorBoundary caught an error:', error);
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    console.error('Component stack:', errorInfo.componentStack);
    this.setState({ errorInfo });
  }

  handleReload = (): void => {
    window.location.reload();
  };

  handleReset = (): void => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-screen bg-matrix-bg flex items-center justify-center p-6">
          <div className="max-w-lg w-full bg-matrix-surface border border-matrix-danger/50 rounded-lg p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-matrix-danger/20 rounded-lg">
                <AlertTriangle className="w-6 h-6 text-matrix-danger" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-matrix-text">
                  Something went wrong
                </h2>
                <p className="text-sm text-matrix-text-muted">
                  The application encountered an unexpected error
                </p>
              </div>
            </div>

            {this.state.error && (
              <div className="mb-4 p-3 bg-matrix-bg rounded border border-matrix-border">
                <p className="text-sm font-mono text-matrix-danger break-all">
                  {this.state.error.message}
                </p>
              </div>
            )}

            {this.state.errorInfo && (
              <details className="mb-4">
                <summary className="text-sm text-matrix-text-muted cursor-pointer hover:text-matrix-text">
                  View stack trace
                </summary>
                <pre className="mt-2 p-3 bg-matrix-bg rounded border border-matrix-border text-xs text-matrix-text-muted overflow-auto max-h-48">
                  {this.state.errorInfo.componentStack}
                </pre>
              </details>
            )}

            <div className="flex gap-3">
              <button
                onClick={this.handleReset}
                className="flex-1 px-4 py-2 bg-matrix-surface-hover border border-matrix-border rounded text-matrix-text hover:border-matrix-primary transition-colors"
              >
                Try Again
              </button>
              <button
                onClick={this.handleReload}
                className="flex-1 px-4 py-2 bg-matrix-primary text-black rounded hover:bg-matrix-primary/80 transition-colors flex items-center justify-center gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                Reload Page
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
