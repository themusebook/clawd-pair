export default { content: ["./index.html", "./src/**/*.{ts,tsx}"], theme: { extend: {
  colors: { ink: "#07060b", claw: "#ff4d2e", pinch: "#ffb02e", mint: "#3dffb0", haze: "#9a8cff" },
  fontFamily: { display: ["'Space Grotesk'", "system-ui"], mono: ["'JetBrains Mono'", "monospace"] },
  keyframes: { float: { "0%,100%": { transform: "translateY(0)" }, "50%": { transform: "translateY(-12px)" } }, flow: { to: { strokeDashoffset: "-40" } } },
  animation: { float: "float 6s ease-in-out infinite", flow: "flow 1.2s linear infinite" } } }, plugins: [] };
