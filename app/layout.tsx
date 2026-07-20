import type { ReactNode } from "react";

export const metadata = {
  title: "Stratverse — Build Roadmap",
  description: "Live build roadmap for the Stratverse platform, powered by Linear.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          fontFamily: "Arial, Helvetica, sans-serif",
          background: "#f7f8fa",
          color: "#1f2937",
          WebkitFontSmoothing: "antialiased",
        }}
      >
        {children}
      </body>
    </html>
  );
}
