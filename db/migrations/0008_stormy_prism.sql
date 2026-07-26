ALTER TABLE "messages" ADD COLUMN "generated_file_ids" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "generated_files" ADD COLUMN "title" varchar(255) NOT NULL;