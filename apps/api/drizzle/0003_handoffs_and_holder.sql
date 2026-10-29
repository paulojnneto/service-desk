CREATE TABLE "handoffs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"summary" text NOT NULL,
	"ticket_number" text,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "handoffs_reason_check" CHECK ("handoffs"."reason" in ('pedido_do_funcionario', 'caso_critico', 'chamado_vencido', 'baixa_confianca'))
);
--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "holder_id" text;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "held_since" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "handoffs" ADD CONSTRAINT "handoffs_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "handoffs_conversation_idx" ON "handoffs" USING btree ("conversation_id","created_at");--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_holder_check" CHECK (("conversations"."state" = 'with_analyst') = ("conversations"."holder_id" is not null));