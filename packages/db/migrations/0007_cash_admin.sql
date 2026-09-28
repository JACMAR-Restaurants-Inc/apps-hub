CREATE TABLE "cash"."settings_log" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "cash"."settings_log_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_email" text NOT NULL,
	"restaurant_id" text NOT NULL,
	"event" text NOT NULL,
	"till_number" integer,
	"before" text,
	"after" text
);
--> statement-breakpoint
ALTER TABLE "cash"."settings_log" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "cash"."tills" ADD COLUMN "active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
CREATE INDEX "settings_log_restaurant_id_at_index" ON "cash"."settings_log" USING btree ("restaurant_id","at");