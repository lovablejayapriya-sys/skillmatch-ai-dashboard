CREATE TYPE public.job_level AS ENUM ('Junior', 'Mid', 'Senior', 'Lead');
CREATE TYPE public.candidate_status AS ENUM ('pending', 'processing', 'analyzed', 'shortlisted', 'rejected', 'failed');

CREATE TABLE public.job_descriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  company text NOT NULL,
  raw_text text NOT NULL,
  required_skills text[] NOT NULL DEFAULT '{}',
  preferred_skills text[] NOT NULL DEFAULT '{}',
  min_experience_years numeric(4,1),
  max_experience_years numeric(4,1),
  education_requirement text,
  role_summary text,
  job_level public.job_level NOT NULL DEFAULT 'Mid',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.job_descriptions TO service_role;
ALTER TABLE public.job_descriptions ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_description_id uuid NOT NULL REFERENCES public.job_descriptions(id) ON DELETE CASCADE,
  full_name text,
  email text,
  phone text,
  file_name text NOT NULL,
  file_path text NOT NULL,
  raw_text text,
  parsed_skills text[] NOT NULL DEFAULT '{}',
  parsed_education jsonb NOT NULL DEFAULT '[]'::jsonb,
  parsed_experience jsonb NOT NULL DEFAULT '[]'::jsonb,
  total_experience_years numeric(4,1),
  "current_role" text,
  current_company text,
  status public.candidate_status NOT NULL DEFAULT 'pending',
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  analyzed_at timestamptz
);
GRANT ALL ON public.candidates TO service_role;
ALTER TABLE public.candidates ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.match_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  job_description_id uuid NOT NULL REFERENCES public.job_descriptions(id) ON DELETE CASCADE,
  overall_score numeric(5,2) NOT NULL DEFAULT 0,
  keyword_score numeric(5,2) NOT NULL DEFAULT 0,
  semantic_score numeric(5,2) NOT NULL DEFAULT 0,
  matched_skills text[] NOT NULL DEFAULT '{}',
  missing_skills text[] NOT NULL DEFAULT '{}',
  bonus_skills text[] NOT NULL DEFAULT '{}',
  ai_summary text,
  strengths text[] NOT NULL DEFAULT '{}',
  concerns text[] NOT NULL DEFAULT '{}',
  rank integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (candidate_id, job_description_id)
);
GRANT ALL ON public.match_results TO service_role;
ALTER TABLE public.match_results ENABLE ROW LEVEL SECURITY;

CREATE INDEX candidates_job_created_idx ON public.candidates (job_description_id, created_at DESC);
CREATE INDEX candidates_job_status_idx ON public.candidates (job_description_id, status);
CREATE INDEX match_results_job_score_idx ON public.match_results (job_description_id, overall_score DESC);
CREATE INDEX match_results_candidate_idx ON public.match_results (candidate_id);

CREATE OR REPLACE FUNCTION public.validate_match_scores()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.overall_score < 0 OR NEW.overall_score > 100
     OR NEW.keyword_score < 0 OR NEW.keyword_score > 100
     OR NEW.semantic_score < 0 OR NEW.semantic_score > 100 THEN
    RAISE EXCEPTION 'Match scores must be between 0 and 100';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER validate_match_scores_before_write
BEFORE INSERT OR UPDATE ON public.match_results
FOR EACH ROW EXECUTE FUNCTION public.validate_match_scores();