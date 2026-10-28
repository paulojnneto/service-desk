import { Chat } from "../../components/chat/chat";
import { AssistantOnline, TopBar } from "../../components/top-bar";
import { useEmployee } from "../../lib/use-employee";

export function SupportPage() {
  const user = useEmployee();
  return (
    <>
      <title>Atendimento · Nexo Assist</title>
      <TopBar here="Atendimento">
        <AssistantOnline />
      </TopBar>
      <Chat firstName={user.firstName} />
    </>
  );
}
