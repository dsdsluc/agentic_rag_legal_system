import type { ReactNode } from "react";
import { getSessionUser } from "@/lib/auth";
import { VanBanLockedScreen } from "@/components/VanBanLockedScreen";

// The top bar itself lives in each page (VanBanTopBar) so it can carry a
// page-specific title/subtitle instead of every route repeating a second,
// separate header underneath a generic one.
export default async function VanBanLayout({ children }: { children: ReactNode }) {
  const user = await getSessionUser();
  return <div className="min-h-full">{user ? children : <VanBanLockedScreen />}</div>;
}
