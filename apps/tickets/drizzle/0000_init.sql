CREATE SEQUENCE "public"."inc_number_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 20312 CACHE 1;--> statement-breakpoint
CREATE SEQUENCE "public"."req_number_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 10443 CACHE 1;--> statement-breakpoint
CREATE TABLE "articles" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"search_text" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "idempotency_keys" (
	"requester_id" text NOT NULL,
	"key" text NOT NULL,
	"status" integer NOT NULL,
	"body" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "idempotency_keys_requester_id_key_pk" PRIMARY KEY("requester_id","key")
);
--> statement-breakpoint
CREATE TABLE "ticket_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"ticket_number" text NOT NULL,
	"kind" text NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"author_id" text NOT NULL,
	"message" text
);
--> statement-breakpoint
CREATE TABLE "tickets" (
	"number" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"category" text NOT NULL,
	"priority" text NOT NULL,
	"affected" text NOT NULL,
	"status" text NOT NULL,
	"requester_id" text NOT NULL,
	"opened_at" timestamp with time zone NOT NULL,
	"last_update_at" timestamp with time zone NOT NULL,
	"resolved_at" timestamp with time zone,
	CONSTRAINT "tickets_type_check" CHECK ("tickets"."type" in ('INC', 'REQ')),
	CONSTRAINT "tickets_status_check" CHECK ("tickets"."status" in ('aguardando_analista', 'em_andamento', 'aprovado', 'resolvido', 'fechado'))
);
--> statement-breakpoint
ALTER TABLE "ticket_events" ADD CONSTRAINT "ticket_events_ticket_number_tickets_number_fk" FOREIGN KEY ("ticket_number") REFERENCES "public"."tickets"("number") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ticket_events_ticket_idx" ON "ticket_events" USING btree ("ticket_number","at");--> statement-breakpoint
CREATE INDEX "tickets_requester_idx" ON "tickets" USING btree ("requester_id","last_update_at");