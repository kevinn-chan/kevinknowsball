import type { Metadata } from "next";
import { Bebas_Neue, Inter } from "next/font/google";
import "./globals.css";

const bebasNeue = Bebas_Neue({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-bebas",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "WC 2026 AI Predictor",
  description: "48 teams. 104 matches. 10,000 simulated universes. AI-powered World Cup 2026 predictions.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${bebasNeue.variable} ${inter.variable} h-full`}
    >
      <body className="min-h-full antialiased" style={{ background: "#0a1a0f", color: "#ffffff" }}>
        {children}
      </body>
    </html>
  );
}
