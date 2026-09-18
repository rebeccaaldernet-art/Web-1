import type { Metadata, Viewport } from "next";
import "./globals.css";

export const viewport: Viewport = {width:"device-width",initialScale:1,viewportFit:"cover",interactiveWidget:"resizes-content"};

export const metadata: Metadata = {
  title: "RA Studio — Team workspace",
  description: "Conversations and shared files, together in one team workspace.",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
