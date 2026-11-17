import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Etsy Poster Studio",
  description: "Etsy poster ürünleri için mockup ve export otomasyonu",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="tr" className="h-full antialiased">
      <body className="min-h-full bg-[#f6f5f1] text-slate-900">{children}</body>
    </html>
  );
}
