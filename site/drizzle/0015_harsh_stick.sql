CREATE TABLE `stable_reward_settlements` (
	`id` text PRIMARY KEY NOT NULL,
	`submission_id` text NOT NULL,
	`claim_id` text NOT NULL,
	`cultivator_id` text NOT NULL,
	`first_release_id` integer NOT NULL,
	`first_tag` text NOT NULL,
	`first_commit` text NOT NULL,
	`first_published_at` integer NOT NULL,
	`second_release_id` integer NOT NULL,
	`second_tag` text NOT NULL,
	`second_commit` text NOT NULL,
	`second_published_at` integer NOT NULL,
	`artifact_sha256` text NOT NULL,
	`token` integer NOT NULL,
	`cultivation` integer NOT NULL,
	`merit` integer NOT NULL,
	`reviewed_by` text NOT NULL,
	`review_reason` text NOT NULL,
	`settled_at` integer NOT NULL,
	FOREIGN KEY (`submission_id`) REFERENCES `submissions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`claim_id`) REFERENCES `claims`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`cultivator_id`) REFERENCES `cultivators`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`reviewed_by`) REFERENCES `cultivators`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "stable_settlement_versions" CHECK("stable_reward_settlements"."first_release_id" > 0 AND "stable_reward_settlements"."second_release_id" > 0 AND "stable_reward_settlements"."first_release_id" != "stable_reward_settlements"."second_release_id" AND "stable_reward_settlements"."first_tag" != "stable_reward_settlements"."second_tag" AND "stable_reward_settlements"."first_commit" != "stable_reward_settlements"."second_commit" AND "stable_reward_settlements"."second_published_at" - "stable_reward_settlements"."first_published_at" >= 604800000),
	CONSTRAINT "stable_settlement_rewards" CHECK("stable_reward_settlements"."token" >= 0 AND "stable_reward_settlements"."cultivation" >= 0 AND "stable_reward_settlements"."merit" >= 0 AND "stable_reward_settlements"."reviewed_by" != "stable_reward_settlements"."cultivator_id" AND length("stable_reward_settlements"."review_reason") BETWEEN 20 AND 500)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_stable_settlement_submission` ON `stable_reward_settlements` (`submission_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_stable_settlement_claim` ON `stable_reward_settlements` (`claim_id`);
--> statement-breakpoint
CREATE TRIGGER stable_settlement_current BEFORE INSERT ON stable_reward_settlements
WHEN NOT EXISTS (
  SELECT 1 FROM submissions s JOIN claims c ON c.id = s.claim_id AND c.cultivator_id = s.cultivator_id
    JOIN missions m ON m.id = c.mission_id
  WHERE s.id = NEW.submission_id AND c.id = NEW.claim_id AND s.cultivator_id = NEW.cultivator_id
    AND s.state = 'accepted' AND c.state = 'completed' AND m.state = 'done'
    AND lower(s.artifact_sha256) = NEW.artifact_sha256 AND s.integrated_at IS NOT NULL
    AND json_valid(c.reward_snapshot)
    AND json_extract(c.reward_snapshot, '$.stable.policyVersion') = 1
    AND json_extract(c.reward_snapshot, '$.stable.token') = NEW.token
    AND json_extract(c.reward_snapshot, '$.stable.cultivation') = NEW.cultivation
    AND json_extract(c.reward_snapshot, '$.stable.merit') = NEW.merit
    AND json_extract(c.reward_snapshot, '$.stable.minimumVersionGapMs') = 604800000
)
BEGIN SELECT RAISE(ABORT, 'stable reward evidence is not current'); END;
--> statement-breakpoint
CREATE TRIGGER stable_settlement_no_update BEFORE UPDATE ON stable_reward_settlements
BEGIN SELECT RAISE(ABORT, 'stable reward settlements are append only'); END;
--> statement-breakpoint
CREATE TRIGGER stable_settlement_no_delete BEFORE DELETE ON stable_reward_settlements
BEGIN SELECT RAISE(ABORT, 'stable reward settlements are append only'); END;
