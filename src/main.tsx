import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./app/App";
import { RendererErrorBoundary } from "./app/RendererErrorBoundary";
import "./design/tokens.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <RendererErrorBoundary>
      <App />
    </RendererErrorBoundary>
  </React.StrictMode>,
);
