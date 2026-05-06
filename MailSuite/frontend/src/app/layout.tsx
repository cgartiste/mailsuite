import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/contexts/AuthContext";
import { ToastProvider } from "@/contexts/ToastContext";
import { ActiveGWProvider } from "@/contexts/ActiveGWContext";

export const metadata: Metadata = {
  title: "MailSuite — Deliverability Platform",
  description: "Infrastructure email management: Google Workspace, Microsoft 365, Cloudflare DNS",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=Fira+Code:wght@400;500&display=swap" rel="stylesheet" />
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.css" />
      </head>
      <body>
        <AuthProvider>
          <ToastProvider>
            <ActiveGWProvider>
              {children}
            </ActiveGWProvider>
          </ToastProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
