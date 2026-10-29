ALTER TABLE "decisions" ADD COLUMN "enforced_rules" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "decisions" ADD COLUMN "source" text DEFAULT 'agent' NOT NULL;--> statement-breakpoint
ALTER TABLE "decisions" ADD COLUMN "registered" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "decisions" ADD CONSTRAINT "decisions_source_check" CHECK ("decisions"."source" in ('agent', 'server'));--> statement-breakpoint
-- Stage 8 backfill: replies written after Confirm or Cancel, and turns the model did not register.
UPDATE "decisions" SET "source" = 'server' WHERE "action" in ('criou_chamado', 'atualizou_chamado', 'reabriu_chamado', 'cancelou_rascunho');--> statement-breakpoint
UPDATE "decisions" SET "registered" = false WHERE "rationale" = 'O modelo não registrou a decisão.';
