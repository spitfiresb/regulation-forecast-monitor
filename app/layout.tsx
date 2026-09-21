import type { Metadata } from "next";
import "./globals.css";
import "./interface.css";
import { AppNavigation } from "@/components/app-navigation";

export const metadata: Metadata = {
  title: "Regulatory Forecast Monitor",
  description:
    "Browse regulatory changes, inspect official evidence, and explore experimental forecasts of regulatory publication events.",
  robots: { index: false, follow: false },
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <AppNavigation />
        <div className="app-content">{children}</div>
      </body>
    </html>
  );
}
