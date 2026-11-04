CREATE TABLE `document_comments` (
	`id` text PRIMARY KEY NOT NULL,
	`node_id` text NOT NULL,
	`parent_id` text,
	`anchor` text,
	`body` text NOT NULL,
	`author_id` text,
	`resolved` integer DEFAULT false NOT NULL,
	`mentions` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`node_id`) REFERENCES `nodes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `doc_comments_node_idx` ON `document_comments` (`node_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `document_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`node_id` text NOT NULL,
	`label` text,
	`kind` text DEFAULT 'auto' NOT NULL,
	`content` text NOT NULL,
	`author_id` text,
	`size` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`node_id`) REFERENCES `nodes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `doc_versions_node_idx` ON `document_versions` (`node_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `documents` (
	`node_id` text PRIMARY KEY NOT NULL,
	`ystate` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`review_by` text,
	`revision` integer DEFAULT 0 NOT NULL,
	`last_editor_id` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`node_id`) REFERENCES `nodes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `backup_agents` ADD `schedule` text;--> statement-breakpoint
ALTER TABLE `backup_agents` ADD `enabled` integer DEFAULT (1) NOT NULL;--> statement-breakpoint
ALTER TABLE `backup_agents` ADD `agent_version` text;--> statement-breakpoint
ALTER TABLE `backup_agents` ADD `pre_run` text;--> statement-breakpoint
ALTER TABLE `backup_agents` ADD `post_run` text;--> statement-breakpoint
ALTER TABLE `backup_agents` ADD `excludes` text;--> statement-breakpoint
ALTER TABLE `backup_jobs` ADD `pre_run` text;--> statement-breakpoint
ALTER TABLE `backup_jobs` ADD `post_run` text;