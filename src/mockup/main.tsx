import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
// styles.css is pulled in for the design tokens (--font-display, --font-mono,
// --primary) and the webfont stack. keepcase.css is the case itself, shared
// with the archive; mockup.css is only this page's chrome around it.
import "../styles.css";
import "../components/keepcase.css";
import "./mockup.css";
import { MockupApp } from "./MockupApp";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <MockupApp />
  </StrictMode>,
);
