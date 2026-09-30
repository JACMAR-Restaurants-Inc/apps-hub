CREATE TABLE "rbac"."beta_testers" (
	"app" text NOT NULL,
	"email" text NOT NULL,
	"added_by" text NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "beta_testers_app_email_pk" PRIMARY KEY("app","email")
);
--> statement-breakpoint
ALTER TABLE "rbac"."beta_testers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "rbac"."beta_testers" ADD CONSTRAINT "beta_testers_email_users_email_fk" FOREIGN KEY ("email") REFERENCES "rbac"."users"("email") ON DELETE no action ON UPDATE no action;