import { Mastra } from "@mastra/core";
import { nexoAssist } from "./agents/nexo-assist";

export {
  HANDOFF_TRIGGERS,
  requestContextFor,
  type AgentServices,
  type DraftInput,
  type HandoffInput,
  type HandoffTrigger,
  type NexoContext,
} from "./context";
export { buildDecisionRecord } from "./decision";

export const mastra = new Mastra({
  agents: { nexoAssist },
});
