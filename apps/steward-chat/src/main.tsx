import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "../../shared/oorgos-theme.css";
import "./app.css";
import "./receipt.css";
import "../../shared/operator-shell.css";
import "../../shared/passkey-auth.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
