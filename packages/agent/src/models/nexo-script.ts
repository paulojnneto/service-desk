import type { LanguageModelV4Prompt } from "@ai-sdk/provider";
import { OUT_OF_SCOPE_CHANNELS, TIME_ZONE } from "@nexo/shared";
import type { Script, ScriptStep, ToolCall } from "./scripted-model";

// Script of the simulated mode (stage 6 PRD, S-06.17). It mimics the decisions an LLM would
// make in the prototype's flows, but calls the real tools: drafts, priority, duplicate and
// reopening checks run for real, so the tests exercise the rules in code.
//
// Each turn has phases: the first step calls the lookup tools and registrarDecisao, a second
// step may prepare a draft from what came back, and the last step answers.

type Turn = {
  user: string; // the employee's last message, normalized
  raw: string; // the same message as typed
  earlierUser: string[]; // previous employee messages, normalized, oldest first
  lastAgentText: string; // the agent's last text before this message
  results: Map<string, Record<string, unknown>>; // tool results in this turn
  system: string;
};

export const nexoScript: Script = (prompt) => {
  const turn = readTurn(prompt);
  return pickFlow(turn)(turn);
};

type Flow = (turn: Turn) => ScriptStep;

function pickFlow(turn: Turn): Flow {
  const { user } = turn;
  const number = ticketNumberIn(turn.raw);
  if (
    /ignore (suas|as|todas as) regras|sem (me )?(perguntar|confirmar|confirmacao)|pul(e|ar) a confirmacao/.test(
      user,
    )
  ) {
    return injection;
  }
  if (/^(cancela|cancele|cancelar|desisto|deixa pra la|nao quero mais)/.test(user)) return discard;
  if (/analista|atendente|humano|falar com (uma )?pessoa/.test(user)) return handoff;
  if (outOfScopeArea(user)) return outOfScope;
  if (/reabr/.test(user) && number) return reopen;
  if (/adicion|acrescent|complement/.test(user) && number) return addInformation;
  if (number) return ticketStatus;
  if (/status|meu chamado|meus chamados|andamento/.test(user)) return listTickets;
  if (/horario|plantao|que horas|funciona o service desk/.test(user)) return hours;
  if (/quem esta sendo afetado/.test(normalize(turn.lastAgentText))) return createFromAnswers;
  if (
    /vpn/.test(user) ||
    (/versao do windows/.test(normalize(turn.lastAgentText)) && /windows/.test(user))
  ) {
    return vpn;
  }
  if (/abrir (um )?chamado|nao funciona|parou|lento|travando|nao liga/.test(user))
    return newProblem;
  return unclear;
}

// --- Flows -------------------------------------------------------------------------------

const hours: Flow = (turn) => {
  const result = turn.results.get("consultarHorario");
  if (!result) {
    return tools(
      call("consultarHorario", {}),
      decision("duvida", "alta", "Pergunta sobre o horário de atendimento.", []),
    );
  }
  const { diasUteis, horario, plantao } = result as Record<string, string>;
  return text(`O service desk atende de ${diasUteis}, das ${horario}. ${plantao}`);
};

const listTickets: Flow = (turn) => {
  const result = turn.results.get("listarMeusChamados");
  if (!result) {
    return tools(
      call("listarMeusChamados", { escopo: "abertos" }),
      decision(
        "status_chamado",
        "media",
        "Quer saber de um chamado, mas não disse qual; listei os abertos.",
        ["R7"],
      ),
    );
  }
  if (result.indisponivel) return unavailableText();
  const tickets = (result.chamados ?? []) as TicketSummary[];
  if (tickets.length === 0) return text("Você não tem chamados abertos no momento.");
  if (tickets.length === 1) return text(describeTicket(tickets[0]!));
  const lines = tickets.map((t) => `- ${t.numero} · ${t.titulo} (${STATUS[t.status] ?? t.status})`);
  return text(
    `Você tem ${tickets.length} chamados abertos. Sobre qual deles quer saber?\n${lines.join("\n")}`,
  );
};

