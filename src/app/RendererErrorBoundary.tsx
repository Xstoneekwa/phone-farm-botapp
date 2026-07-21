import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = { children: ReactNode };
type State = { failed: boolean };

export class RendererErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[BotApp] renderer boundary", {
      name: error.name,
      message: error.message.slice(0, 240),
      componentStack: info.componentStack?.slice(0, 4000) || null,
    });
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="renderer-error-boundary" role="alert">
        <section>
          <p className="eyebrow">BOTAPP / RENDERER</p>
          <h1>BotApp could not render this view.</h1>
          <p>The error was recorded without credentials. Retry the interface; no account or device action was started.</p>
          <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>Retry</button>
        </section>
      </main>
    );
  }
}
