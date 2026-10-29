import { useLoaderData } from "react-router";
import { Chat } from "../../components/chat/chat";
import { NewConversation } from "../../components/chat/new-conversation";
import { AssistantOnline, TopBar } from "../../components/top-bar";
import { useEmployee } from "../../lib/use-employee";
import type { supportLoader } from "./support-data";

export function SupportPage() {
  const user = useEmployee();
  const { conversation, lastClosed } = useLoaderData<typeof supportLoader>();
  return (
    <>
      <title>Atendimento · Nexo Assist</title>
      <TopBar here="Atendimento">
        {conversation && <NewConversation />}
        <AssistantOnline />
      </TopBar>
      {/* A new conversation gets a fresh chat. */}
      <Chat
        key={conversation?.id ?? "new"}
        firstName={user.firstName}
        conversation={conversation}
        lastClosed={lastClosed}
      />
    </>
  );
}