const ticketStatus: Flow = (turn) => {
  const number = ticketNumberIn(turn.raw)!;
  const result = turn.results.get("consultarChamado");
  if (!result) {
    return tools(
      call("consultarChamado", { numero: number }),
      decision("status_chamado", "alta", `Pediu o status do ${number}.`, ["R7", "R9"]),
    );
  }
  if (result.indisponivel) return unavailableText();
  if (result.encontrado === false) {
    return text(
      `Não encontrei o ${number} entre os seus chamados. Confira o número ou me diga do que se trata.`,
    );
  }
  return text(describeTicket(result.chamado as TicketSummary, true));
};

const addInformation: Flow = (turn) => {
  const number = ticketNumberIn(turn.raw)!;
  const result = turn.results.get("prepararAtualizacao");
  if (!result) {
    const message = turn.raw.replace(/^.*?(INC|REQ)-\d+\s*[:,.-]?\s*/i, "").trim() || turn.raw;
    return tools(
      call("prepararAtualizacao", { numero: number, mensagem: message }),
      decision("adicionar_informacao", "alta", `Quer acrescentar informação ao ${number}.`, ["R3"]),
    );
  }
  return draftAnswer(result, `Preparei a informação nova para o ${number}.`);
};

const reopen: Flow = (turn) => {
  const number = ticketNumberIn(turn.raw)!;
  const result = turn.results.get("prepararReabertura");
  if (!result) {
    return tools(
      call("prepararReabertura", { numero: number, motivo: turn.raw }),
      decision("reabrir_chamado", "alta", `Quer reabrir o ${number}.`, ["R3", "R5"]),
    );
  }
  if (result.permitido === false) {
    return text(
      `Não consigo reabrir o ${number}: ${String(result.motivo)} Se o problema voltou, posso abrir um chamado novo citando o ${number}.`,
    );
  }
  return draftAnswer(result, `Preparei a reabertura do ${number}.`);
};

// "Meu notebook não conecta na VPN desde ontem. Aparece o erro 809." (prototype, Screen 2)
const vpn: Flow = (turn) => {
  const problem = [...turn.earlierUser, turn.user].join(" ");
  const list = turn.results.get("listarMeusChamados");
  const search = turn.results.get("buscarNaCentral");
  if (!list || !search) {
    return tools(
      call("listarMeusChamados", { escopo: "abertos" }),
      call("buscarNaCentral", { pergunta: "VPN erro 809" }),
      decision(
        "abrir_chamado",
        "alta",
        "VPN com erro 809: conferi chamados abertos e a central antes de abrir.",
        ["R1", "R2", "R4"],
      ),
    );
  }
  if (list.indisponivel || search.indisponivel) return unavailableText();
  const duplicate = ((list.chamados ?? []) as TicketSummary[]).find(
    (t) => t.categoria === "Rede e VPN",
  );
  if (duplicate) {
    return text(
      `Você já tem o ${duplicate.numero} aberto sobre VPN (${duplicate.titulo}). Quer que eu acrescente essa informação nele em vez de abrir outro?`,
    );
  }
  if (/windows 10|win 10/.test(problem)) {
    return text(
      'O artigo "VPN com erro 809" resolve no Windows 10: reinstale o cliente de VPN pelo portal de softwares e reinicie o computador. Se continuar, me avise que eu abro um chamado.',
    );
  }
  if (!/windows 11|win 11/.test(problem)) {
    return text(
      "O artigo do erro 809 depende do sistema. Qual a versão do Windows do seu notebook: 10 ou 11?",
    );
  }
  return text(
    "Não há chamado aberto sobre VPN, e o artigo do erro 809 vale só para Windows 10 — o seu é Windows 11. Vou abrir um chamado.\n\nQuem está sendo afetado? Só eu, minha equipe, toda a empresa ou não sei.",
  );
};

