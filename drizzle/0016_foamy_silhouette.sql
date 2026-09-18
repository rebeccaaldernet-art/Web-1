CREATE TABLE `lake_sheets` (
	`id` text PRIMARY KEY NOT NULL,
	`workbook` text NOT NULL,
	`position` integer NOT NULL,
	`name` text NOT NULL,
	`columns` text NOT NULL,
	`row_count` integer NOT NULL,
	`bytes` integer DEFAULT 0 NOT NULL,
	`object_key` text NOT NULL,
	`created` integer NOT NULL,
	`updated` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_lake_sheets_workbook_position` ON `lake_sheets` (`workbook`,`position`);--> statement-breakpoint
CREATE TABLE `lake_workbooks` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`state` text DEFAULT 'staging' NOT NULL,
	`revision` text NOT NULL,
	`sheet_count` integer DEFAULT 0 NOT NULL,
	`bytes` integer DEFAULT 0 NOT NULL,
	`created` integer NOT NULL,
	`updated` integer NOT NULL,
	`owner` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_lake_workbooks_state_created` ON `lake_workbooks` (`state`,`created`);--> statement-breakpoint
INSERT INTO `lake_workbooks` (`id`,`name`,`state`,`revision`,`sheet_count`,`bytes`,`created`,`updated`,`owner`) SELECT `id`,`name`,'complete',`object_key`,1,0,`created`,`created`,`owner` FROM `lake_datasets` WHERE `id` NOT IN (SELECT `id` FROM `lake_workbooks`);--> statement-breakpoint
INSERT INTO `lake_sheets` (`id`,`workbook`,`position`,`name`,`columns`,`row_count`,`bytes`,`object_key`,`created`,`updated`) SELECT `id`,`id`,0,'Sheet 1',`columns`,`row_count`,0,`object_key`,`created`,`created` FROM `lake_datasets` WHERE `id` NOT IN (SELECT `id` FROM `lake_sheets`);
