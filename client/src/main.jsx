import React from "react";
import ReactDOM from "react-dom/client";
import { MotionConfig } from "motion/react";
import "@fontsource-variable/bricolage-grotesque";
import "@fontsource-variable/instrument-sans";
import "@fontsource/instrument-serif/400-italic.css";
import "./styles/theme.css";
import "./index.css";
import "./styles/platform.css";
import "./styles/features.css";
import App from "./App.jsx";
import { ToastProvider } from "./lib/toast.jsx";
import { AuthProvider } from "./lib/auth.jsx";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    {/* reducedMotion="user": the few transform animations are skipped when the OS asks for reduced motion. */}
    <MotionConfig reducedMotion="user">
      <ToastProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </ToastProvider>
    </MotionConfig>
  </React.StrictMode>
);
