import type { Metadata, Viewport } from "next";
import { Nunito } from "next/font/google";
import { Providers } from "./providers";
import "./globals.css";

const nunito = Nunito({
  variable: "--font-nunito",
  subsets: ["latin"],
  weight: ["600", "700", "800", "900"],
});

export const metadata: Metadata = {
  title: "Parti",
  description: "Sudoku and chess with friends. Race, team up, learn and play.",
  appleWebApp: { capable: true, title: "Parti", statusBarStyle: "default" },
  icons: { icon: "/icon.svg", apple: "/icon.svg" },
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={nunito.variable}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
