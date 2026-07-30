CREATE TABLE "tool_external_credentials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tool_id" uuid NOT NULL,
	"name" varchar(80) NOT NULL,
	"auth_type" varchar(32) NOT NULL,
	"secret_encrypted" text NOT NULL,
	"key_hint" varchar(24) NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tool_external_credentials" ADD CONSTRAINT "tool_external_credentials_tool_id_tools_id_fk" FOREIGN KEY ("tool_id") REFERENCES "public"."tools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tool_external_credentials" ADD CONSTRAINT "tool_external_credentials_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tool_external_credentials" ADD CONSTRAINT "tool_external_credentials_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "tool_external_credentials_tool_name_idx" ON "tool_external_credentials" USING btree ("tool_id","name");--> statement-breakpoint
CREATE INDEX "tool_external_credentials_tool_idx" ON "tool_external_credentials" USING btree ("tool_id");