// The answer to "Quem está sendo afetado?" (prototype: "Só eu. Tenho reunião com um cliente às 14h…").
const createFromAnswers: Flow = (turn) => {
  const draft = turn.results.get("prepararChamado");
  if (!draft) {
    const impact = /empresa|todo mundo|todos/.test(turn.user)
      ? "empresa"
      : /equipe|time|setor/.test(turn.user)
        ? "equipe"
        : "so_eu";
    const urgency = /parad|nao consigo trabalhar|nada funciona/.test(turn.user)
      ? "parado"
      : /reuniao|hoje|cliente|prazo|\d{1,2}h/.test(turn.user)
        ? "compromisso_hoje"
        : "contornavel";
    const problem =
      turn.earlierUser.find((t) => /vpn/.test(t)) ?? turn.earlierUser.at(-1) ?? turn.user;
    const windows = /windows 11|win 11/.test([...turn.earlierUser, turn.user].join(" "))
      ? "Windows 11"
      : "Windows";
    const isVpn = /vpn/.test(problem);
    return tools(
      call("prepararChamado", {
        tipo: "INC",
        titulo: isVpn ? "VPN não conecta no notebook — erro 809" : "Problema relatado no chat",
        descricao: isVpn
          ? `O notebook (${windows}) não conecta na VPN e mostra o erro 809. ${turn.raw}`.slice(
              0,
              2000,
            )
          : `${problem}. ${turn.raw}`.slice(0, 2000),
        categoria: isVpn ? "Rede e VPN" : "Outros",
        impacto: impact,
        urgencia: urgency,
      }),
      decision(
        "abrir_chamado",
        "alta",
        "Tenho impacto e urgência; montei o rascunho para confirmação.",
        ["R1", "R2", "R3", "R4", "R9"],
      ),
    );
  }
  if (draft.indisponivel) return unavailableText();
  const fields =
    ((draft.rascunho ?? {}) as { fields?: { priority?: string; dueAt?: string } }).fields ?? {};
  const why =
    fields.priority === "alta" && /reuniao|cliente|hoje|\d{1,2}h/.test(turn.user)
      ? `Coloquei prioridade alta por causa do compromisso — a resposta chega até ${formatTime(fields.dueAt)}.`
      : `Prioridade ${PRIORITY[fields.priority ?? ""] ?? fields.priority}, resposta até ${formatTime(fields.dueAt)}.`;
  return draftAnswer(draft, why);
};

// "Quero abrir um chamado: meu notebook está lento" — checks for an open ticket first (R4).
const newProblem: Flow = (turn) => {
  const list = turn.results.get("listarMeusChamados");
  const update = turn.results.get("prepararAtualizacao");
  if (!list) {
    return tools(
      call("listarMeusChamados", { escopo: "abertos" }),
      decision(
        "abrir_chamado",
        "media",
        "Quer abrir um chamado; conferi os abertos para não duplicar.",
        ["R4"],
      ),
    );
  }
  if (list.indisponivel) return unavailableText();
  const same = ((list.chamados ?? []) as TicketSummary[]).find((t) =>
    sharesKeyword(t.titulo, turn.user),
  );
  if (same && !update) {
    return tools(call("prepararAtualizacao", { numero: same.numero, mensagem: turn.raw }));
  }
  if (same && update) {
    return draftAnswer(
      update,
      `Você já tem o ${same.numero} aberto sobre isso (${same.titulo}). Para não duplicar, preparei essa informação nele.`,
    );
  }
  return text(
    "Me conte o que está acontecendo, desde quando, e quem está sendo afetado: só você, sua equipe ou toda a empresa?",
  );
};

