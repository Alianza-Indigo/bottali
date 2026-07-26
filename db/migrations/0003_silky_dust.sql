CREATE TYPE "public"."tool_call_confirmation_status" AS ENUM('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED');--> statement-breakpoint
CREATE TABLE "tool_call_confirmations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"tool_id" uuid NOT NULL,
	"reservation_id" uuid NOT NULL,
	"tool_call_id" varchar(128) NOT NULL,
	"tool_name" varchar(80) NOT NULL,
	"arguments_json" text NOT NULL,
	"status" "tool_call_confirmation_status" DEFAULT 'PENDING' NOT NULL,
	"generation_state_snapshot" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tool_call_confirmations" ADD CONSTRAINT "tool_call_confirmations_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tool_call_confirmations" ADD CONSTRAINT "tool_call_confirmations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tool_call_confirmations" ADD CONSTRAINT "tool_call_confirmations_tool_id_tools_id_fk" FOREIGN KEY ("tool_id") REFERENCES "public"."tools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tool_call_confirmations" ADD CONSTRAINT "tool_call_confirmations_reservation_id_usage_reservations_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."usage_reservations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tool_call_confirmations_conversation_idx" ON "tool_call_confirmations" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "tool_call_confirmations_status_idx" ON "tool_call_confirmations" USING btree ("status");--> statement-breakpoint
CREATE INDEX "tool_call_confirmations_expires_idx" ON "tool_call_confirmations" USING btree ("expires_at");