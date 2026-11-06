import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_URL || "http://localhost:3000"),
  openGraph: { title: "Bharosa: check before you pay", description: "Forward a seller's message, screenshot or link. Get red, yellow or green in seconds, then pay safe sellers with PayPal.", type: "website" },
  twitter: { card: "summary_large_image" },
  title: "Bharosa: check before you pay",
  description: "Forward any seller's message, link or screenshot. Bharosa tells you in seconds if it's safe, then lets you pay with PayPal protection.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#faf7f2",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh font-sans">{children}</body>
    </html>
  );
}
