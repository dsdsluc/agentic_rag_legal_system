import { MOCK_HISTORY } from "@/lib/mockHistory";
import { ConversationView } from "@/components/ConversationView";
import { ChatRoom } from "@/components/ChatRoom";

export default async function ChatPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const mock = MOCK_HISTORY.find((c) => c.id === id);

  if (mock) return <ConversationView conversation={mock} />;
  return <ChatRoom id={id} />;
}
