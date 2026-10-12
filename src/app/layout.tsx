import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "noverse — A little room to think",
  description:
    "A personal notebook for timelines, ideas, and the steps in between.",
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
