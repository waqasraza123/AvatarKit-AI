import type { Metadata } from "next"
import "./globals.css"

export const metadata: Metadata = {
  title: "AvatarKit AI",
  description: "Business talking avatar infrastructure foundation."
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
