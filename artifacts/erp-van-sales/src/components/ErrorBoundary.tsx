import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

// App-wide error boundary. Previously an uncaught render error unmounted the
// whole React tree → blank white screen with no recovery. This catches it and
// shows a recoverable fallback (reload) instead. Mounted at the root in App.tsx.
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Surface in the console for diagnostics; a real error-tracking sink
    // (Sentry etc.) is a separate, later phase.
    console.error("Uncaught render error:", error, info.componentStack);
  }

  handleReload = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div
        dir="rtl"
        style={{
          minHeight: "100dvh",
          display: "grid",
          placeItems: "center",
          padding: 24,
          background: "#0F1117",
          color: "#F8FAFC",
          fontFamily: "'Cairo', 'Segoe UI', Tahoma, sans-serif",
        }}
      >
        <div style={{ maxWidth: 460, textAlign: "center" }}>
          <div style={{ fontSize: 44, marginBottom: 12 }}>⚠️</div>
          <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>
            حدث خطأ غير متوقع
          </h1>
          <p style={{ color: "#94a3b8", fontSize: 15, lineHeight: 1.7, marginBottom: 24 }}>
            واجه التطبيق مشكلة غير متوقعة. يمكنك إعادة تحميل الصفحة للمتابعة. إذا
            تكرر الخطأ، يرجى التواصل مع الدعم.
          </p>
          <button
            type="button"
            onClick={this.handleReload}
            style={{
              background: "#0E9AA7",
              color: "#fff",
              border: "none",
              borderRadius: 10,
              padding: "11px 22px",
              fontSize: 15,
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            إعادة تحميل الصفحة
          </button>
        </div>
      </div>
    );
  }
}
