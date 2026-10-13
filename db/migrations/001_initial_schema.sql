-- Java Mastery Quest — initial schema
-- Content tables are (re)seeded from /content; learner tables are append-mostly history.

-- ───────────────────────── Content ─────────────────────────
CREATE TABLE exam_blueprint (
  code                   TEXT PRIMARY KEY,
  title                  TEXT NOT NULL,
  question_count         INT  NOT NULL CHECK (question_count > 0),
  duration_minutes       INT  NOT NULL CHECK (duration_minutes > 0),
  passing_percent        INT  NOT NULL CHECK (passing_percent BETWEEN 1 AND 100),
  ready_target_percent   INT  NOT NULL CHECK (ready_target_percent BETWEEN 1 AND 100),
  verification           TEXT NOT NULL,
  verification_note      TEXT,
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE exam_domain (
  id          TEXT PRIMARY KEY,            -- 'D3'
  ordinal     INT  NOT NULL UNIQUE,
  title       TEXT NOT NULL,
  short_title TEXT NOT NULL,
  region_name TEXT NOT NULL,               -- game-world name, e.g. "The Object Citadel"
  summary     TEXT NOT NULL,
  icon        TEXT NOT NULL
);

CREATE TABLE exam_objective (
  id             TEXT PRIMARY KEY,         -- 'D3.5'
  domain_id      TEXT NOT NULL REFERENCES exam_domain(id),
  ordinal        INT  NOT NULL,
  title          TEXT NOT NULL,
  basis          TEXT NOT NULL,            -- '830', '830+J25'...
  verification   TEXT NOT NULL CHECK (verification IN ('official','secondary','reconstructed')),
  java_notes     TEXT,
  mastery_threshold NUMERIC(4,3) NOT NULL DEFAULT 0.850,
  UNIQUE (domain_id, ordinal)
);

CREATE TABLE lesson (
  id                TEXT PRIMARY KEY,      -- 'oop-constructors'
  domain_id         TEXT NOT NULL REFERENCES exam_domain(id),
  ordinal           INT  NOT NULL,         -- order within domain (mission order)
  title             TEXT NOT NULL,
  summary           TEXT NOT NULL,
  minutes           INT  NOT NULL CHECK (minutes > 0),
  body_md           TEXT NOT NULL,
  learning_contract JSONB NOT NULL DEFAULT '[]',
  key_rules         JSONB NOT NULL DEFAULT '[]',
  retrieval_prompts JSONB NOT NULL DEFAULT '[]',
  supplementary     BOOLEAN NOT NULL DEFAULT false,
  java_version      TEXT NOT NULL DEFAULT '25',
  version           INT  NOT NULL DEFAULT 1,
  content_hash      TEXT NOT NULL,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (domain_id, ordinal)
);

CREATE TABLE lesson_objective (
  lesson_id    TEXT NOT NULL REFERENCES lesson(id) ON DELETE CASCADE,
  objective_id TEXT NOT NULL REFERENCES exam_objective(id),
  PRIMARY KEY (lesson_id, objective_id)
);

CREATE TABLE lesson_prerequisite (
  lesson_id       TEXT NOT NULL REFERENCES lesson(id) ON DELETE CASCADE,
  prerequisite_id TEXT NOT NULL REFERENCES lesson(id) ON DELETE CASCADE,
  PRIMARY KEY (lesson_id, prerequisite_id),
  CHECK (lesson_id <> prerequisite_id)
);

CREATE TABLE question (
  id                TEXT PRIMARY KEY,      -- 'D3-OVL-004'
  objective_id      TEXT NOT NULL REFERENCES exam_objective(id),
  type              TEXT NOT NULL CHECK (type IN ('single','multi','text')),
  format            TEXT NOT NULL CHECK (format IN ('concept','predict-output','does-it-compile','compile-error',
                        'runtime-exception','select-valid','overload-resolution','polymorphism','trace','repair','complete','short-answer')),
  difficulty        TEXT NOT NULL CHECK (difficulty IN ('foundation','intermediate','advanced','expert')),
  prompt_md         TEXT NOT NULL,
  code              TEXT,
  answer            JSONB NOT NULL,        -- {"options":["b"]} | {"text":["42"]}
  explanation_md    TEXT NOT NULL,
  rule_md           TEXT NOT NULL,
  misconception_md  TEXT,
  lesson_id         TEXT REFERENCES lesson(id) ON DELETE SET NULL,
  est_seconds       INT  NOT NULL CHECK (est_seconds > 0),
  tags              TEXT[] NOT NULL DEFAULT '{}',
  java_version      TEXT NOT NULL DEFAULT '25',
  verification      TEXT NOT NULL CHECK (verification IN ('jdk-verified','reviewed','needs-review')),
  verified_with     TEXT,
  exam_eligible     BOOLEAN NOT NULL DEFAULT false,
  hint_md           TEXT,
  version           INT  NOT NULL DEFAULT 1,
  content_hash      TEXT NOT NULL,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX question_objective_idx ON question(objective_id);
CREATE INDEX question_lesson_idx ON question(lesson_id);

CREATE TABLE question_option (
  question_id  TEXT NOT NULL REFERENCES question(id) ON DELETE CASCADE,
  key          TEXT NOT NULL,              -- 'a','b',...
  ordinal      INT  NOT NULL,
  text_md      TEXT NOT NULL,
  is_correct   BOOLEAN NOT NULL,
  why_md       TEXT NOT NULL,              -- why this option is right/wrong
  PRIMARY KEY (question_id, key)
);

-- Which questions a lesson uses as in-lesson knowledge checks / final mastery quiz
CREATE TABLE lesson_question (
  lesson_id   TEXT NOT NULL REFERENCES lesson(id) ON DELETE CASCADE,
  question_id TEXT NOT NULL REFERENCES question(id) ON DELETE CASCADE,
  role        TEXT NOT NULL CHECK (role IN ('check','mastery')),
  ordinal     INT  NOT NULL,
  PRIMARY KEY (lesson_id, question_id, role)
);

CREATE TABLE coding_exercise (
  id             TEXT PRIMARY KEY,
  objective_id   TEXT NOT NULL REFERENCES exam_objective(id),
  lesson_id      TEXT REFERENCES lesson(id) ON DELETE SET NULL,
  title          TEXT NOT NULL,
  difficulty     TEXT NOT NULL CHECK (difficulty IN ('foundation','intermediate','advanced','expert')),
  kind           TEXT NOT NULL CHECK (kind IN ('implement','repair','complete')),
  prompt_md      TEXT NOT NULL,
  starter_code   TEXT NOT NULL,
  solution_code  TEXT NOT NULL,
  harness_code   TEXT NOT NULL,            -- Main.java that exercises Solution.java
  file_name      TEXT NOT NULL DEFAULT 'Solution.java',
  explanation_md TEXT NOT NULL,
  hints          JSONB NOT NULL DEFAULT '[]',
  time_limit_ms  INT NOT NULL DEFAULT 5000,
  verification   TEXT NOT NULL,
  content_hash   TEXT NOT NULL,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE achievement (
  id          TEXT PRIMARY KEY,
  title       TEXT NOT NULL,
  description TEXT NOT NULL,
  icon        TEXT NOT NULL,
  xp_reward   INT NOT NULL DEFAULT 0,
  ordinal     INT NOT NULL
);

-- ───────────────────────── Learner ─────────────────────────
CREATE TABLE learner (
  id                  INT PRIMARY KEY,
  display_name        TEXT NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  onboarded_at        TIMESTAMPTZ,
  experience_level    TEXT CHECK (experience_level IN ('new','some','professional','expert')),
  prior_certification TEXT,
  daily_minutes       INT  NOT NULL DEFAULT 45 CHECK (daily_minutes BETWEEN 10 AND 480),
  study_days          INT[] NOT NULL DEFAULT '{1,2,3,4,5}', -- ISO weekday 1=Mon
  target_exam_date    DATE,
  strong_domains      TEXT[] NOT NULL DEFAULT '{}',
  weak_domains        TEXT[] NOT NULL DEFAULT '{}',
  mode_preference     TEXT NOT NULL DEFAULT 'balanced' CHECK (mode_preference IN ('learning','balanced','exam')),
  ask_confidence      BOOLEAN NOT NULL DEFAULT true,
  timezone            TEXT NOT NULL DEFAULT 'Africa/Tunis',
  reduced_motion      BOOLEAN NOT NULL DEFAULT false,
  theme               TEXT NOT NULL DEFAULT 'dark' CHECK (theme IN ('dark','light','system')),
  reminders_enabled   BOOLEAN NOT NULL DEFAULT false,
  reminder_time       TIME,
  last_lesson_id      TEXT REFERENCES lesson(id) ON DELETE SET NULL
);

CREATE TABLE study_session (
  id           BIGSERIAL PRIMARY KEY,
  learner_id   INT NOT NULL REFERENCES learner(id) ON DELETE CASCADE,
  kind         TEXT NOT NULL CHECK (kind IN ('lesson','practice','review','exam','boss','exercise')),
  ref          TEXT,                       -- lesson id, exam attempt id...
  config       JSONB NOT NULL DEFAULT '{}',
  started_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at     TIMESTAMPTZ
);
CREATE INDEX study_session_learner_idx ON study_session(learner_id, started_at DESC);

CREATE TABLE lesson_progress (
  learner_id     INT  NOT NULL REFERENCES learner(id) ON DELETE CASCADE,
  lesson_id      TEXT NOT NULL REFERENCES lesson(id) ON DELETE CASCADE,
  status         TEXT NOT NULL CHECK (status IN ('in_progress','completed')),
  started_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at   TIMESTAMPTZ,
  last_section   TEXT,
  predictions_revealed INT NOT NULL DEFAULT 0,
  mastery_score  NUMERIC(5,4),             -- best mastery-quiz score 0..1
  reflection     TEXT,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (learner_id, lesson_id)
);

-- Every answer ever given, in every mode. Append-only.
CREATE TABLE question_attempt (
  id             BIGSERIAL PRIMARY KEY,
  learner_id     INT  NOT NULL REFERENCES learner(id) ON DELETE CASCADE,
  question_id    TEXT NOT NULL REFERENCES question(id) ON DELETE CASCADE,
  question_version INT NOT NULL,
  session_id     BIGINT REFERENCES study_session(id) ON DELETE SET NULL,
  mode           TEXT NOT NULL CHECK (mode IN ('lesson_check','lesson_mastery','practice','timed','review','exam','boss')),
  response       JSONB NOT NULL,
  is_correct     BOOLEAN NOT NULL,
  confidence     SMALLINT CHECK (confidence BETWEEN 1 AND 3), -- 1 guess, 2 unsure, 3 sure
  time_ms        INT CHECK (time_ms >= 0),
  hint_used      BOOLEAN NOT NULL DEFAULT false,
  seen_before    BOOLEAN NOT NULL,          -- learner had attempted this question before
  days_since_last NUMERIC(8,3),             -- interval since previous attempt of this question
  answered_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX question_attempt_learner_time_idx ON question_attempt(learner_id, answered_at DESC);
CREATE INDEX question_attempt_learner_q_idx ON question_attempt(learner_id, question_id, answered_at DESC);

-- Spaced-repetition state (one per learner × question)
CREATE TABLE review_item (
  learner_id     INT  NOT NULL REFERENCES learner(id) ON DELETE CASCADE,
  question_id    TEXT NOT NULL REFERENCES question(id) ON DELETE CASCADE,
  ease           NUMERIC(4,2) NOT NULL DEFAULT 2.50,
  interval_days  NUMERIC(8,3) NOT NULL DEFAULT 0,
  repetitions    INT NOT NULL DEFAULT 0,   -- consecutive successful reviews
  successes      INT NOT NULL DEFAULT 0,
  lapses         INT NOT NULL DEFAULT 0,
  last_grade     SMALLINT,
  last_confidence SMALLINT,
  last_reviewed_at TIMESTAMPTZ,
  due_at         TIMESTAMPTZ NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  suspended      BOOLEAN NOT NULL DEFAULT false,
  PRIMARY KEY (learner_id, question_id)
);
CREATE INDEX review_item_due_idx ON review_item(learner_id, due_at) WHERE NOT suspended;

CREATE TABLE review_log (
  id            BIGSERIAL PRIMARY KEY,
  learner_id    INT NOT NULL REFERENCES learner(id) ON DELETE CASCADE,
  question_id   TEXT NOT NULL REFERENCES question(id) ON DELETE CASCADE,
  attempt_id    BIGINT REFERENCES question_attempt(id) ON DELETE SET NULL,
  grade         SMALLINT NOT NULL CHECK (grade BETWEEN 0 AND 5),
  prev_interval NUMERIC(8,3) NOT NULL,
  new_interval  NUMERIC(8,3) NOT NULL,
  prev_ease     NUMERIC(4,2) NOT NULL,
  new_ease      NUMERIC(4,2) NOT NULL,
  was_due       BOOLEAN NOT NULL,
  reviewed_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX review_log_learner_idx ON review_log(learner_id, reviewed_at DESC);

CREATE TABLE mistake_record (
  learner_id       INT  NOT NULL REFERENCES learner(id) ON DELETE CASCADE,
  question_id      TEXT NOT NULL REFERENCES question(id) ON DELETE CASCADE,
  first_wrong_at   TIMESTAMPTZ NOT NULL,
  last_wrong_at    TIMESTAMPTZ NOT NULL,
  wrong_count      INT NOT NULL DEFAULT 1,
  last_response    JSONB NOT NULL,
  category         TEXT CHECK (category IN ('knowledge_gap','misread','rule_confusion','output_prediction',
                       'compile_vs_runtime','time_pressure','careless','repeated_misconception')),
  category_source  TEXT NOT NULL DEFAULT 'auto' CHECK (category_source IN ('auto','learner')),
  personal_note    TEXT,
  high_confidence_wrong BOOLEAN NOT NULL DEFAULT false,
  correct_since    INT NOT NULL DEFAULT 0, -- consecutive correct answers after the last mistake
  resolved_at      TIMESTAMPTZ,            -- set after 2 spaced correct answers (≥1 day apart)
  PRIMARY KEY (learner_id, question_id)
);

-- Auditable XP ledger. source_key makes awards idempotent.
CREATE TABLE xp_transaction (
  id          BIGSERIAL PRIMARY KEY,
  learner_id  INT  NOT NULL REFERENCES learner(id) ON DELETE CASCADE,
  amount      INT  NOT NULL CHECK (amount <> 0),
  reason      TEXT NOT NULL,
  source_key  TEXT NOT NULL,
  detail      JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (learner_id, source_key)
);
CREATE INDEX xp_transaction_learner_idx ON xp_transaction(learner_id, created_at DESC);

CREATE TABLE learner_achievement (
  learner_id     INT  NOT NULL REFERENCES learner(id) ON DELETE CASCADE,
  achievement_id TEXT NOT NULL REFERENCES achievement(id) ON DELETE CASCADE,
  earned_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  evidence       JSONB NOT NULL DEFAULT '{}',
  PRIMARY KEY (learner_id, achievement_id)
);

CREATE TABLE quest (
  id           BIGSERIAL PRIMARY KEY,
  learner_id   INT  NOT NULL REFERENCES learner(id) ON DELETE CASCADE,
  cadence      TEXT NOT NULL CHECK (cadence IN ('daily','weekly')),
  kind         TEXT NOT NULL,
  title        TEXT NOT NULL,
  params       JSONB NOT NULL DEFAULT '{}',
  target       INT  NOT NULL CHECK (target > 0),
  xp_reward    INT  NOT NULL CHECK (xp_reward >= 0),
  window_start TIMESTAMPTZ NOT NULL,
  window_end   TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  UNIQUE (learner_id, cadence, kind, window_start)
);
CREATE INDEX quest_learner_window_idx ON quest(learner_id, window_end);

CREATE TABLE exam_attempt (
  id             BIGSERIAL PRIMARY KEY,
  learner_id     INT  NOT NULL REFERENCES learner(id) ON DELETE CASCADE,
  kind           TEXT NOT NULL CHECK (kind IN ('full','short','domain','boss','custom')),
  title          TEXT NOT NULL,
  config         JSONB NOT NULL,           -- domains, counts, difficulty, strict
  strict         BOOLEAN NOT NULL DEFAULT true,
  duration_seconds INT CHECK (duration_seconds > 0),
  pass_percent   INT NOT NULL,
  started_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  deadline_at    TIMESTAMPTZ,
  submitted_at   TIMESTAMPTZ,
  submit_reason  TEXT CHECK (submit_reason IN ('learner','timeout')),
  score_correct  INT,
  score_total    INT,
  score_percent  NUMERIC(5,2),
  passed         BOOLEAN,
  session_id     BIGINT REFERENCES study_session(id) ON DELETE SET NULL
);
CREATE INDEX exam_attempt_learner_idx ON exam_attempt(learner_id, started_at DESC);

CREATE TABLE exam_attempt_answer (
  attempt_id   BIGINT NOT NULL REFERENCES exam_attempt(id) ON DELETE CASCADE,
  position     INT    NOT NULL,
  question_id  TEXT   NOT NULL REFERENCES question(id),
  question_version INT NOT NULL,
  option_order TEXT[] NOT NULL DEFAULT '{}',  -- randomized option order shown to learner
  response     JSONB,
  confidence   SMALLINT CHECK (confidence BETWEEN 1 AND 3),
  flagged      BOOLEAN NOT NULL DEFAULT false,
  time_ms      INT NOT NULL DEFAULT 0,
  answered_at  TIMESTAMPTZ,
  is_correct   BOOLEAN,                   -- filled on submission
  PRIMARY KEY (attempt_id, position),
  UNIQUE (attempt_id, question_id)
);

CREATE TABLE coding_submission (
  id            BIGSERIAL PRIMARY KEY,
  learner_id    INT NOT NULL REFERENCES learner(id) ON DELETE CASCADE,
  exercise_id   TEXT NOT NULL REFERENCES coding_exercise(id) ON DELETE CASCADE,
  code          TEXT NOT NULL,
  passed        BOOLEAN NOT NULL,
  tests_passed  INT NOT NULL DEFAULT 0,
  tests_total   INT NOT NULL DEFAULT 0,
  result        JSONB NOT NULL,
  submitted_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX coding_submission_idx ON coding_submission(learner_id, exercise_id, submitted_at DESC);

CREATE TABLE bookmark (
  learner_id  INT  NOT NULL REFERENCES learner(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL CHECK (target_type IN ('lesson','question','exercise')),
  target_id   TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (learner_id, target_type, target_id)
);

CREATE TABLE personal_note (
  id          BIGSERIAL PRIMARY KEY,
  learner_id  INT  NOT NULL REFERENCES learner(id) ON DELETE CASCADE,
  title       TEXT NOT NULL DEFAULT '',
  body_md     TEXT NOT NULL,
  lesson_id   TEXT REFERENCES lesson(id) ON DELETE SET NULL,
  question_id TEXT REFERENCES question(id) ON DELETE SET NULL,
  domain_id   TEXT REFERENCES exam_domain(id),
  tags        TEXT[] NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX personal_note_learner_idx ON personal_note(learner_id, updated_at DESC);

-- Daily activity snapshot for streaks (derived from events, written by the app on activity).
CREATE TABLE activity_day (
  learner_id INT  NOT NULL REFERENCES learner(id) ON DELETE CASCADE,
  day        DATE NOT NULL,
  questions  INT NOT NULL DEFAULT 0,
  correct    INT NOT NULL DEFAULT 0,
  lessons    INT NOT NULL DEFAULT 0,
  reviews    INT NOT NULL DEFAULT 0,
  active_seconds INT NOT NULL DEFAULT 0,
  PRIMARY KEY (learner_id, day)
);

-- Full-text search over content + notes
CREATE INDEX lesson_fts_idx ON lesson USING GIN (to_tsvector('english', title || ' ' || summary || ' ' || body_md));
CREATE INDEX question_fts_idx ON question USING GIN (to_tsvector('english', prompt_md || ' ' || coalesce(code,'') || ' ' || rule_md));
CREATE INDEX note_fts_idx ON personal_note USING GIN (to_tsvector('english', title || ' ' || body_md));

INSERT INTO learner (id, display_name) VALUES (1, 'Yassin');
