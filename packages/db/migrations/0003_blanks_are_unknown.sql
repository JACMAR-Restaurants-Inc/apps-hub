ALTER TABLE "cash"."count_petty_cash" ALTER COLUMN "description" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "cash"."till_fixes" ALTER COLUMN "intake_delta_cents" DROP NOT NULL;