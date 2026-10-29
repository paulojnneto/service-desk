import type { LanguageModelV4Prompt } from "@ai-sdk/provider";
import { OUT_OF_SCOPE_CHANNELS, TIME_ZONE } from "@nexo/shared";
import type { Script, ScriptStep, ToolCall } from "./scripted-model";

// Script of the simulated mode (stage 6 PRD, S-06.17). It mimics the decisions an LLM would
// make in the prototype's flows, but calls the real tools: drafts, priority, duplicate and
// reopening checks run for real, so the tests exercise the rules in code.
//
// Each turn has phases: the first step calls the lookup tools and registrarDecisao, a second
// step may prepare a draft or ask with perguntar from what came back, and the last step
// answers. Questions with known answers use perguntar, as in Screens 2 and 3 (stage 7).

type Turn = {
  user: string; // the employee's last message, normalized
  raw: string; // the same message as typed
  earlierUser: string[]; // previous employee messages, normalized, oldest first
  lastAgentText: string; // the agent's last text before this message
  lastQuestion: string; // what the agent asked with perguntar in its last reply, normalized
  // The last analyst's message ("[Analista Rafael Lima] …"), and whether the conversation was
  // handed back to the agent since its last reply (stage 9).
  lastAnalyst: { name: string; text: string } | null;
  handedBack: boolean;
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
  // The options offered after an overdue ticket (Screen 3).
  if (/analista/.test(turn.lastQuestion) && /adicionar informacao/.test(user)) return askWhatToAdd;
  if (/analista/.test(turn.lastQuestion) && /^nao/.test(user)) return declined;
  if (/analista/.test(turn.lastQuestion) && /explicar/.test(user)) return explainAgain;
  if (/analista|atendente|humano|falar com (uma )?pessoa/.test(user)) return handoff;
  // Something down for a team or the whole company (R6): a person, at once (stage 9, S-09.2).
  if (
    /tod[oa] (o time|a equipe|a empresa|o setor|o departamento)|ninguem (aqui )?consegue/.test(user)
  ) {
    return critical;
  }
  if (outOfScopeArea(user)) return outOfScope;
  if (/reabr/.test(user) && number) return reopen;
  if (/adicion|acrescent|complement/.test(user) && number) return addInformation;
  if (/quer acrescentar ao (inc|req)-\d+/.test(normalize(turn.lastAgentText)))
    return addInformation;
  if (number) return ticketStatus;
  if (/status|meu chamado|meus chamados|andamento/.test(user)) return listTickets;
  if (/horario|plantao|que horas|funciona o service desk/.test(user)) return hours;
  if (/quem esta sendo afetado|consegue trabalhar/.test(turn.lastQuestion))
    return createFromAnswers;
  if (/vpn/.test(user) || (/versao do windows/.test(turn.lastQuestion) && /windows/.test(user))) {
    return vpn;
  }
  if (/abrir (um )?chamado|nao funciona|parou|lento|travando|nao liga/.test(user))
    return newProblem;
  // A "how do I" question: the help center first (S-06.2).
  if (/^como (faco|posso|configuro|redefino|troco|altero)|^como (eu )?(faco|consigo)/.test(user))
    return helpCenter;
  if (turn.handedBack && turn.lastAnalyst) return resumeAfterAnalyst;
  return unclear;
}

// --- Flows -------------------------------------------------------------------------------

const hours: Flow = (turn) => {
  const result = turn.results.get("consultarHorario");
  if (!result) {
    return tools(
      call("consultarHorario", {}),
      decision(
        "duvida",
        "alta",
        "A pessoa perguntou o horário de atendimento do service desk.",
        [],
      ),
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
        "A pessoa quer saber de um chamado sem dizer qual; listei os abertos para ela escolher.",
        ["R7"],
      ),
    );
  }
  if (result.indisponivel) return unavailableText();
  const tickets = (result.chamados ?? []) as TicketSummary[];
  if (tickets.length === 0) return text("Você não tem chamados abertos no momento.");
  if (tickets.length === 1) return text(describeTicket(tickets[0]!));
  const picker = turn.results.get("perguntar");
  if (!picker) {
    return tools(
      call("perguntar", {
        pergunta: "Sobre qual deles quer saber?",
        chamados: tickets.map((t) => t.numero),
      }),
    );
  }
  if (picker.indisponivel) return unavailableText();
  return text(`Você tem ${tickets.length} chamados abertos.`);
};

