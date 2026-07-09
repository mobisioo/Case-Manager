import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "سامانه مدیریت پرونده",
  description: "ورود به سامانه مدیریت پرونده‌ها و اسناد"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fa" dir="rtl">
      <body>{children}</body>
    </html>
  );
}
