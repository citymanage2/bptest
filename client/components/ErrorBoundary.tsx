import { Component, type ReactNode } from "react";
import { AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="flex flex-col items-center justify-center py-20 text-center px-4">
          <AlertCircle className="w-12 h-12 text-red-400 mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">
            Произошла ошибка при отображении страницы
          </h2>
          <p className="text-gray-500 mb-1 text-sm max-w-md">
            {this.state.error.message}
          </p>
          <p className="text-gray-400 text-xs mb-6 max-w-md">
            Попробуйте обновить страницу. Если ошибка повторяется — обратитесь в поддержку.
          </p>
          <Button
            variant="outline"
            onClick={() => {
              this.setState({ error: null });
              window.location.reload();
            }}
          >
            <RefreshCw className="w-4 h-4" />
            Обновить страницу
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}
