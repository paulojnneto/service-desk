import { existsSync } from "node:fs";

// Loads apps/api/.env.local before any other module reads process.env.
// It must be the first import of the server entry point: the agent picks its model on import.
if (existsSync(".env.local")) process.loadEnvFile(".env.local");
