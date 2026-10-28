import type { Article } from "@nexo/shared";
import { sql } from "drizzle-orm";
import { Hono } from "hono";
import { queryRows } from "../db/connect";
import type { TicketsEnv } from "../env-types";
import { toSearchQuery } from "../search-text";

const MAX_RESULTS = 3;

// Help center search: PostgreSQL full-text search over accent-free text, ranked by ts_rank.
export const articleRoutes = new Hono<TicketsEnv>().get("/search", async (c) => {
  const query = toSearchQuery(c.req.query("q") ?? "");
  if (!query) return c.json({ error: "invalid_input" }, 400);

  const articles = await queryRows<Article>(
    c.get("db"),
    sql`
      select id, title, body
      from articles, to_tsquery('simple', ${query}) as query
      where to_tsvector('simple', search_text) @@ query
      order by ts_rank(to_tsvector('simple', search_text), query) desc, id
      limit ${MAX_RESULTS}`,
  );
  return c.json({ articles });
});
