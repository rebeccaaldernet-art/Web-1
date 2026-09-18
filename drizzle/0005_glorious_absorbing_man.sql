CREATE TABLE `channel_reads` (
	`user_id` text NOT NULL,
	`channel` text NOT NULL,
	`last_seq` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`user_id`, `channel`)
);
--> statement-breakpoint
CREATE TABLE `message_notifications` (
	`seq` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`message_id` text NOT NULL,
	`channel` text NOT NULL,
	`sender` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `message_notifications_message_id_unique` ON `message_notifications` (`message_id`);--> statement-breakpoint
CREATE INDEX `idx_message_notifications_channel_seq` ON `message_notifications` (`channel`,`seq`);