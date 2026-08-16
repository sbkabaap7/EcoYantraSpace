import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Space_Grotesk, Inter } from "next/font/google";

import { Providers } from "../components/application/providers";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space",
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  weight: ["300", "400", "500", "600"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "EcoYantraSpace — Climate Intelligence Platform",
  description:
    "Three layers of AI-powered environmental intelligence: carbon footprint forecasting, IoT anomaly detection, and satellite forest change monitoring.",
  keywords: ["climate intelligence", "carbon forecasting", "anomaly detection", "forest monitoring", "AI", "sustainability"],
  openGraph: {
    title: "EcoYantraSpace — Climate Intelligence Platform",
    description: "Make the invisible decisive. Three ML-powered systems for a living planet.",
    type: "website",
  },
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" className={`${spaceGrotesk.variable} ${inter.variable}`} data-scroll-behavior="smooth">
      <body><Providers>{children}</Providers></body>
    </html>
  );
}
