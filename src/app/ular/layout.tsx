import localFont from "next/font/local";
import { Grenze_Gotisch } from "next/font/google";

// Ular Tangga Nusantara wears Orbwick's look: Allo (SIL Open Font License, see ../orb/fonts/Allo-OFL.txt) and Grenze Gotisch (SIL OFL, Google Fonts).
const allo = localFont({ src: "../orb/fonts/AlloVariable.woff2", variable: "--font-allo", weight: "100 900", display: "swap" });
const gothic = Grenze_Gotisch({ variable: "--font-gothic", subsets: ["latin"], weight: ["700"], display: "swap" });

export default function UlarLayout({ children }: { children: React.ReactNode }) {
  return <div className={`${allo.variable} ${gothic.variable} ow-root`}>{children}</div>;
}
