import type { ReactNode } from "react";
import { AppChrome } from "@/components/AppChrome";

export default function ChatLayout({ children }: { children: ReactNode }) {
  return <AppChrome>{children}</AppChrome>;
}
