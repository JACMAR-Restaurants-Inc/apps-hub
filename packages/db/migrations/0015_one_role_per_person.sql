CREATE TABLE "rbac"."person_stores" (
	"email" text NOT NULL,
	"restaurant_id" text NOT NULL,
	CONSTRAINT "person_stores_email_restaurant_id_pk" PRIMARY KEY("email","restaurant_id")
);
--> statement-breakpoint
ALTER TABLE "rbac"."person_stores" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "rbac"."app_members" ADD COLUMN "granted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "rbac"."users" ADD COLUMN "role" "rbac"."role";--> statement-breakpoint
ALTER TABLE "rbac"."person_stores" ADD CONSTRAINT "person_stores_email_users_email_fk" FOREIGN KEY ("email") REFERENCES "rbac"."users"("email") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rbac"."person_stores" ADD CONSTRAINT "person_stores_restaurant_id_restaurants_restaurant_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "rbac"."restaurants"("restaurant_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- One role and one set of restaurants per person (owner, 2026-10-06). Refuse, rather
-- than pick one, if anybody's ACTIVE apps disagree: an admin settles that by hand.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM (
      SELECT m.email, m.role,
        coalesce((SELECT string_agg(s.restaurant_id, ',' ORDER BY s.restaurant_id)
                  FROM rbac.member_stores s WHERE s.app = m.app AND s.email = m.email), '') AS stores
      FROM rbac.app_members m WHERE m.status = 'active'
    ) x
    GROUP BY email HAVING count(DISTINCT role) > 1 OR count(DISTINCT stores) > 1
  ) THEN
    RAISE EXCEPTION 'Somebody holds different roles or restaurants in different apps: settle it before migrating';
  END IF;
END $$;--> statement-breakpoint
-- Each person's role and restaurants come from an active app if they have one, else from
-- the app most recently changed (a removal keeps what they held, as the row did).
UPDATE rbac.users u SET role = p.role
  FROM (SELECT DISTINCT ON (email) email, app, role
     FROM rbac.app_members
     WHERE role IS NOT NULL
     ORDER BY email, (status = 'active') DESC, last_modified DESC) p
  WHERE u.email = p.email;--> statement-breakpoint
INSERT INTO rbac.person_stores (email, restaurant_id)
  SELECT s.email, s.restaurant_id
  FROM (SELECT DISTINCT ON (email) email, app, role
     FROM rbac.app_members
     WHERE role IS NOT NULL
     ORDER BY email, (status = 'active') DESC, last_modified DESC) p
  JOIN rbac.member_stores s ON s.app = p.app AND s.email = p.email;--> statement-breakpoint
-- A row with a role was granted at some point: that is what tells a removal from a decline.
UPDATE rbac.app_members SET granted_at = last_modified WHERE role IS NOT NULL;
