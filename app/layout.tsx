import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Lead Scout | SentryPoint",
  description: "Internal lead prioritization workspace for local service businesses.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
