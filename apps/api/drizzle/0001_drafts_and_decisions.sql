CREATE SEQUENCE "public"."draft_number_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 381 CACHE 1;--> statement-breakpoint
CREATE TABLE "decisions" (
	"message_id" uuid PRIMARY KEY NOT NULL,
	"conversation_id" uuid NOT NULL,
	"intent" text NOT NULL,
	"action" text NOT NULL,
	"confidence" text NOT NULL,
	"rationale" text NOT NULL,
	"rules" text[] NOT NULL,
	"tools" jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "decisions_confidence_check" CHECK ("decisions"."confidence" in ('alta', 'media', 'baixa'))
);
--> statement-breakpoint
CREATE TABLE "drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" integer DEFAULT nextval('draft_number_seq') NOT NULL,
	"conversation_id" uuid NOT NULL,
	"employee_id" text NOT NULL,
	"kind" text NOT NULL,
	"ticket_number" text,
	"fields" jsonb NOT NULL,
	"duplicates" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"result_ticket" text,
	"created_at" timestamp with time zone NOT NULL,
	"decided_at" timestamp with time zone,
	CONSTRAINT "drafts_kind_check" CHECK ("drafts"."kind" in ('create', 'update', 'reopen')),
	CONSTRAINT "drafts_status_check" CHECK ("drafts"."status" in ('pending', 'confirming', 'confirmed', 'cancelled', 'superseded'))
);
--> statement-breakpoint
ALTER TABLE "decisions" ADD CONSTRAINT "decisions_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decisions" ADD CONSTRAINT "decisions_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drafts" ADD CONSTRAINT "drafts_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "decisions_conversation_idx" ON "decisions" USING btree ("conversation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "drafts_one_pending_idx" ON "drafts" USING btree ("conversation_id") WHERE "drafts"."status" in ('pending', 'confirming');