const handoff: Flow = (turn) => {
  const result = turn.results.get("transferirParaAnalista");
  if (!result) {
    const number = lastTicketNumber(turn);
    const overdue = /vencid|prazo/.test(normalize(turn.lastAgentText));
    return tools(
      call("transferirParaAnalista", {
        gatilho: overdue ? "chamado_vencido" : "pedido_do_funcionario",
        resumo:
          `O funcionário pediu um analista. ${number ? `Chamado relacionado: ${number}. ` : ""}Últimas mensagens: ${[...turn.earlierUser.slice(-2), turn.raw].join(" / ")}`.slice(
            0,
            1000,
          ),
        ...(number ? { numero: number } : {}),
      }),
      decision("falar_com_analista", "alta", "O funcionário pediu para falar com um analista.", [
        "R6",
      ]),
    );
  }
  if (result.indisponivel) return unavailableText();
  if (result.encontrado === false)
    return text(
      "Não encontrei esse chamado entre os seus, então não consegui transferir. Pode conferir o número?",
    );
  return text(
    "Pronto, transferi a conversa para a equipe do service desk com um resumo. Um analista vai responder por aqui.",
  );
};

const discard: Flow = (turn) => {
  const result = turn.results.get("descartarRascunho");
  if (!result) {
    return tools(
      call("descartarRascunho", {}),
      decision("outro", "alta", "Desistiu do rascunho.", ["R3"]),
    );
  }
  return text(
    result.descartado
      ? "Tudo bem, descartei o rascunho. Nada foi criado."
      : "Não há rascunho aguardando confirmação.",
  );
};

const outOfScope: Flow = (turn) => {
  if (!turn.results.has("registrarDecisao")) {
    return tools(
      decision("fora_do_escopo", "alta", "Assunto de outra área; redirecionei sem abrir chamado.", [
        "R8",
      ]),
    );
  }
  const channel = OUT_OF_SCOPE_CHANNELS.find((c) => c.area === outOfScopeArea(turn.user));
  return text(
    channel
      ? `Esse assunto é com ${channel.area}, não com a TI. Fale com eles pelo ${channel.channel}.`
      : "Eu só consigo ajudar com assuntos de TI.",
  );
};

const injection: Flow = (turn) => {
  if (!turn.results.has("registrarDecisao")) {
    return tools(
      decision("outro", "alta", "Pedido para pular regras; as regras se mantêm.", ["R3", "R7"]),
    );
  }
  return text(
    "Não posso fazer isso: chamados só são criados, atualizados ou reabertos depois que você confere o rascunho e clica em Confirmar, e só mostro os seus próprios chamados. Como posso ajudar?",
  );
};

const unclear: Flow = (turn) => {
  if (!turn.results.has("registrarDecisao")) {
    return tools(decision("outro", "baixa", "Não entendi o pedido.", []));
  }
  if (/confianca foi baixa/.test(normalize(turn.system))) {
    return text("Ainda não consegui entender. Quer que eu chame um analista para te ajudar?");
  }
  return text(
    "Estou em modo simulado, sem LLM, e não entendi esse pedido. Posso ajudar com o horário do service desk, seus chamados, abrir um chamado ou chamar um analista.",
  );
};

// --- Helpers -----------------------------------------------------------------------------

type TicketSummary = {
  numero: string;
  titulo: string;
  categoria: string;
  prioridade: string;
  status: string;
  prazo: string | null;
  vencido: boolean;
  ultimaAtualizacao: string;
};

const STATUS: Record<string, string> = {
  aguardando_analista: "Aguardando analista",
  em_andamento: "Em andamento",
  aprovado: "Aprovado",
  resolvido: "Resolvido",
  fechado: "Fechado",
};
const PRIORITY: Record<string, string> = {
  critica: "crítica",
  alta: "alta",
  media: "média",
  baixa: "baixa",
};

function describeTicket(t: TicketSummary, offerAnalyst = false): string {
  const base = `${t.numero} · ${t.titulo}: ${STATUS[t.status] ?? t.status}, prioridade ${PRIORITY[t.prioridade] ?? t.prioridade}.`;
  if (t.vencido) {
    const offer = offerAnalyst ? " Quer que eu chame um analista?" : "";
    return `${base} Está sem atualização desde ${formatDate(t.ultimaAtualizacao)} e o prazo venceu em ${formatDate(t.prazo)}.${offer}`;
  }
  return t.prazo ? `${base} A próxima resposta está prevista até ${formatDate(t.prazo)}.` : base;
}

