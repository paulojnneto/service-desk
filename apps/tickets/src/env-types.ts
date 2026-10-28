import type { Db } from "./db/connect";

// Values the middleware puts on each request, read by the routes.
export type TicketsEnv = {
  Variables: {
    db: Db;
    now: () => Date;
    requesterId: string;
  };
};
