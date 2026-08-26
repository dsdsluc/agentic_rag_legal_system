import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AccountForm } from "@/components/AccountForm";

export const metadata = { title: "Tài khoản của tôi" };

export default async function AccountPage() {
  const sessionUser = await getSessionUser();
  if (!sessionUser) redirect("/");

  const user = await prisma.user.findUnique({ where: { id: sessionUser.id } });
  if (!user) redirect("/");

  return (
    // AppChrome's <main> never sets its own overflow, so a page taller than
    // the viewport needs its own scroll region — h-full resolves against
    // main's flex-stretched height (same reason chat routes scroll their
    // own inner div instead of relying on the page).
    <div className="h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-6xl px-4 py-8 md:px-8 md:py-10">
        <AccountForm
          initial={{
            name: user.name,
            email: user.email,
            phone: user.phone ?? "",
            occupation: user.occupation ?? "",
          }}
        />
      </div>
    </div>
  );
}
