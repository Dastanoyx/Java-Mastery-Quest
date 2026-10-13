-- Unanswered exam questions get their own mistake category instead of being labelled a "knowledge gap":
-- a blank answer is evidence of a timing/strategy problem, not of what the learner knows.
ALTER TABLE mistake_record DROP CONSTRAINT IF EXISTS mistake_record_category_check;
ALTER TABLE mistake_record ADD CONSTRAINT mistake_record_category_check CHECK (category IN (
  'knowledge_gap','misread','rule_confusion','output_prediction','compile_vs_runtime','time_pressure','careless',
  'repeated_misconception','unanswered'));
