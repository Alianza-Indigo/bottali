ALTER TABLE "knowledge_bases" ADD COLUMN "organization_id" uuid;--> statement-breakpoint
UPDATE "knowledge_bases"
SET "organization_id" = '00000000-0000-4000-8000-000000000001'
WHERE "organization_id" IS NULL;--> statement-breakpoint
ALTER TABLE "knowledge_bases" ALTER COLUMN "organization_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "knowledge_bases" ADD CONSTRAINT "knowledge_bases_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "knowledge_bases_organization_idx" ON "knowledge_bases" USING btree ("organization_id");
