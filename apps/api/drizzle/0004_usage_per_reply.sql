ALTER TABLE "decisions" ADD COLUMN "model" text;--> statement-breakpoint
ALTER TABLE "decisions" ADD COLUMN "model_calls" integer;--> statement-breakpoint
ALTER TABLE "decisions" ADD COLUMN "input_tokens" integer;--> statement-breakpoint
ALTER TABLE "decisions" ADD COLUMN "cached_input_tokens" integer;--> statement-breakpoint
ALTER TABLE "decisions" ADD COLUMN "output_tokens" integer;--> statement-breakpoint
ALTER TABLE "decisions" ADD COLUMN "duration_ms" integer;--> statement-breakpoint
ALTER TABLE "decisions" ADD COLUMN "cost_usd" numeric(10, 6);--> statement-breakpoint
CREATE INDEX "decisions_created_idx" ON "decisions" USING btree ("created_at");