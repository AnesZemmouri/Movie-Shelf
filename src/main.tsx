import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
// The keepcase faces are shared with the /mockup.html study, so they live in
// their own sheet rather than in the mockup folder the archive must not depend on.
import "./components/keepcase.css";
import App from "./App.tsx";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
