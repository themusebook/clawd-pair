import { Buffer } from "buffer"; (window as any).Buffer = Buffer;
import { StrictMode } from "react"; import { createRoot } from "react-dom/client";
import "./index.css"; import App from "./App"; import Proof from "./Proof"; import BuildLog from "./BuildLog";
const path = window.location.pathname.replace(/\/+$/, "");
createRoot(document.getElementById("root")!).render(<StrictMode>{path === "/proof" ? <Proof /> : path === "/log" ? <BuildLog /> : <App />}</StrictMode>);
