import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

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
        <div className="flex items-center justify-center min-h-[400px] p-6">
          <Card raised className="max-w-md w-full p-8 flex flex-col items-center gap-5 text-center">
            <div className="w-14 h-14 rounded-full bg-status-fail/10 flex items-center justify-center">
              <AlertTriangle className="w-7 h-7 text-status-fail" aria-hidden="true" />
            </div>

            <div className="flex flex-col gap-2">
              <h2 className="text-lg font-display font-semibold text-ink">
                Something went wrong
              </h2>
              {this.state.error && (
                <p className="font-data text-xs text-ink-muted break-all">
                  {this.state.error.message}
                </p>
              )}
            </div>

            <Button variant="secondary" size="md" onClick={this.handleReload}>
              Reload page
            </Button>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}
