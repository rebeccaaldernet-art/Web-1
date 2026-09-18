CREATE TABLE `upload_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`batch` text NOT NULL,
	`channel` text NOT NULL,
	`name` text NOT NULL,
	`size` integer NOT NULL,
	`type` text NOT NULL,
	`upload_id` text NOT NULL,
	`state` text DEFAULT 'uploading' NOT NULL,
	`created` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_upload_sessions_owner_batch` ON `upload_sessions` (`owner`,`batch`);--> statement-breakpoint
ALTER TABLE `messages` ADD `mentions` text DEFAULT '{}' NOT NULL;