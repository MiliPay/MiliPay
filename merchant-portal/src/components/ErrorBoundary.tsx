import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@milipay/shared/components/ui/Button";

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  private handleReload = (): void => {
    window.location.reload();
  };

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-screen bg-ledger flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-ledger-raised border border-white/[0.08] rounded-2xl p-6 text-center space-y-4 shadow-2xl">
            <div className="w-12 h-12 rounded-full bg-status-fail/10 border border-status-fail/20 flex items-center justify-center mx-auto text-status-fail">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h1 className="text-xl font-display font-bold text-ink">
              Something went wrong
            </h1>
            <p className="text-sm text-ink-muted">
              An unexpected error occurred in the Merchant Portal.
            </p>
            {this.state.error && (
              <pre className="text-left text-xs bg-black/40 p-3 rounded-lg overflow-x-auto text-status-fail/80 border border-white/[0.04] font-mono">
                {this.state.error.message}
              </pre>
            )}
            <Button variant="primary" onClick={this.handleReload} className="w-full">
              Reload Application
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
