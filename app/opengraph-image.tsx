import { ImageResponse } from "next/og";

export const alt = "Bharosa: check the seller before the money goes";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OG() {
  const card = (bg: string, line: string, col: string, title: string, text: string) => (
    <div style={{ display: "flex", flexDirection: "column", background: bg, border: `3px solid ${line}`, borderRadius: 28, padding: 28, width: 400 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <div style={{ width: 20, height: 20, borderRadius: 999, background: col }} />
        <div style={{ fontSize: 38, fontWeight: 800, color: col }}>{title}</div>
      </div>
      <div style={{ fontSize: 24, marginTop: 10, color: "#1c1917" }}>{text}</div>
    </div>
  );
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#faf7f2", padding: 72, justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", flexDirection: "column", width: 600 }}>
          <div style={{ display: "flex", fontSize: 30, fontWeight: 800, letterSpacing: 3, color: "#1c1917" }}><span>BHAROSA</span><span style={{ color: "#15803d" }}>.</span></div>
          <div style={{ fontSize: 76, fontWeight: 800, lineHeight: 1.04, marginTop: 24, color: "#1c1917" }}>Check the seller before the money goes.</div>
          <div style={{ fontSize: 28, marginTop: 24, color: "#57534e" }}>Free scam check in English, Urdu and Roman Urdu.</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          {card("#fee2e2", "#fca5a5", "#b91c1c", "Don't pay", "Crypto only, price 77% too low.")}
          {card("#dcfce7", "#86efac", "#15803d", "Looks safe", "Fair price. Pay with PayPal.")}
        </div>
      </div>
    ),
    size,
  );
}
