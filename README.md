# Nexo Assist

Support agent for Nexo's IT service desk (technical challenge).

> Current state: **hello world**. A Mastra agent with one sample tool, streaming its reply on a Next.js page.
> Product requirements and the stage roadmap: [docs/prd.md](docs/prd.md).

## How to run

Requirements: Node 22 (see `.nvmrc`) and pnpm 10.

```bash
pnpm install
cp .env.example .env.local   # fill in ANTHROPIC_API_KEY
pnpm dev
```

Open http://localhost:3000 and ask, for example, "qual o horário do service desk?".
The line above the reply shows the tool the agent called.

## Model

The model is set in `NEXO_AGENT_MODEL` (Mastra model router format, `provider/model`).
The default is `anthropic/claude-opus-5-5`. The final choice and its cost rationale come in a later stage.
