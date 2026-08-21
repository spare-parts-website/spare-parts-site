import type { Metadata } from "next";
import { Cairo } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { ThemeProvider } from "@/components/theme-provider";
import { applicationOrigin } from "@/lib/application-url";

const cairo = Cairo({
  variable: "--font-cairo",
  subsets: ["arabic", "latin"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(applicationOrigin()),
  title: {
    default: "غيار ماركت | قطع غيار السيارات من متاجر موثوقة",
    template: "%s | غيار ماركت",
  },
  description: "ابحث وقارن واطلب قطع غيار السيارات من متاجر متخصصة وموثوقة في مصر، مع الدفع عند الاستلام.",
  keywords: ["غيار ماركت", "قطع غيار", "سيارات", "متاجر", "ميكانيكا"],
  icons: {
    icon: "/ghyar-market-logo.png",
    apple: "/ghyar-market-logo.png",
  },
  openGraph: {
    type: "website",
    locale: "ar_EG",
    siteName: "غيار ماركت",
    title: "غيار ماركت | قطع غيار السيارات من متاجر موثوقة",
    description: "القطعة الصح لسيارتك من متجر تثق فيه.",
    images: [{ url: "/ghyar-market-hero.png", width: 1680, height: 941, alt: "غيار ماركت" }],
  },
  twitter: { card: "summary_large_image" },
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
