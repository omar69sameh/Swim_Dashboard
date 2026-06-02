import type { Metadata } from "next";
import "./globals.css";

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
    <html lang="en" className="dark">
      <body className="min-h-screen bg-ocean-950 text-slate-100">
        {children}
      </body>
    </html>
  );
}
