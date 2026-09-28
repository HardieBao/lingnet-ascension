CREATE TABLE `result_revalidation_decisions` (
	`revalidation_id` text PRIMARY KEY NOT NULL,
	`decision` text NOT NULL,
	`decided_by` text NOT NULL,
	`reason` text NOT NULL,
	`decided_at` integer NOT NULL,
	FOREIGN KEY (`revalidation_id`) REFERENCES `result_revalidations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`decided_by`) REFERENCES `cultivators`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "revalidation_decision" CHECK("result_revalidation_decisions"."decision" IN ('accept', 'reject')),
	CONSTRAINT "revalidation_decision_reason" CHECK(length("result_revalidation_decisions"."reason") BETWEEN 8 AND 500)
);
--> statement-breakpoint
CREATE TABLE `result_revalidations` (
	`id` text PRIMARY KEY NOT NULL,
	`submission_id` text NOT NULL,
	`cultivator_id` text NOT NULL,
	`pull_number` integer NOT NULL,
	`head_sha` text NOT NULL,
	`ci_run_id` integer NOT NULL,
	`ci_run_attempt` integer NOT NULL,
	`validator_base_commit` text NOT NULL,
	`integrated_commit` text NOT NULL,
	`artifact_sha256` text NOT NULL,
	`outcome` text NOT NULL,
	`findings` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`submission_id`) REFERENCES `submissions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`cultivator_id`) REFERENCES `cultivators`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "revalidation_run" CHECK("result_revalidations"."pull_number" > 0 AND "result_revalidations"."ci_run_id" > 0 AND "result_revalidations"."ci_run_attempt" > 0),
	CONSTRAINT "revalidation_shas" CHECK(length("result_revalidations"."head_sha") = 40 AND "result_revalidations"."head_sha" NOT GLOB '*[^0-9a-f]*' AND length("result_revalidations"."validator_base_commit") = 40 AND "result_revalidations"."validator_base_commit" NOT GLOB '*[^0-9a-f]*' AND length("result_revalidations"."integrated_commit") = 40 AND "result_revalidations"."integrated_commit" NOT GLOB '*[^0-9a-f]*' AND length("result_revalidations"."artifact_sha256") = 64 AND "result_revalidations"."artifact_sha256" NOT GLOB '*[^0-9a-f]*'),
	CONSTRAINT "revalidation_outcome" CHECK("result_revalidations"."outcome" IN ('passed', 'failed')),
	CONSTRAINT "revalidation_findings" CHECK(length("result_revalidations"."findings") BETWEEN 20 AND 2000)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_revalidation_ci_run` ON `result_revalidations` (`ci_run_id`);--> statement-breakpoint
CREATE INDEX `idx_revalidation_author_target` ON `result_revalidations` (`cultivator_id`,`submission_id`);
--> statement-breakpoint
CREATE TRIGGER result_revalidations_valid_target BEFORE INSERT ON result_revalidations
WHEN NOT EXISTS (
  SELECT 1 FROM submissions s JOIN claims c ON c.id = s.claim_id AND c.cultivator_id = s.cultivator_id
    JOIN missions m ON m.id = c.mission_id JOIN cultivators author ON author.id = s.cultivator_id
    JOIN cultivators reporter ON reporter.id = NEW.cultivator_id
  WHERE s.id = NEW.submission_id AND s.state = 'accepted' AND c.state = 'completed' AND m.state = 'done'
    AND s.integrated_at IS NOT NULL AND author.provider = 'github' AND reporter.provider = 'github'
    AND reporter.id != author.id AND NEW.integrated_commit = lower(s.integrated_commit)
    AND NEW.artifact_sha256 = lower(s.artifact_sha256)
) OR EXISTS (
  SELECT 1 FROM result_revalidations r LEFT JOIN result_revalidation_decisions d ON d.revalidation_id = r.id
  WHERE r.submission_id = NEW.submission_id AND r.cultivator_id = NEW.cultivator_id
    AND (d.decision IS NULL OR d.decision = 'accept')
)
BEGIN SELECT RAISE(ABORT, 'revalidation requires a different author and current formal evidence, without an existing pending or adopted report'); END;
--> statement-breakpoint
CREATE TRIGGER result_revalidation_decisions_independent BEFORE INSERT ON result_revalidation_decisions
WHEN NOT EXISTS (
  SELECT 1 FROM result_revalidations r JOIN submissions s ON s.id = r.submission_id
    JOIN cultivators adopter ON adopter.id = NEW.decided_by
  WHERE r.id = NEW.revalidation_id AND adopter.provider = 'github'
    AND adopter.id != r.cultivator_id AND adopter.id != s.cultivator_id AND NEW.decided_at >= r.created_at
) OR (NEW.decision = 'accept' AND (
  NOT EXISTS (
    SELECT 1 FROM result_revalidations r JOIN submissions s ON s.id = r.submission_id
      JOIN claims c ON c.id = s.claim_id AND c.cultivator_id = s.cultivator_id JOIN missions m ON m.id = c.mission_id
    WHERE r.id = NEW.revalidation_id AND s.state = 'accepted' AND c.state = 'completed' AND m.state = 'done'
      AND s.integrated_at IS NOT NULL AND r.integrated_commit = lower(s.integrated_commit)
      AND r.artifact_sha256 = lower(s.artifact_sha256)
  ) OR EXISTS (
    SELECT 1 FROM result_revalidations original JOIN result_revalidations other
      ON other.submission_id = original.submission_id AND other.cultivator_id = original.cultivator_id
      JOIN result_revalidation_decisions decision ON decision.revalidation_id = other.id AND decision.decision = 'accept'
    WHERE original.id = NEW.revalidation_id
  )
))
BEGIN SELECT RAISE(ABORT, 'adoption requires an independent GitHub reviewer, current formal evidence and no duplicate qualification'); END;
--> statement-breakpoint
CREATE TRIGGER result_revalidations_no_update BEFORE UPDATE ON result_revalidations
BEGIN SELECT RAISE(ABORT, 'revalidation evidence is append only'); END;
--> statement-breakpoint
CREATE TRIGGER result_revalidations_no_delete BEFORE DELETE ON result_revalidations
BEGIN SELECT RAISE(ABORT, 'revalidation evidence is append only'); END;
--> statement-breakpoint
CREATE TRIGGER result_revalidation_decisions_no_update BEFORE UPDATE ON result_revalidation_decisions
BEGIN SELECT RAISE(ABORT, 'revalidation decisions are append only'); END;
--> statement-breakpoint
CREATE TRIGGER result_revalidation_decisions_no_delete BEFORE DELETE ON result_revalidation_decisions
BEGIN SELECT RAISE(ABORT, 'revalidation decisions are append only'); END;
