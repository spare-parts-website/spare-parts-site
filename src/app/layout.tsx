import type { Metadata } from "next";
import { Cairo } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { ThemeProvider } from "@/components/theme-provider";

const cairo = Cairo({
  variable: "--font-cairo",
  subsets: ["arabic", "latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "غيار ماركت | منصة بيع قطع غيار السيارات",
  description: "منصة متكاملة لبيع وشراء قطع غيار السيارات الأصلية من المتاجر المعتمدة",
  keywords: ["غيار ماركت", "قطع غيار", "سيارات", "متاجر", "ميكانيكا"],
  icons: {
    icon: "/ghyar-market-logo.svg",
    apple: "/ghyar-market-logo.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ar" dir="rtl" suppressHydrationWarning>
      <body
        className={`${cairo.variable} font-cairo antialiased bg-background text-foreground`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem
          disableTransitionOnChange
        >
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
