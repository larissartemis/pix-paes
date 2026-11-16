import type { Metadata, Viewport } from "next";
import { SwRegister } from "@/components/SwRegister";
import "./globals.css";

export const metadata: Metadata = {
  title: "Pix Pães — Leitor de Comprovantes",
  description:
    "PWA para ler comprovantes Pix compartilhados (imagem, PDF ou link) e exibir os dados do pagador.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Pix Pães",
  },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/icons/icon-192.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#1e3a8a",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" className="h-full antialiased">
      <body className="min-h-full bg-slate-50 font-sans text-slate-900 flex flex-col">
        <SwRegister />
        {children}
      </body>
    </html>
  );
}
