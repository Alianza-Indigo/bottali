CREATE TABLE "tool_provider_credentials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tool_id" uuid NOT NULL,
	"provider_id" uuid NOT NULL,
	"api_key_encrypted" text NOT NULL,
	"key_hint" varchar(16) NOT NULL,
	"base_url" text,
	"last_tested_at" timestamp with time zone,
	"last_test_status" varchar(16),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tool_provider_credentials" ADD CONSTRAINT "tool_provider_credentials_tool_id_tools_id_fk" FOREIGN KEY ("tool_id") REFERENCES "public"."tools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tool_provider_credentials" ADD CONSTRAINT "tool_provider_credentials_provider_id_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."providers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "tool_provider_credentials_tool_provider_idx" ON "tool_provider_credentials" USING btree ("tool_id","provider_id");--> statement-breakpoint
CREATE INDEX "tool_provider_credentials_tool_idx" ON "tool_provider_credentials" USING btree ("tool_id");