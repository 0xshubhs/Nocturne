import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Geist_Mono, Instrument_Serif } from "next/font/google";
import "./globals.css";
import { WalletProvider } from "@/lib/midnight";
import { BRAND } from "@/lib/brand";

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// One serif, used only for display headings. It is the difference between
// "a dark dashboard" and something that looks designed.
const display = Instrument_Serif({
  variable: "--font-display",
  subsets: ["latin"],
  weight: "400",
});

export const metadata: Metadata = {
  title: `${BRAND.name} — ${BRAND.tagline}`,
  description: BRAND.summary,
};

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${geistMono.variable} ${display.variable} h-full antialiased`}
    >
      <head>
        {/*
          Satoshi (Indian Type Foundry) is free for commercial use, but ITF's
          licence requires the webfont be served from Fontshare rather than
          self-hosted without written consent — so it is a CDN link, not a
          committed font file.
        */}
        <link rel="preconnect" href="https://api.fontshare.com" />
        <link rel="preconnect" href="https://cdn.fontshare.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://api.fontshare.com/v2/css?f%5B%5D=satoshi@400,500,700,900&display=swap"
        />
      </head>
      <body className="min-h-full flex flex-col">
        <WalletProvider>{children}</WalletProvider>
      </body>
    </html>
  );
}
