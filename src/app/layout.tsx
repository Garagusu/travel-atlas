import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Travel Atlas", template: "%s · Travel Atlas" },
  description: "A private journal of the places you've been across the United States.",
  robots: { index: false, follow: false },
  appleWebApp: { capable: true, title: "Travel Atlas", statusBarStyle: "default" },
};

export const viewport: Viewport = { themeColor: "#faf8f4", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
