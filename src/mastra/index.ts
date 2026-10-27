import { Mastra } from "@mastra/core";
import { nexoAssist } from "./agents/nexo-assist";

export const mastra = new Mastra({
  agents: { nexoAssist },
});
