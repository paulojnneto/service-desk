// Where the agent sends requests outside IT (Annex A, R8; stage 6 PRD, decision 6).
// Fictional Nexo channels, shown to the employee in Portuguese.
export const OUT_OF_SCOPE_CHANNELS = [
  {
    area: "RH",
    topics: "férias, folha de pagamento, benefícios, ponto, admissão e desligamento",
    channel: "Portal de RH (rh.nexo.com.br) ou ramal 4100",
  },
  {
    area: "Financeiro",
    topics: "reembolsos, adiantamentos, notas fiscais e cartão corporativo",
    channel: "Portal de reembolsos (financeiro.nexo.com.br) ou ramal 4200",
  },
  {
    area: "Facilities",
    topics: "limpeza, manutenção predial, ar-condicionado, mobiliário, crachás e estacionamento",
    channel: "Portal de facilities (facilities.nexo.com.br) ou ramal 4300",
  },
] as const;
