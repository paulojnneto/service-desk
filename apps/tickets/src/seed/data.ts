import { TZDate } from "@date-fns/tz";
import { TIME_ZONE } from "@nexo/shared";
import { isWeekend, subDays } from "date-fns";
import type { articles, ticketEvents, tickets } from "../db/schema";

// Sample data from Annex B, with dates relative to the moment the seed runs, so that
// "overdue" and "can be reopened" hold on any day.

type TicketRow = typeof tickets.$inferInsert;
type EventRow = Omit<typeof ticketEvents.$inferInsert, "id">;
type ArticleRow = Omit<typeof articles.$inferInsert, "searchText">;

const HOUR = 60 * 60 * 1000;

export function sampleTickets(now: Date): { tickets: TicketRow[]; events: EventRow[] } {
  const daysAgo = (days: number) => new Date(now.getTime() - days * 24 * HOUR);
  const rows: TicketRow[] = [];
  const events: EventRow[] = [];

  function add(
    ticket: Omit<TicketRow, "lastUpdateAt"> & { lastUpdateAt?: Date },
    history: Omit<EventRow, "ticketNumber">[] = [],
  ) {
    const opened = {
      kind: "opened",
      at: ticket.openedAt,
      authorId: ticket.requesterId,
      message: null,
    };
    const all = [opened, ...history];
    rows.push({ ...ticket, lastUpdateAt: ticket.lastUpdateAt ?? all.at(-1)!.at });
    events.push(...all.map((event) => ({ ...event, ticketNumber: ticket.number })));
  }

  // Ana Souza: the tickets shown in the prototype.
  add(
    {
      number: "INC-20311",
      type: "INC",
      title: "Notebook lento após atualização do Windows",
      description:
        "Lentidão geral desde a atualização do Windows. Reiniciar e rodar o diagnóstico da central não resolveu.",
      category: "Hardware",
      priority: "media",
      affected: "so_eu",
      status: "aguardando_analista",
      requesterId: "ana.souza",
      openedAt: daysAgo(12),
    },
    // Last update 6 days ago: past the 3 business days of a medium ticket (overdue).
    [
      {
        kind: "updated",
        at: daysAgo(6),
        authorId: "ana.souza",
        message: "Continua lento mesmo depois de reiniciar e rodar o diagnóstico.",
      },
    ],
  );
  add(
    {
      number: "INC-20298",
      type: "INC",
      title: "Acesso à pasta Financeiro no SharePoint",
      description: "Preciso de acesso de leitura à pasta Financeiro/Fechamento no SharePoint.",
      category: "Acesso",
      priority: "media",
      affected: "so_eu",
      status: "em_andamento",
      requesterId: "ana.souza",
      openedAt: daysAgo(14),
    },
    [
      {
        kind: "status_changed",
        at: daysAgo(1),
        authorId: "rafael.lima",
        message: "Em andamento: pedido enviado ao dono da pasta.",
      },
    ],
  );
  add(
    {
      number: "REQ-10442",
      type: "REQ",
      title: "Segundo monitor para home office",
      description: "Pedido de um segundo monitor para trabalhar de casa.",
      category: "Hardware",
      priority: "baixa",
      affected: "so_eu",
      status: "aprovado",
      requesterId: "ana.souza",
      openedAt: daysAgo(19),
    },
    // Annex B says "1 week ago"; 4 business days keeps it within its 5 business days
    // (tech spec decision "Sample data dates"), so only INC-20311 is overdue.
    [
      {
        kind: "status_changed",
        at: businessDaysBefore(now, 4),
        authorId: "julia.castro",
        message: "Aprovado pelo gestor. Aguardando entrega.",
      },
    ],
  );
  add(
    {
      number: "INC-20150",
      type: "INC",
      title: "Senha do SAP bloqueada",
      description: "A senha do SAP bloqueou depois de três tentativas.",
      category: "Acesso",
      priority: "media",
      affected: "so_eu",
      status: "resolvido",
      requesterId: "ana.souza",
      openedAt: daysAgo(6),
      resolvedAt: daysAgo(4), // within the 7 days: can be reopened
    },
    [
      {
        kind: "status_changed",
        at: daysAgo(4),
        authorId: "julia.castro",
        message: "Senha desbloqueada.",
      },
    ],
  );
  add(
    {
      number: "INC-19877",
      type: "INC",
      title: "Outlook não sincroniza no celular",
      description: "O Outlook do celular parou de receber e-mails.",
      category: "E-mail",
      priority: "media",
      affected: "so_eu",
      status: "resolvido",
      requesterId: "ana.souza",
      openedAt: daysAgo(58),
      resolvedAt: daysAgo(56), // long ago: cannot be reopened
    },
    [
      {
        kind: "status_changed",
        at: daysAgo(56),
        authorId: "rafael.lima",
        message: "Conta reconfigurada.",
      },
    ],
  );
  add(
    {
      number: "INC-19410",
      type: "INC",
      title: "Troca de senha da rede",
      description: "A senha da rede expirou e não consigo trocar.",
      category: "Acesso",
      priority: "baixa",
      affected: "so_eu",
      status: "resolvido",
      requesterId: "ana.souza",
      openedAt: daysAgo(110),
      resolvedAt: daysAgo(109),
    },
    [
      {
        kind: "status_changed",
        at: daysAgo(109),
        authorId: "julia.castro",
        message: "Senha redefinida.",
      },
    ],
  );

  // Other employees: they exist so privacy can be checked (R7).
  add({
    number: "REQ-10439",
    type: "REQ",
    title: "Acesso ao SAP para o time Comercial",
    description: "Preciso de acesso ao SAP ainda hoje para lançar pedidos de clientes.",
    category: "Acesso",
    priority: "alta",
    affected: "so_eu",
    status: "aguardando_analista",
    requesterId: "carla.mendes",
    openedAt: new Date(now.getTime() - 2 * HOUR),
  });
  add({
    number: "INC-20305",
    type: "INC",
    title: "Impressora do 3º andar não imprime",
    description: "Os documentos ficam na fila e não saem.",
    category: "Hardware",
    priority: "media",
    affected: "equipe",
    status: "em_andamento",
    requesterId: "bruno.tavares",
    openedAt: daysAgo(2),
  });
  add({
    number: "INC-20309",
    type: "INC",
    title: "VPN cai a cada 10 minutos",
    description: "A conexão da VPN cai a cada 10 minutos desde a semana passada.",
    category: "Rede e VPN",
    priority: "alta",
    affected: "so_eu",
    status: "aguardando_analista",
    requesterId: "diego.ramos",
    openedAt: daysAgo(1),
  });

  return { tickets: rows, events };
}

