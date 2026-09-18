CREATE TABLE `direct_messages` (
	`seq` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`id` text NOT NULL,
	`thread` text NOT NULL,
	`sender` text NOT NULL,
	`body` text NOT NULL,
	`created` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `direct_messages_id_unique` ON `direct_messages` (`id`);--> statement-breakpoint
CREATE INDEX `idx_direct_messages_thread_seq` ON `direct_messages` (`thread`,`seq`);--> statement-breakpoint
CREATE TABLE `direct_reads` (
	`member_id` text NOT NULL,
	`thread` text NOT NULL,
	`last_seq` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`member_id`, `thread`)
);
--> statement-breakpoint
CREATE TABLE `direct_threads` (
	`id` text PRIMARY KEY NOT NULL,
	`member_a` text NOT NULL,
	`member_b` text NOT NULL,
	`created` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_direct_pair` ON `direct_threads` (`member_a`,`member_b`);