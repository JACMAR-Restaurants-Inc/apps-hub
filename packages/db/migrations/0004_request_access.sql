ALTER TABLE "rbac"."admins" ADD COLUMN "notify" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "rbac"."app_members" ADD COLUMN "notified_on" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "rbac"."users" ADD COLUMN "clearview_store" text;