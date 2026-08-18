import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./ui-v040.css";
import "./ui-v080.css";
import "./ui-v081.css";
import "./ui-v090.css";
import "./ui-v091.css";
import "./ui-v092.css";
import "./ui-v094.css";
import "./ui-v095.css";
import "./ui-v096.css";
import "./ui-v097.css";
import "./ui-v098.css";
import "./ui-v0910.css";
import "./ui-v0914.css";
import "./ui-v0922.css";
import "./ui-v0923.css";
import "./ui-v0924.css";
import "./ui-v0926.css";
import "./ui-settings-refined.css";
import "./ui-icon-consistency.css";
import "./ui-v0928.css";
import "./ui-v0929.css";
import "./ui-v0930.css";

type ErrorBoundaryState = { error?: Error };

class ErrorBoundary extends React.Component<React.PropsWithChildren, ErrorBoundaryState> {
  state: ErrorBoundaryState = {};

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <main className="root-error">
          <section>
            <h1>WhyNavo 暂时没有正常打开</h1>
            <p>页面脚本遇到了错误。你的本机数据不会因此被清除，请重新加载后再试。</p>
            <button onClick={() => window.location.reload()}>重新加载</button>
          </section>
        </main>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);

const canUseWebAppCache = import.meta.env.PROD && (
  window.location.protocol === "https:"
  || ["localhost", "127.0.0.1"].includes(window.location.hostname)
);
if (canUseWebAppCache && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker
      .register("./sw.js")
      .then((registration) => registration.update())
      .catch(() => undefined);
  });
}

if (canUseWebAppCache && navigator.storage?.persist) {
  window.addEventListener("load", () => {
    void navigator.storage.persist().catch(() => false);
  });
}
