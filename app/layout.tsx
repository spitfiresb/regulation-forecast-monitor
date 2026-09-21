import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Regulation Z Forecast Monitor",
  description:
    "An evidence-backed view of CFPB’s APOR contingency rulemaking: the expected change, procedural signals, timing, and original government sources.",
  robots: { index: false, follow: false },
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
