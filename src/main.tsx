import { ConvexProvider, ConvexReactClient } from "convex/react";

import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

const DEFAULT_LOCAL_CONVEX_URL = "http://127.0.0.1:3210";
const convexUrl =
  import.meta.env.VITE_CONVEX_URL?.trim() || DEFAULT_LOCAL_CONVEX_URL;

if (import.meta.env.DEV && !import.meta.env.VITE_CONVEX_URL) {
  console.warn(
    `[openpeec] VITE_CONVEX_URL is not set. Falling back to local Convex at ${DEFAULT_LOCAL_CONVEX_URL}.`
  );
}

const convex = new ConvexReactClient(convexUrl);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ConvexProvider client={convex}>
      <App />
    </ConvexProvider>
  </React.StrictMode>
);
