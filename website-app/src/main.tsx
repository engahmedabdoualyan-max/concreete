import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";
import { ensureFirebaseAuth } from "./firebase/config";
import { redirectDesktopToLogin } from "./desktop-start";

// Desktop builds (Tauri) open on the login screen when logged out;
// browsers keep the current guest-mode landing page.
redirectDesktopToLogin();

// Anonymous Firebase auth must complete (or gracefully fail) before mount so
// no Firestore read/write races ahead of `request.auth` once rules enforce it.
ensureFirebaseAuth()
  .catch(() => {})
  .finally(() => {
    createRoot(document.getElementById("root")!).render(
      <StrictMode>
        <App />
      </StrictMode>
    );
  });
