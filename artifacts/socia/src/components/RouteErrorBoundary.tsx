import { Component, type ErrorInfo, type ReactNode } from "react";
import { Home, RefreshCw, AlertTriangle } from "lucide-react";

interface Props { children: ReactNode }
interface State { error: Error | null }

/**
 * RouteErrorBoundary prevents a failed lazy chunk or page render from
 * becoming a permanent black screen. It is deliberately local to the app
 * route tree so auth/session providers stay mounted.
 */
export class RouteErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[Socia] Route render error", error, info);
  }

  reset = () => {
    this.setState({ error: null });
  };

  goHome = () => {
    window.history.replaceState({}, "", "/");
    window.location.reload();
  };

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="flex h-full min-h-0 items-center justify-center bg-black px-6 text-center">
        <div className="w-full max-w-sm">
          <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-full bg-white/10">
            <AlertTriangle className="h-6 w-6 text-white/70" />
          </div>
          <h2 className="text-lg font-semibold text-white">Socia could not open this page</h2>
          <p className="mt-2 text-sm text-white/50">The page failed to render. Your account and data are still safe.</p>
          <div className="mt-6 flex justify-center gap-3">
            <button onClick={this.reset} className="inline-flex h-10 items-center gap-2 rounded-xl bg-white/10 px-4 text-sm font-semibold text-white">
              <RefreshCw className="h-4 w-4" /> Try again
            </button>
            <button onClick={this.goHome} className="inline-flex h-10 items-center gap-2 rounded-xl bg-white px-4 text-sm font-semibold text-black">
              <Home className="h-4 w-4" /> Home
            </button>
          </div>
        </div>
      </div>
    );
  }
}
