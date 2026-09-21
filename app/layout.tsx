import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Regulatory Forecast Monitor",
  description:
    "Search rulemakings, inspect official evidence, and explore experimental forecasts of regulatory publication events.",
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
