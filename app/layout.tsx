import type { Metadata } from "next";
import { Inter, Outfit } from "next/font/google";
import "./globals.css";

// next/font downloads and self-hosts fonts at build time — no external network
// request on page load, no layout shift, no privacy leak to Google.
const inter = Inter({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
  variable: "--font-inter",
  display: "swap",
});

const outfit = Outfit({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
  variable: "--font-outfit",
  display: "swap",
});

export const metadata: Metadata = {
  title: "SwimMate — Swimming Performance Dashboard",
  description: "AI-powered swimming stroke analysis for coaches and athletes",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`dark ${inter.variable} ${outfit.variable}`}>
      <body className="min-h-screen bg-ocean-950 text-slate-100">
        {children}
      </body>
    </html>
  );
}
