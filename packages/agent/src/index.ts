import { Mastra } from "@mastra/core";
import { nexoAssist } from "./agents/nexo-assist";

export { requestContextFor, type NexoContext } from "./context";

export const mastra = new Mastra({
  agents: { nexoAssist },
});
