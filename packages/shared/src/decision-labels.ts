import type {
  Confidence,
  DecisionAction,
  Intent,
  RuleId,
  ToolName,
  ToolOutcome,
} from "./decisions";

// The decision record in plain Portuguese (stage 8 PRD, S-08.2 and decision 4). Written for
// both readers, the employee in the chat and the analyst in the console, so the person is
// never "você". Each map covers its enum, so a new value fails the typecheck until it has a
// label.

export const INTENT_LABELS: Record<Intent, string> = {
  duvida: "Quer tirar uma dúvida",
  status_chamado: "Quer saber o status de um chamado",
  adicionar_informacao: "Quer acrescentar informação a um chamado",
  abrir_chamado: "Quer abrir um chamado",
  reabrir_chamado: "Quer reabrir um chamado",
  falar_com_analista: "Quer falar com um analista",
  fora_do_escopo: "Pediu algo fora de TI",
  outro: "Outro pedido",
};

export const ACTION_LABELS: Record<DecisionAction, string> = {
  transferiu: "Transferiu a conversa para um analista",
  preparou_rascunho: "Montou um rascunho para confirmação",
  descartou_rascunho: "Descartou o rascunho",
  recusou_reabertura: "Explicou por que o chamado não pode ser reaberto",
  consultou_chamados: "Consultou os chamados",
  respondeu_central: "Respondeu com a central de ajuda",
  redirecionou: "Indicou o canal certo, fora de TI",
  pediu_esclarecimento: "Pediu um esclarecimento",
  perguntou: "Fez uma pergunta com opções",
  respondeu: "Respondeu",
  criou_chamado: "Criou o chamado",
  atualizou_chamado: "Acrescentou a informação ao chamado",
  reabriu_chamado: "Reabriu o chamado",
  cancelou_rascunho: "Descartou o rascunho",
};

// Three levels, each with a fixed meaning (stage 6 PRD, decision 4; stage 8 PRD, decision 3).
export const CONFIDENCE_LABELS: Record<Confidence, { word: string; meaning: string }> = {
  alta: { word: "alta", meaning: "Entendeu o pedido e tinha o que precisava." },
  media: { word: "média", meaning: "Entendeu o pedido, mas precisou supor algo." },
  baixa: { word: "baixa", meaning: "Não tem certeza do que a pessoa precisa." },
};

export const OUTCOME_LABELS: Record<ToolOutcome, string> = {
  ok: "ok",
  nao_encontrado: "não encontrado",
  indisponivel: "sistema de chamados fora do ar",
  recusado: "recusado",
  erro: "erro",
};

const ticket = (subject?: string) => subject ?? "chamado";

export const TOOL_LABELS: Record<ToolName, (subject?: string) => string> = {
  consultarHorario: () => "Consultou o horário do service desk",
  buscarNaCentral: (s) => (s ? `Buscou "${s}" na central de ajuda` : "Buscou na central de ajuda"),
  listarMeusChamados: (s) =>
    s === "todos" ? "Listou todos os chamados da pessoa" : "Listou os chamados abertos da pessoa",
  consultarChamado: (s) => `Consultou o ${ticket(s)}`,
  prepararChamado: () => "Montou o rascunho de um chamado novo",
  prepararAtualizacao: (s) => `Montou o rascunho de informação nova para o ${ticket(s)}`,
  prepararReabertura: (s) => `Conferiu se o ${ticket(s)} pode ser reaberto`,
  descartarRascunho: () => "Descartou o rascunho",
  transferirParaAnalista: () => "Transferiu para um analista",
  perguntar: (s) =>
    s === "chamados" ? "Mostrou os chamados abertos para escolher" : "Fez uma pergunta com opções",
  criarChamado: (s) => (s ? `Criou o ${s}` : "Criou o chamado"),
  atualizarChamado: (s) => `Acrescentou a informação ao ${ticket(s)}`,
  reabrirChamado: (s) => `Reabriu o ${ticket(s)}`,
  cancelarRascunho: (s) => (s ? `Descartou o rascunho ${s}` : "Descartou o rascunho"),
};

// A tool the catalog does not know (old data) keeps its raw name.
export function toolLabel(name: string, subject?: string): string {
  return name in TOOL_LABELS ? TOOL_LABELS[name as ToolName](subject) : name;
}

export const RULE_LABELS: Record<RuleId, string> = {
  R1: "Tipo: incidente ou requisição",
  R2: "Categoria",
  R3: "Rascunho e confirmação",
  R4: "Sem chamados duplicados",
  R5: "Reabertura em até 7 dias",
  R6: "Transferência para analista",
  R7: "Privacidade",
  R8: "Só assuntos de TI",
  R9: "Prioridade e prazos",
};

// What the detail says when the record is not a model's judgment, or is missing (S-08.7,
// S-08.8).
export const SERVER_DECISION_NOTE =
  "Decidido pelo sistema, sem o modelo, a partir do botão que a pessoa usou.";
export const UNREGISTERED_DECISION = "O agente não registrou a decisão.";
export const NO_DECISION = "Sem registro de decisão para esta resposta.";
