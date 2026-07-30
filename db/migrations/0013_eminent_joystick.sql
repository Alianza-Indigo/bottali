CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" varchar(80) NOT NULL,
	"name" varchar(120) NOT NULL,
	"status" varchar(24) DEFAULT 'ACTIVE' NOT NULL,
	"logo_url" text,
	"icon_url" text,
	"primary_color" varchar(16) DEFAULT '#0f766e' NOT NULL,
	"secondary_color" varchar(16) DEFAULT '#071a23' NOT NULL,
	"custom_domain" varchar(255),
	"google_allowed_domain" varchar(255),
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"suspended_at" timestamp with time zone
);
--> statement-breakpoint
INSERT INTO "organizations" ("id", "slug", "name", "status")
VALUES ('00000000-0000-4000-8000-000000000001', 'bottali', 'Bottali', 'ACTIVE')
ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint
CREATE TABLE "organization_member_roles" (
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role_id" uuid NOT NULL,
	"assigned_by" uuid,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organization_member_roles_organization_id_user_id_role_id_pk" PRIMARY KEY("organization_id","user_id","role_id")
);
--> statement-breakpoint
CREATE TABLE "organization_memberships" (
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"status" varchar(24) DEFAULT 'ACTIVE' NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"invited_by" uuid,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organization_memberships_organization_id_user_id_pk" PRIMARY KEY("organization_id","user_id")
);
--> statement-breakpoint
DROP INDEX "tools_slug_idx";--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "organization_id" uuid;--> statement-breakpoint
ALTER TABLE "groups" ADD COLUMN "organization_id" uuid;--> statement-breakpoint
ALTER TABLE "tools" ADD COLUMN "organization_id" uuid;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "organization_id" uuid;--> statement-breakpoint
ALTER TABLE "generated_files" ADD COLUMN "organization_id" uuid;--> statement-breakpoint
ALTER TABLE "uploaded_files" ADD COLUMN "organization_id" uuid;--> statement-breakpoint
UPDATE "sessions" SET "organization_id" = '00000000-0000-4000-8000-000000000001' WHERE "organization_id" IS NULL;--> statement-breakpoint
UPDATE "groups" SET "organization_id" = '00000000-0000-4000-8000-000000000001' WHERE "organization_id" IS NULL;--> statement-breakpoint
UPDATE "tools" SET "organization_id" = '00000000-0000-4000-8000-000000000001' WHERE "organization_id" IS NULL;--> statement-breakpoint
UPDATE "conversations" SET "organization_id" = '00000000-0000-4000-8000-000000000001' WHERE "organization_id" IS NULL;--> statement-breakpoint
UPDATE "generated_files" SET "organization_id" = '00000000-0000-4000-8000-000000000001' WHERE "organization_id" IS NULL;--> statement-breakpoint
UPDATE "uploaded_files" SET "organization_id" = '00000000-0000-4000-8000-000000000001' WHERE "organization_id" IS NULL;--> statement-breakpoint
ALTER TABLE "sessions" ALTER COLUMN "organization_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "groups" ALTER COLUMN "organization_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "tools" ALTER COLUMN "organization_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "conversations" ALTER COLUMN "organization_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "generated_files" ALTER COLUMN "organization_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "uploaded_files" ALTER COLUMN "organization_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "organization_member_roles" ADD CONSTRAINT "organization_member_roles_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_member_roles" ADD CONSTRAINT "organization_member_roles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_member_roles" ADD CONSTRAINT "organization_member_roles_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_member_roles" ADD CONSTRAINT "organization_member_roles_assigned_by_users_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_memberships" ADD CONSTRAINT "organization_memberships_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_memberships" ADD CONSTRAINT "organization_memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_memberships" ADD CONSTRAINT "organization_memberships_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
INSERT INTO "organization_memberships" ("organization_id", "user_id", "status", "is_default")
SELECT '00000000-0000-4000-8000-000000000001', "id", 'ACTIVE', true
FROM "users"
ON CONFLICT ("organization_id", "user_id") DO NOTHING;--> statement-breakpoint
INSERT INTO "organization_member_roles" ("organization_id", "user_id", "role_id", "assigned_by", "assigned_at")
SELECT '00000000-0000-4000-8000-000000000001', ur."user_id", ur."role_id", ur."assigned_by", ur."assigned_at"
FROM "user_roles" ur
INNER JOIN "roles" r ON r."id" = ur."role_id"
WHERE r."key" NOT IN ('SUPER_ADMIN', 'PLATFORM_ADMIN')
ON CONFLICT ("organization_id", "user_id", "role_id") DO NOTHING;--> statement-breakpoint
DELETE FROM "user_roles"
USING "roles"
WHERE "user_roles"."role_id" = "roles"."id"
  AND "roles"."key" NOT IN ('SUPER_ADMIN', 'PLATFORM_ADMIN');--> statement-breakpoint
CREATE UNIQUE INDEX "organizations_slug_idx" ON "organizations" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "organizations_custom_domain_idx" ON "organizations" USING btree ("custom_domain");--> statement-breakpoint
CREATE INDEX "organizations_status_idx" ON "organizations" USING btree ("status");--> statement-breakpoint
CREATE INDEX "organization_member_roles_role_idx" ON "organization_member_roles" USING btree ("role_id");--> statement-breakpoint
CREATE INDEX "organization_memberships_user_idx" ON "organization_memberships" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "groups" ADD CONSTRAINT "groups_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tools" ADD CONSTRAINT "tools_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generated_files" ADD CONSTRAINT "generated_files_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uploaded_files" ADD CONSTRAINT "uploaded_files_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sessions_organization_idx" ON "sessions" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "groups_organization_idx" ON "groups" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tools_organization_slug_idx" ON "tools" USING btree ("organization_id","slug");--> statement-breakpoint
CREATE INDEX "tools_organization_idx" ON "tools" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "conversations_organization_idx" ON "conversations" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "generated_files_organization_idx" ON "generated_files" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "uploaded_files_organization_idx" ON "uploaded_files" USING btree ("organization_id");