const ticketStatus: Flow = (turn) => {
  const number = ticketNumberIn(turn.raw)!;
  const result = turn.results.get("consultarChamado");
  if (!result) {
    return tools(
      call("consultarChamado", { numero: number }),
      decision(
        "status_chamado",
        "alta",
        `A pessoa pediu o status do ${number}; consultei o chamado.`,
        ["R7", "R9"],
      ),
    );
  }
  if (result.indisponivel) return unavailableText();
  if (result.encontrado === false) {
    return text(
      `Não encontrei o ${number} entre os seus chamados. Confira o número ou me diga do que se trata.`,
    );
  }
  const ticket = result.chamado as TicketSummary;
  if (!ticket.vencido) return text(describeTicket(ticket));
  // Overdue: the card shows the ticket, and the employee picks what to do (Screen 3).
  if (!turn.results.has("perguntar")) {
    return tools(
      call("perguntar", {
        pergunta: "Quer que eu chame um analista?",
        opcoes: ["Falar com um analista", "Adicionar informação", "Não, obrigado"],
      }),
    );
  }
  return text(describeTicket(ticket));
};

const askWhatToAdd: Flow = (turn) => {
  const number = lastTicketNumber(turn);
  if (!turn.results.has("registrarDecisao")) {
    return tools(
      decision(
        "adicionar_informacao",
        "alta",
        "A pessoa escolheu acrescentar informação ao chamado.",
        ["R3"],
      ),
    );
  }
  return text(
    number
      ? `Certo. O que você quer acrescentar ao ${number}?`
      : "Certo. Qual chamado e o que você quer acrescentar?",
  );
};

const declined: Flow = (turn) => {
  if (!turn.results.has("registrarDecisao")) {
    return tools(
      decision("status_chamado", "alta", "A pessoa não quis chamar um analista agora.", []),
    );
  }
  return text("Tudo bem. Se precisar, é só me chamar por aqui.");
};