export const SAMPLE_ARTICLES: ArticleRow[] = [
  {
    id: "vpn-erro-809",
    title: "VPN com erro 809",
    body: "Reinstale o cliente de VPN pelo portal de softwares e reinicie o computador. Vale apenas para Windows 10; no Windows 11, abra um chamado.",
  },
  {
    id: "horario-service-desk",
    title: "Horário do service desk",
    body: "O service desk atende de segunda a sexta, das 8h às 18h. Chamados críticos têm plantão 24 horas.",
  },
  {
    id: "senha-rede",
    title: "Redefinir a senha da rede",
    body: "A senha da rede Nexo é a mesma do e-mail e do computador. Para redefinir, ligue para o service desk no ramal 4000.",
  },
  {
    id: "email-celular",
    title: "Configurar o e-mail corporativo no celular",
    body: "Instale o Outlook pela loja do celular e entre com o e-mail corporativo. Se o celular pedir o aplicativo de gerenciamento, aceite a instalação.",
  },
  {
    id: "notebook-lento",
    title: "Notebook lento depois de uma atualização",
    body: "Reinicie o notebook e rode o diagnóstico pelo portal de softwares. Se continuar lento depois disso, abra um chamado informando o modelo do notebook.",
  },
  {
    id: "impressora",
    title: "Impressora não imprime",
    body: "Confira se escolheu a impressora do seu andar e cancele os documentos parados na fila. Se a impressora mostrar erro no painel, abra um chamado.",
  },
  {
    id: "acesso-sistemas",
    title: "Pedir acesso a um sistema ou pasta",
    body: "Acessos a sistemas, como SAP, e a pastas do SharePoint são requisições. Abra um chamado dizendo o sistema ou a pasta; o acesso é liberado depois da aprovação do gestor.",
  },
  {
    id: "wifi-visitantes",
    title: "Wi-Fi para visitantes",
    body: "Visitantes usam a rede Nexo-Visitantes. A senha do dia fica com a recepção de cada andar.",
  },
];

// The same time of day, `days` weekdays earlier, in São Paulo time.
function businessDaysBefore(now: Date, days: number): Date {
  let local = new TZDate(now.getTime(), TIME_ZONE);
  for (let counted = 0; counted < days;) {
    local = subDays(local, 1);
    if (!isWeekend(local)) counted += 1;
  }
  return new Date(local.getTime());
}
