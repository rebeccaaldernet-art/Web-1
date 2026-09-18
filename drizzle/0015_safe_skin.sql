CREATE TABLE `lake_audit` (
	`id` text PRIMARY KEY NOT NULL,
	`actor` text NOT NULL,
	`action` text NOT NULL,
	`dataset` text NOT NULL,
	`created` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_lake_audit_created` ON `lake_audit` (`created`);--> statement-breakpoint
CREATE TABLE `lake_datasets` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`columns` text NOT NULL,
	`row_count` integer NOT NULL,
	`object_key` text NOT NULL,
	`created` integer NOT NULL,
	`owner` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `lake_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`dataset` text NOT NULL,
	`hash` text NOT NULL,
	`owner` text NOT NULL,
	`expires` integer NOT NULL,
	`created` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `lake_tokens_hash_unique` ON `lake_tokens` (`hash`);