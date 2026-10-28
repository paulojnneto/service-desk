import { getToolName, isToolUIPart, type UIMessage } from "ai";
import { Check, LoaderCircle } from "lucide-react";

// Label of each tool in the action line above the agent's reply.
const ACTION_LABELS: Record<string, string> = {
  consultarHorario: "consultou o horário do service desk",
};

function messageText(message: UIMessage): string {
  return message.parts.map((part) => (part.type === "text" ? part.text : "")).join("");
}

export function UserMessage({ message }: { message: UIMessage }) {
  return (
    <div className="flex justify-end">
      <p className="max-w-[520px] rounded-xl rounded-br-sm bg-ink px-4 py-[11px] text-[14.5px] leading-[1.45] whitespace-pre-wrap text-white">
        {messageText(message)}
      </p>
    </div>
  );
}

export function AgentMessage({ message }: { message: UIMessage }) {
  const tools = message.parts.filter(isToolUIPart);
  const text = messageText(message);
  if (!text && tools.length === 0) return null;

  return (
    <div className="flex flex-col gap-1.5">
      <StatusLine>
        {tools.map((part) => (
          <span key={part.toolCallId} className="flex items-center gap-[5px] text-ink-3">
            {part.state === "output-available" ? (
              <Check className="size-3" aria-hidden="true" />
            ) : (
              <LoaderCircle className="size-3 animate-spin" aria-hidden="true" />
            )}
            {ACTION_LABELS[getToolName(part)] ?? getToolName(part)}
          </span>
        ))}
      </StatusLine>
      {text && <AgentBubble>{text}</AgentBubble>}
    </div>
  );
}

// "Nexo Assist" followed by the actions the agent took for this reply.
export function StatusLine({ children }: { children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px]">
      <span className="font-semibold text-ink">Nexo Assist</span>
      {children}
    </div>
  );
}

export function AgentBubble({ children }: { children: React.ReactNode }) {
  return (
    <div className="max-w-[600px] rounded-xl rounded-tl-sm border border-rule bg-paper px-4 py-3 text-[14.5px] leading-[1.5] whitespace-pre-wrap text-ink shadow-[0_1px_2px_#1B24310A]">
      {children}
    </div>
  );
}

export function QuickOption({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded-lg border border-rule bg-paper px-3 py-[7px] text-[13.5px] font-medium text-ink hover:border-primary hover:bg-primary-soft hover:text-primary-text disabled:pointer-events-none disabled:opacity-60"
    >
      {children}
    </button>
  );
}
