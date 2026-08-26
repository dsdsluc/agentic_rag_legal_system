import { loadConversationRows } from "@/lib/adminConversations";
import { ConversationsPageClient } from "@/components/admin/ConversationsPageClient";

export const metadata = { title: "Quản trị · Hội thoại" };

export default async function AdminConversationsPage() {
  const rows = await loadConversationRows();
  return <ConversationsPageClient rows={rows} />;
}
