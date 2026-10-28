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
import { buscarNaCentral, consultarChamado, listarMeusChamados } from "../tools/read";
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
  registrarDecisao,
};

export const nexoAssist = new Agent<"nexo-assist", typeof nexoTools, undefined, NexoContext>({
  id: "nexo-assist",
  name: "Nexo Assist",
  instructions: ({ requestContext }) => instructionsFor(requestContext),
  model: resolveModel(),
  tools: nexoTools,
  // The longest flow fits; a loop cannot run up cost (N10).
  defaultOptions: { maxSteps: 6 },
});
