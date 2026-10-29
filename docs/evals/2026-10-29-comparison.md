# Model comparison, 2026-10-29

The Stage 10 eval set (13 conversations, 18 employee turns) ran once with each candidate, with the Stage 11 changes in place: cached tokens read correctly, older tool outputs reduced in the history, and one retry with a 60-second deadline. Prices were read the same day from each model's page in the OpenAI documentation (`MODEL_PRICES`, `packages/shared/src/costs.ts`).

| Model                 | Scenarios | Failures by rule | Model calls | Input tokens (cached) | Output tokens | Cost, 13 conversations | Per conversation | Per employee turn | Time per turn | Report                                     |
| --------------------- | --------- | ---------------- | ----------- | --------------------- | ------------- | ---------------------- | ---------------- | ----------------- | ------------- | ------------------------------------------ |
| `openai/gpt-5.5`      | 13 of 13  | none             | 49          | 168,701 (77%)         | 5,211         | US$ 0.415              | US$ 0.032        | US$ 0.023         | 7.8 s         | [gpt-5.5](2026-10-29-gpt-5.5-3.md)         |
| `openai/gpt-5.4-mini` | 9 of 13   | R6 × 3, R4 × 1   | 52          | 176,859 (88%)         | 3,133         | US$ 0.042              | US$ 0.003        | US$ 0.002         | 3.8 s         | [gpt-5.4-mini](2026-10-29-gpt-5.4-mini.md) |

Prices, US$ per million tokens:

| Model                 | Input | Cached input | Output |
| --------------------- | ----- | ------------ | ------ |
| `openai/gpt-5.5`      | 5.00  | 0.50         | 30.00  |
| `openai/gpt-5.4-mini` | 0.75  | 0.075        | 4.50   |

## Decision

**GPT-5.5 stays the default.**

The PRD (decision 2) puts the eval pass rate first, and allows no default that fails a scenario of R3, R5, R6 or R7. GPT-5.4 mini failed three R6 scenarios:

- a critical case became a draft instead of a handoff;
- two unclear messages never led to an offer of an analyst;
- after a hand back, it said it would call the analyst again without doing it.

It also failed one R4 scenario. Its price and speed are better by a factor of ten and of two, but these failures are about the employee reaching a person when they should.

## Cost per conversation with GPT-5.5

- **Typical:** US$ 0.03. That is the average of the 13 reference conversations, one to three employee turns each.
- **Longest in the set:** US$ 0.06, `vpn-windows-11`. Three turns ending in a draft and a confirmation, with 7 model calls.
- **Per employee turn:** US$ 0.023 on average. At the default allowance of 40 turns a day, one employee can spend at most about US$ 0.92 a day. The default daily budget of US$ 5 covers about 200 agent turns, or 150 typical conversations, for everyone together.
- **Caching:** 77% of the input tokens were cached. Without the cache, the same run would cost about US$ 1.00 instead of US$ 0.41.

## Limits of this comparison

- One run per model. A real model varies between runs, so a scenario that passed once may fail another time. `pnpm eval --repeat 3` measures that when a decision depends on it.
- The OpenAI pricing page also lists a newer gpt-6 family, for example `gpt-6-luna` at US$ 0.10 / 0.50 per million tokens. It was outside the approved comparison and was not run. It is a candidate for later, through the same eval set.
