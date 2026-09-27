CREATE SCHEMA "portal";
--> statement-breakpoint
CREATE TABLE "portal"."favourites" (
	"email" text NOT NULL,
	"app" text NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "favourites_email_app_pk" PRIMARY KEY("email","app")
);
--> statement-breakpoint
ALTER TABLE "portal"."favourites" ENABLE ROW LEVEL SECURITY;