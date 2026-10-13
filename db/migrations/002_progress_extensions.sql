-- Java Mastery Quest — extensions discovered while building the vertical slice.

-- Content removed from /content is retired, never deleted, so learner history keeps its references.
ALTER TABLE lesson          ADD COLUMN retired BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE question        ADD COLUMN retired BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE coding_exercise ADD COLUMN retired BOOLEAN NOT NULL DEFAULT false;

-- Pre-rendered, syntax-highlighted code (generated at seed time from trusted content by Shiki).
ALTER TABLE question ADD COLUMN code_html TEXT;
ALTER TABLE question ADD COLUMN source_file TEXT;

-- Lesson predict blocks are verified individually; store how many of them passed on the target JDK.
ALTER TABLE lesson ADD COLUMN predicts_total    INT NOT NULL DEFAULT 0;
ALTER TABLE lesson ADD COLUMN predicts_verified INT NOT NULL DEFAULT 0;
ALTER TABLE lesson ADD COLUMN source_file TEXT;

-- History must survive content edits: never cascade-delete learner rows from content rows.
ALTER TABLE question_attempt DROP CONSTRAINT question_attempt_question_id_fkey,
  ADD CONSTRAINT question_attempt_question_id_fkey FOREIGN KEY (question_id) REFERENCES question(id) ON DELETE RESTRICT;
ALTER TABLE review_item DROP CONSTRAINT review_item_question_id_fkey,
  ADD CONSTRAINT review_item_question_id_fkey FOREIGN KEY (question_id) REFERENCES question(id) ON DELETE RESTRICT;
ALTER TABLE review_log DROP CONSTRAINT review_log_question_id_fkey,
  ADD CONSTRAINT review_log_question_id_fkey FOREIGN KEY (question_id) REFERENCES question(id) ON DELETE RESTRICT;
ALTER TABLE mistake_record DROP CONSTRAINT mistake_record_question_id_fkey,
  ADD CONSTRAINT mistake_record_question_id_fkey FOREIGN KEY (question_id) REFERENCES question(id) ON DELETE RESTRICT;
ALTER TABLE coding_submission DROP CONSTRAINT coding_submission_exercise_id_fkey,
  ADD CONSTRAINT coding_submission_exercise_id_fkey FOREIGN KEY (exercise_id) REFERENCES coding_exercise(id) ON DELETE RESTRICT;
ALTER TABLE lesson_progress DROP CONSTRAINT lesson_progress_lesson_id_fkey,
  ADD CONSTRAINT lesson_progress_lesson_id_fkey FOREIGN KEY (lesson_id) REFERENCES lesson(id) ON DELETE RESTRICT;

-- Lesson interactions worth tracking (prediction attempts, sections reached).
CREATE TABLE lesson_event (
  id          BIGSERIAL PRIMARY KEY,
  learner_id  INT  NOT NULL REFERENCES learner(id) ON DELETE CASCADE,
  lesson_id   TEXT NOT NULL REFERENCES lesson(id) ON DELETE RESTRICT,
  kind        TEXT NOT NULL CHECK (kind IN ('opened','section','prediction','retrieval','mastery_quiz')),
  ref         TEXT,                        -- section slug, predict index, ...
  payload     JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX lesson_event_learner_idx ON lesson_event(learner_id, lesson_id, created_at DESC);

-- Daily readiness snapshot: the readiness trend is a historical record (what the model said that day),
-- so it is stored rather than recomputed with today's model.
CREATE TABLE readiness_snapshot (
  learner_id  INT  NOT NULL REFERENCES learner(id) ON DELETE CASCADE,
  day         DATE NOT NULL,
  index_value NUMERIC(5,2) NOT NULL,
  level       TEXT NOT NULL,
  preliminary BOOLEAN NOT NULL,
  detail      JSONB NOT NULL DEFAULT '{}',
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (learner_id, day)
);

-- Study preferences used by the session planner and practice defaults.
ALTER TABLE learner ADD COLUMN difficulty_preference TEXT NOT NULL DEFAULT 'adaptive'
  CHECK (difficulty_preference IN ('adaptive','foundation','intermediate','advanced','expert'));
ALTER TABLE learner ADD COLUMN review_batch_size INT NOT NULL DEFAULT 20 CHECK (review_batch_size BETWEEN 5 AND 100);
ALTER TABLE learner ADD COLUMN sidebar_collapsed BOOLEAN NOT NULL DEFAULT false;

-- Personal notes may also be attached to a coding exercise.
ALTER TABLE personal_note ADD COLUMN exercise_id TEXT REFERENCES coding_exercise(id) ON DELETE SET NULL;

-- Exam attempts: remember which question sets were used (to measure stability across *different* sets).
CREATE INDEX exam_attempt_answer_question_idx ON exam_attempt_answer(question_id);
