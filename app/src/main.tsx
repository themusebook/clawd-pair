import { Buffer } from "buffer"; (window as any).Buffer = Buffer;
import { StrictMode } from "react"; import { createRoot } from "react-dom/client";
import "./index.css"; import App from "./App"; import Proof from "./Proof"; import BuildLog from "./BuildLog";
const path = window.location.pathname.replace(/\/+$/, "");
// Hidden owner route (voice builds only): stores the owner token for this tab, then returns home.
if (import.meta.env.VITE_VOICE_ENABLED === "true" && path === "/owner") { const t = window.prompt("Owner token"); if (t) sessionStorage.setItem("pinch-owner", t.trim()); window.location.replace("/"); }
createRoot(document.getElementById("root")!).render(<StrictMode>{path === "/proof" ? <Proof /> : path === "/log" ? <BuildLog /> : <App />}</StrictMode>);
