import { Component, type ComponentChildren } from 'preact';
import { logger } from '../../core/logger-instance';

interface BoundaryProps {
  children: ComponentChildren;
}

interface BoundaryState {
  error: Error | null;
}

/**
 * Preact error boundary — a white screen is a defect (Build Plan §6.2).
 * Wraps the whole shell in M0; pane-level boundaries arrive with panes.
 */
export class ErrorBoundary extends Component<BoundaryProps, BoundaryState> {
  override state: BoundaryState = { error: null };

  static override getDerivedStateFromError(error: Error): BoundaryState {
    return { error };
  }

  override componentDidCatch(error: Error, info: { componentStack?: string }): void {
    // componentStack is dev-detail; keep it out of the redacted log context
    logger.error('UI crashed inside error boundary', { message: error.message });
    void info;
  }

  override render() {
    if (this.state.error) {
      return (
        <div class="crash-screen">
          <div class="crash-panel">
            <h1>Something went wrong</h1>
            <p>The editor hit an unexpected error. Your audio is safe on your device.</p>
            <button class="btn-primary" onClick={() => window.location.reload()}>
              Reload WaveForge
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