function draftAnswer(result: Record<string, unknown>, lead: string): ScriptStep {
  if (result.indisponivel) return unavailableText();
  if (result.permitido === false) return text(String(result.motivo));
  return text(`${lead} Confira o rascunho e clique em Confirmar para eu registrar.`);
}

function unavailableText(): ScriptStep {
  return text(
    "O sistema de chamados está fora do ar agora. Tente de novo em instantes; se havia um rascunho, ele continua aqui.",
  );
}

function outOfScopeArea(user: string): string | undefined {
  if (/reembols|adiantamento|nota fiscal|cartao corporativo/.test(user)) return "Financeiro";
  if (/ferias|salario|holerite|folha de pagamento|beneficio|ponto eletronico/.test(user))
    return "RH";
  if (/ar[- ]condicionado|limpeza|cracha|estacionamento|cadeira|manutencao predial/.test(user))
    return "Facilities";
  return undefined;
}

const STOP_WORDS = new Set([
  "quero",
  "abrir",
  "chamado",
  "meu",
  "minha",
  "esta",
  "para",
  "com",
  "que",
  "nao",
  "uma",
  "um",
]);

function sharesKeyword(title: string, user: string): boolean {
  const words = (s: string) =>
    normalize(s)
      .split(/\W+/)
      .filter((w) => w.length >= 4 && !STOP_WORDS.has(w));
  const fromUser = new Set(words(user));
  return words(title).some((w) => fromUser.has(w));
}

function ticketNumberIn(text: string): string | undefined {
  return text.match(/\b(INC|REQ)-\d{3,}\b/i)?.[0].toUpperCase();
}

function lastTicketNumber(turn: Turn): string | undefined {
  return (
    ticketNumberIn(turn.raw) ??
    ticketNumberIn(turn.lastAgentText) ??
    [...turn.earlierUser]
      .reverse()
      .map((t) => ticketNumberIn(t))
      .find(Boolean)
  );
}

function call(toolName: string, input: Record<string, unknown>): ToolCall {
  return { toolName, input };
}

function decision(
  intencao: string,
  confianca: string,
  justificativa: string,
  regras: string[],
): ToolCall {
  return call("registrarDecisao", { intencao, confianca, justificativa, regras });
}

function tools(...calls: ToolCall[]): ScriptStep {
  return { kind: "tools", calls };
}

function text(value: string): ScriptStep {
  return { kind: "text", text: value };
}

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", {
    timeZone: TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatTime(iso: string | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", {
    timeZone: TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Reads the prompt: the employee's last message, what came before it, and the results of
// the tools called since then.
function readTurn(prompt: LanguageModelV4Prompt): Turn {
  const lastUser = prompt.findLastIndex((m) => m.role === "user");
  const textOf = (index: number) => {
    const message = prompt[index];
    if (!message || message.role === "system" || message.role === "tool") return "";
    return message.content.map((p) => (p.type === "text" ? p.text : "")).join(" ");
  };
  const raw = textOf(lastUser);
  const earlierUser: string[] = [];
  let lastAgentText = "";
  prompt.forEach((m, i) => {
    if (i >= lastUser) return;
    if (m.role === "user") earlierUser.push(normalize(textOf(i)));
    if (m.role === "assistant" && textOf(i).trim()) lastAgentText = textOf(i);
  });

  const results = new Map<string, Record<string, unknown>>();
  for (const message of prompt.slice(lastUser + 1)) {
    if (message.role !== "tool" && message.role !== "assistant") continue;
    for (const part of message.content) {
      if (part.type !== "tool-result") continue;
      const value = part.output.type === "json" ? part.output.value : {};
      results.set(part.toolName, (value ?? {}) as Record<string, unknown>);
    }
  }
  const system = prompt.find((m) => m.role === "system");
  return {
    user: normalize(raw),
    raw,
    earlierUser,
    lastAgentText,
    results,
    system: system?.role === "system" ? system.content : "",
  };
}
