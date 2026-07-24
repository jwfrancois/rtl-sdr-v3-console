import type { Metadata } from "next";
import { Geist, Geist_Mono, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono-display",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});

export const metadata: Metadata = {
  title: "RTL-SDR V3 — Magical SDR Console",
  description:
    "High-definition web console for RTL-SDR V3 software defined radio. Real-time spectrum, waterfall, demodulation, and frequency bookmarks.",
  keywords: [
    "RTL-SDR",
    "Software Defined Radio",
    "SDR",
    "Spectrum Analyzer",
    "Waterfall",
    "FM",
    "AM",
    "SSB",
  ],
  authors: [{ name: "Z.ai" }],
  icons: {
    icon: "https://z-cdn.chatglm.cn/z-ai/static/logo.svg",
  },
  openGraph: {
    title: "RTL-SDR V3 — Magical SDR Console",
    description: "High-definition web console for RTL-SDR V3 software defined radio.",
    siteName: "RTL-SDR V3 Console",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning className="dark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${jetbrainsMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
