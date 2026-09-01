import type { Metadata } from "next";
import { Cairo } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
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
  manifest: '/manifest.webmanifest',
  applicationName: 'غيار ماركت',
  metadataBase: new URL(applicationOrigin()),
  alternates: { canonical: '/' },
  title: {
    default: "غيار ماركت | قطع غيار السيارات من متاجر متخصصة",
    template: "%s | غيار ماركت",
  },
  description: "ابحث وقارن واطلب قطع غيار السيارات من متاجر متخصصة في مصر، مع تقييمات حقيقية وعلامة واضحة للمتاجر الموثقة والدفع عند الاستلام.",
  keywords: ["غيار ماركت", "قطع غيار", "سيارات", "متاجر", "ميكانيكا"],
  icons: {
    icon: "/ghyar-market-logo.png",
    apple: "/ghyar-market-icon.png",
  },
  openGraph: {
    type: "website",
    locale: "ar_EG",
    siteName: "غيار ماركت",
    title: "غيار ماركت | قطع غيار السيارات من متاجر متخصصة",
    description: "القطعة الصح لسيارتك من متجر تعرف تفاصيله وتقييماته.",
    images: [{ url: "/ghyar-market-hero.webp", width: 1672, height: 941, alt: "غيار ماركت" }],
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
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
