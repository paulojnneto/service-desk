# Nexo Assist

Agent de atendimento do service desk de TI da Nexo (desafio técnico).

> Estado atual: **hello world**. Um agent Mastra com uma tool de exemplo, respondendo em streaming numa página Next.js.

## Como rodar

Pré-requisitos: Node 22 (veja `.nvmrc`) e pnpm 10.

```bash
pnpm install
cp .env.example .env.local   # preencha ANTHROPIC_API_KEY
pnpm dev
```

Abra http://localhost:3000 e pergunte, por exemplo, "qual o horário do service desk?".
A linha acima da resposta mostra a tool que o agent chamou.

## Modelo

O modelo é configurado em `NEXO_AGENT_MODEL` (formato `provider/modelo` do model router do Mastra).
O padrão é `anthropic/claude-opus-5-5`. A escolha final e a justificativa de custo ficam para as próximas etapas.