const addInformation: Flow = (turn) => {
  const number = (ticketNumberIn(turn.raw) ?? ticketNumberIn(turn.lastAgentText))!;
  const result = turn.results.get("prepararAtualizacao");
  if (!result) {
    const message = turn.raw.replace(/^.*?(INC|REQ)-\d+\s*[:,.-]?\s*/i, "").trim() || turn.raw;
    return tools(
      call("prepararAtualizacao", { numero: number, mensagem: message }),
      decision(
        "adicionar_informacao",
        "alta",
        `A pessoa quer acrescentar informação ao ${number}; preparei o rascunho para ela conferir.`,
        ["R3"],
      ),
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
      decision(
        "reabrir_chamado",
        "alta",
        `A pessoa quer reabrir o ${number}; o sistema confere se ainda está no prazo.`,
        ["R3", "R5"],
      ),
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
        "A VPN mostra o erro 809; antes de abrir um chamado, conferi se já havia um aberto e se a central de ajuda resolvia.",
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
    if (!turn.results.has("perguntar")) {
      return tools(
        call("perguntar", {
          pergunta: "Qual a versão do Windows do seu notebook?",
          opcoes: ["Windows 10", "Windows 11"],
        }),
      );
    }
    return text("O artigo do erro 809 depende do sistema.");
  }
  if (!turn.results.has("perguntar")) {
    return tools(
      call("perguntar", {
        pergunta: "Quem está sendo afetado?",
        opcoes: ["Só eu", "Minha equipe", "Toda a empresa", "Não sei"],
      }),
    );
  }
  return text(
    "Não há chamado aberto sobre VPN, e o artigo do erro 809 vale só para Windows 10 — o seu é Windows 11. Vou abrir um chamado.",
  );
};

// The answer to "Quem está sendo afetado?" (prototype: "Só eu. Tenho reunião com um cliente às 14h…").
// When the answer has no urgency ("Só eu"), the urgency is asked with options first.
const createFromAnswers: Flow = (turn) => {
  const draft = turn.results.get("prepararChamado");
  const answeringUrgency = /consegue trabalhar/.test(turn.lastQuestion);
  if (!answeringUrgency && !URGENCY_HINT.test(turn.user)) {
    if (!turn.results.has("perguntar")) {
      return tools(
        call("perguntar", {
          pergunta: "Você consegue trabalhar enquanto isso não se resolve?",
          opcoes: ["Estou parado", "Tenho compromisso hoje", "Consigo contornar", "Sem urgência"],
        }),
        decision(
          "abrir_chamado",
          "alta",
          "Já sei quem é afetado; falta a urgência para calcular a prioridade.",
          ["R9"],
        ),
      );
    }
    return text("Entendi. Só mais uma coisa para calcular a prioridade:");
  }
  if (!draft) {
    // The impact was answered in this message or, after the urgency question, in the one before.
    const impactAnswer = answeringUrgency ? (turn.earlierUser.at(-1) ?? "") : turn.user;
    const impact = /empresa|todo mundo|todos/.test(impactAnswer)
      ? "empresa"
      : /equipe|time|setor/.test(impactAnswer)
        ? "equipe"
        : "so_eu";
    const urgency = /sem urgencia/.test(turn.user)
      ? "sem_urgencia"
      : /parad|nao consigo trabalhar|nada funciona/.test(turn.user)
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
        "Com quem é afetado e a urgência, o sistema calcula a prioridade; montei o rascunho para a pessoa conferir.",
        ["R1", "R2", "R3", "R4", "R9"],
      ),
    );
  }
  if (draft.indisponivel) return unavailableText();
  const fields =
    ((draft.rascunho ?? {}) as { fields?: { priority?: string; dueAt?: string } }).fields ?? {};
  const why =
    fields.priority === "alta" && /reuniao|cliente|hoje|\d{1,2}h/.test(turn.user)
      ? `Coloquei prioridade alta por causa do compromisso — a resposta chega até ${formatDue(fields.dueAt)}.`
      : `Prioridade ${PRIORITY[fields.priority ?? ""] ?? fields.priority}, resposta até ${formatDue(fields.dueAt)}.`;
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
        "A pessoa quer abrir um chamado; conferi os abertos para não duplicar.",
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
    // Picking "Falar com um analista" answers an offer: after an overdue ticket, or after
    // not understanding twice (stage 9, S-09.2). Otherwise the employee asked in words.
    const offered = /analista/.test(turn.lastQuestion);
    const overdue = /vencid|prazo/.test(normalize(turn.lastAgentText));
    const gatilho = !offered
      ? "pedido_do_funcionario"
      : overdue
        ? "chamado_vencido"
        : "baixa_confianca";
    return tools(
      call("transferirParaAnalista", {
        gatilho,
        resumo:
          `O funcionário pediu um analista. ${number ? `Chamado relacionado: ${number}. ` : ""}Últimas mensagens: ${[...turn.earlierUser.slice(-2), turn.raw].join(" / ")}`.slice(
            0,
            1000,
          ),
        ...(number ? { numero: number } : {}),
      }),
      decision("falar_com_analista", "alta", "A pessoa pediu para falar com um analista.", ["R6"]),
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

const critical: Flow = (turn) => {
  const result = turn.results.get("transferirParaAnalista");
  if (!result) {
    return tools(
      call("transferirParaAnalista", {
        gatilho: "caso_critico",
        resumo: `Caso crítico relatado pela pessoa: ${turn.raw}`.slice(0, 1000),
      }),
      decision(
        "falar_com_analista",
        "alta",
        "Algo parou para uma equipe inteira; num caso crítico a conversa vai direto para uma pessoa.",
        ["R6", "R9"],
      ),
    );
  }
  if (result.indisponivel) return unavailableText();
  return text(
    "Isso é um caso crítico, então já chamei a equipe do service desk com um resumo. Um analista vai responder por aqui em seguida.",
  );
};

const helpCenter: Flow = (turn) => {
  const result = turn.results.get("buscarNaCentral");
  if (!result) {
    return tools(
      call("buscarNaCentral", { pergunta: turn.raw }),
      decision(
        "duvida",
        "alta",
        "A pessoa fez uma pergunta que a central de ajuda pode responder.",
        [],
      ),
    );
  }
  if (result.indisponivel) return unavailableText();
  const [article] = (result.artigos ?? []) as { titulo: string; texto: string }[];
  if (!article) {
    return text(
      "Não encontrei um artigo da central de ajuda sobre isso. Se quiser, me conte o que está acontecendo e eu abro um chamado.",
    );
  }
  return text(`Segundo o artigo "${article.titulo}" da central de ajuda: ${article.texto}`);
};

const discard: Flow = (turn) => {
  const result = turn.results.get("descartarRascunho");
  if (!result) {
    return tools(
      call("descartarRascunho", {}),
      decision("outro", "alta", "A pessoa desistiu do rascunho.", ["R3"]),
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
      decision(
        "fora_do_escopo",
        "alta",
        "O pedido é de outra área; indiquei o canal certo sem abrir chamado.",
        ["R8"],
      ),
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
      decision("outro", "alta", "A pessoa pediu para pular as regras; elas continuam valendo.", [
        "R3",
        "R7",
      ]),
    );
  }
  return text(
    "Não posso fazer isso: chamados só são criados, atualizados ou reabertos depois que você confere o rascunho e clica em Confirmar, e só mostro os seus próprios chamados. Como posso ajudar?",
  );
};

const unclear: Flow = (turn) => {
  const again = /confianca foi baixa/.test(normalize(turn.system));
  if (!turn.results.has("registrarDecisao")) {
    const decided = decision("outro", "baixa", "Não ficou claro o que a pessoa precisa.", []);
    // Still unclear: offer an analyst, and hand off only if it is picked (stage 9, S-09.2).
    if (!again) return tools(decided);
    return tools(
      call("perguntar", {
        pergunta: "Quer que eu chame um analista?",
        opcoes: ["Falar com um analista", "Vou explicar de novo"],
      }),
      decided,
    );
  }
  if (again) return text("Ainda não consegui entender.");
  return text(
    "Estou em modo simulado, sem LLM, e não entendi esse pedido. Posso ajudar com o horário do service desk, seus chamados, abrir um chamado ou chamar um analista.",
  );
};

const explainAgain: Flow = (turn) => {
  if (!turn.results.has("registrarDecisao")) {
    return tools(decision("outro", "media", "A pessoa preferiu explicar de novo.", []));
  }
  return text("Claro. Me conte com outras palavras o que está acontecendo.");
};

// Back from the analyst (stage 9, S-09.11): the agent picks up from what the person said.
const resumeAfterAnalyst: Flow = (turn) => {
  if (!turn.results.has("registrarDecisao")) {
    return tools(
      decision(
        "outro",
        "alta",
        "A conversa voltou do analista; retomei a partir do que ele disse.",
        [],
      ),
    );
  }
  const { name, text: said } = turn.lastAnalyst!;
  return text(
    `Estou de volta. Vi que ${name} falou com você por aqui: "${said}". Posso ajudar com mais alguma coisa?`,
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

const URGENCY_HINT =
  /parad|nao consigo trabalhar|nada funciona|reuniao|hoje|cliente|prazo|\d{1,2}h|contorn|alternativa|sem urgencia/;

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

function describeTicket(t: TicketSummary): string {
  const base = `${t.numero} · ${t.titulo}: ${STATUS[t.status] ?? t.status}, prioridade ${PRIORITY[t.prioridade] ?? t.prioridade}.`;
  if (t.vencido) {
    return `O ${t.numero} está sem atualização desde ${formatDate(t.ultimaAtualizacao)} e o prazo de resposta venceu em ${formatDate(t.prazo)}.`;
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

// Only the time when the deadline is today; the day too when it is not.
function formatDue(iso: string | undefined): string {
  if (!iso) return "—";
  const day = (d: Date) => d.toLocaleDateString("pt-BR", { timeZone: TIME_ZONE });
  if (day(new Date(iso)) !== day(new Date())) return formatDate(iso);
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
  let lastQuestion = "";
  let lastAnalyst: Turn["lastAnalyst"] = null;
  let handedBack = false;
  prompt.forEach((m, i) => {
    if (i >= lastUser) return;
    if (m.role === "user") {
      earlierUser.push(normalize(textOf(i)));
      lastQuestion = "";
    }
    if (m.role !== "assistant") return;
    // Consecutive assistant messages reach the model as one, so each text part is read on its
    // own: an analyst's message or a system note, as the API writes them, or the agent's text.
    const agentText: string[] = [];
    for (const part of m.content) {
      if (part.type === "text") {
        const value = part.text.trim();
        const analyst = /^\[Analista ([^\]]+)\]\s*([\s\S]*)$/.exec(value);
        if (analyst) {
          lastAnalyst = { name: analyst[1]!, text: analyst[2]!.trim() };
        } else if (value.startsWith("[Nota do sistema]")) {
          if (/devolvida/.test(normalize(value))) handedBack = true;
        } else if (value) {
          agentText.push(part.text);
          handedBack = false;
        }
      }
      if (part.type === "tool-call" && part.toolName === "perguntar") {
        lastQuestion = normalize(String(inputOf(part.input).pergunta ?? ""));
      }
    }
    if (agentText.length > 0) lastAgentText = agentText.join(" ");
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
    lastQuestion,
    lastAnalyst,
    handedBack,
    results,
    system: system?.role === "system" ? system.content : "",
  };
}

function inputOf(input: unknown): Record<string, unknown> {
  if (typeof input === "string") {
    try {
      return JSON.parse(input) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  return (input ?? {}) as Record<string, unknown>;
}
