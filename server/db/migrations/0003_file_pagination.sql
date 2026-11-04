CREATE INDEX `nodes_page_name_idx` ON `nodes` (`owner_id`,`trashed_at`,`parent_id`,`kind`,`name_key`,`id`);--> statement-breakpoint
CREATE INDEX `nodes_page_size_idx` ON `nodes` (`owner_id`,`trashed_at`,`parent_id`,`kind`,`size`,`id`);--> statement-breakpoint
CREATE INDEX `nodes_page_updated_idx` ON `nodes` (`owner_id`,`trashed_at`,`parent_id`,`kind`,`updated_at`,`id`);--> statement-breakpoint
CREATE INDEX `nodes_parent_folder_idx` ON `nodes` (`owner_id`,`parent_id`,`trashed_at`,`kind`);
