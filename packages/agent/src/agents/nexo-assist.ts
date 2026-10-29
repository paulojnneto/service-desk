import { Agent } from "@mastra/core/agent";
import type { NexoContext } from "../context";
import { resolveModel } from "../models";
import { consultarHorario } from "../tools/consultar-horario";
import { registrarDecisao } from "../tools/decision";
import {
  descartarRascunho,
  prepararAtualizacao,
  prepararChamado,
  prepararReabertura,
} from "../tools/drafts";
import { transferirParaAnalista } from "../tools/handoff";
import { perguntar } from "../tools/question";
import { buscarNaCentral, consultarChamado, listarMeusChamados } from "../tools/read";
import { reportUsage, usageOf } from "../usage";
import { instructionsFor } from "./instructions";

// The tool keys are the names the model sees and the UI labels (stage 6 tech spec).
export const nexoTools = {
  consultarHorario,
  buscarNaCentral,
  listarMeusChamados,
  consultarChamado,
  prepararChamado,
  prepararAtualizacao,
  prepararReabertura,
  descartarRascunho,
  transferirParaAnalista,
  perguntar,
  registrarDecisao,
};

export const nexoAssist = new Agent<"nexo-assist", typeof nexoTools, undefined, NexoContext>({
  id: "nexo-assist",
  name: "Nexo Assist",
  instructions: ({ requestContext }) => instructionsFor(requestContext),
  model: resolveModel(),
  tools: nexoTools,
  // Per request, so the usage reaches the request that spent it (stage 11 tech spec).
  defaultOptions: ({ requestContext }) => ({
    // The longest flow fits; a loop cannot run up cost (N10).
    maxSteps: 6,
    // Tokens and model calls of the turn: stored with the reply, and reported to the evals.
    onFinish: ({ totalUsage, steps }) => {
      const usage = usageOf(totalUsage, steps.length);
      requestContext.get("recordUsage")?.(usage);
      reportUsage(usage);
    },
  }),
});
