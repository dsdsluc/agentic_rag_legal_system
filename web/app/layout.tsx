import type { Metadata } from "next";
import { Be_Vietnam_Pro, EB_Garamond, IBM_Plex_Mono } from "next/font/google";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ChatStoreProvider } from "@/lib/chat-store";
import { AuthProvider } from "@/lib/auth-client";
import { AuthDialog } from "@/components/AuthDialog";
import { NotificationZone } from "@/components/NotificationZone";
import "./globals.css";

const beVietnamPro = Be_Vietnam_Pro({
  variable: "--font-be-vietnam",
  subsets: ["latin", "vietnamese"],
  weight: ["400", "500", "600", "700"],
});

const ibmPlexMono = IBM_Plex_Mono({
  variable: "--font-ibm-plex-mono",
  subsets: ["latin", "vietnamese"],
  weight: ["400", "500"],
});

// The book/archive display face (originally /van-ban only), now the app's
// one shared heading typeface — see --font-heading in globals.css.
const ebGaramond = EB_Garamond({
  variable: "--font-archive-serif",
  subsets: ["latin", "vietnamese"],
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  title: "Trợ lý Pháp luật Giao thông",
  description:
    "Trợ lý hỏi đáp pháp luật giao thông đường bộ Việt Nam — chế độ Người dân và Chuyên gia.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="vi"
      className={`${beVietnamPro.variable} ${ibmPlexMono.variable} ${ebGaramond.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground font-sans">
        <TooltipProvider delay={200}>
          <AuthProvider>
            <ChatStoreProvider>{children}</ChatStoreProvider>
            <AuthDialog />
            <NotificationZone />
          </AuthProvider>
        </TooltipProvider>
      </body>
    </html>
  );
}
