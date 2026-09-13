# SkillMatch AI implementation plan

## Goal
Build a polished public resume-screening workspace inspired by the uploaded logo’s plum, orange, and warm ivory palette. The experience will be a decision-support tool and keep active workflow state in the current browser session.

## Experience
- Replace the placeholder page with the complete flow: opening screen, job-description entry, parsed requirements, resume upload/progress, ranked dashboard, and candidate detail drawer.
- Use a distinctive recruiter workspace rather than a generic landing page: compact navigation, clear stage indicator, editorial typography, data-dense ranking views, and restrained logo-inspired motion.
- Provide desktop table and mobile card presentations, search with 300ms debounce, sorting, score filtering, score rings, accordions, status actions, retry states, and accessible keyboard/focus behavior.
- Include the three supplied candidate examples as a ready-to-explore demo path while supporting real PDF/DOCX uploads.

## Data and AI
- Add the three requested public tables with explicit grants, RLS policies, indexes, enums, and rank-safe relationships.
- Create the `resumes` storage bucket with a 5MB file limit and PDF/DOCX policies.
- Keep AI calls and parsing server-side using TanStack server functions, the supported backend pattern for this project. The functions will cover job parsing, document text extraction, resume parsing, match analysis, weighted scoring, and reranking.
- Use Groq’s `llama-3.3-70b-versatile` as requested. A securely stored `GROQ_API_KEY` will be required before live AI analysis can run.
- Validate every request and structured AI response, preserve clear errors, and avoid automatic rejection decisions.

## Visual system
- Define all colors as semantic OKLCH tokens derived from the logo: deep plum, vivid orange, warm ivory, emerald, amber, rose, and blue match states.
- Use a refined display/body font pair, compact 6px corners, subtle borders, warm surfaces, and high-contrast typography.
- Add the requested transitions with reduced-motion support: staggered reveal, file-state changes, score fills/count-ups, drawer motion, accordion motion, and restrained button feedback.

## Verification
- Verify the responsive experience at 320px, tablet, and 1440px desktop widths.
- Exercise the complete demo flow, validation states, sorting/filtering/search, drawer interactions, shortlist/reject toggles, and upload errors.
- Test the real Groq request and database/storage path once the required key is configured.
