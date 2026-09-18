CREATE TABLE `access_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`require_approval` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `members` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`role` text DEFAULT 'member' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `members_user_id_unique` ON `members` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `members_email_unique` ON `members` (`email`);--> statement-breakpoint
INSERT INTO access_settings (id,require_approval) VALUES ('workspace',0);
--> statement-breakpoint
INSERT INTO members (id,user_id,email,name,role,status,created) VALUES ('workspace-owner',NULL,'rebeccaaldernet@gmail.com','Rebecca Aldernet','owner','active',0);
