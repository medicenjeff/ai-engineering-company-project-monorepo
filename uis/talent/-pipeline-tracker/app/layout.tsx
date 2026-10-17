import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Pipeline Tracker | Nexova",
    template: "%s | Pipeline Tracker",
  },
  description:
    "Seguimiento de candidaturas del proceso de selección de Nexova",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-zinc-50">
        <header className="border-b border-zinc-200 bg-white">
          <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-4">
            <Link href="/" className="flex items-center gap-2 font-semibold text-zinc-900">
              <span className="flex h-7 w-7 items-center justify-center rounded-md bg-zinc-900 text-sm text-white">
                N
              </span>
              <span className="text-sm">
                Pipeline Tracker <span className="font-normal text-zinc-400">· Nexova</span>
              </span>
            </Link>
            <Link
              href="/"
              className="rounded-md px-3 py-1.5 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-900"
            >
              Candidaturas
            </Link>
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}
