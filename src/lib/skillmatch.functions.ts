import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const model = "llama-3.3-70b-versatile";
const levelSchema = z.enum(["Junior", "Mid", "Senior", "Lead"]);

const jdResultSchema = z.object({
  title: z.string(),
  company: z.string(),
  required_skills: z.array(z.string()),
  preferred_skills: z.array(z.string()),
  min_experience_years: z.number().nullable(),
  max_experience_years: z.number().nullable(),
  education_requirement: z.string().nullable(),
  role_summary: z.string(),
  job_level: levelSchema,
});

const resumeResultSchema = z.object({
  full_name: z.string(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  current_role: z.string().nullable(),
  current_company: z.string().nullable(),
  skills: z.array(z.string()),
  education: z.array(z.object({ institution: z.string(), degree: z.string(), year: z.string().nullable() })),
  experience: z.array(z.object({ company: z.string(), role: z.string(), duration: z.string(), description: z.string() })),
  total_experience_years: z.number(),
});

const matchResultSchema = z.object({
  matched_skills: z.array(z.string()),
  missing_skills: z.array(z.string()),
  bonus_skills: z.array(z.string()),
  contextual_fit_score: z.number().min(0).max(100),
  ai_summary: z.string(),
  strengths: z.array(z.string()).max(2),
  concerns: z.array(z.string()).max(2),
});

async function askGroq<T>(prompt: string, schema: z.ZodType<T>): Promise<T> {
  const apiKey = process.env["GROQ_API_KEY"];
  if (!apiKey) throw new Error("Groq is not configured. Add GROQ_API_KEY to continue.");

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "You are a precise recruitment analyst. Return only valid JSON matching the requested shape. Never make a hiring decision." },
        { role: "user", content: prompt },
      ],
    }),
  });
  const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }>; error?: { message?: string } };
  if (!response.ok) throw new Error(payload.error?.message ?? "Groq could not complete the analysis.");
  const content = payload.choices?.[0]?.message?.content;
  if (!content) throw new Error("Groq returned an empty analysis.");
  return schema.parse(JSON.parse(content));
}

export const parseJobDescription = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ rawText: z.string().min(200).max(5000) }).parse(input))
  .handler(async ({ data }) => {
    const parsed = await askGroq(
      `Extract this job description into JSON with: title, company, required_skills, preferred_skills, min_experience_years, max_experience_years, education_requirement, role_summary (2-3 sentences), job_level (Junior, Mid, Senior, or Lead).\n\n${data.rawText}`,
      jdResultSchema,
    );
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: job, error } = await supabaseAdmin.from("job_descriptions").insert({ ...parsed, raw_text: data.rawText }).select().single();
    if (error) throw new Error(error.message);
    return job;
  });

const uploadSchema = z.object({ jobId: z.string().uuid(), fileName: z.string(), mimeType: z.string(), base64: z.string() });

export const processResume = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => uploadSchema.parse(input))
  .handler(async ({ data }) => {
    const bytes = Uint8Array.from(atob(data.base64), (char) => char.charCodeAt(0));
    if (bytes.byteLength > 5 * 1024 * 1024) throw new Error("Resume exceeds the 5MB limit.");
    const normalizedName = data.fileName.replace(/[^a-zA-Z0-9._-]/g, "-");
    const filePath = `${data.jobId}/${crypto.randomUUID()}-${normalizedName}`;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: uploadError } = await supabaseAdmin.storage.from("resumes").upload(filePath, bytes, { contentType: data.mimeType, upsert: false });
    if (uploadError) throw new Error(uploadError.message);

    const extension = data.fileName.toLowerCase().split(".").pop();
    let rawText = "";
    if (extension === "pdf") {
      const { extractText, getDocumentProxy } = await import("unpdf");
      const pdf = await getDocumentProxy(bytes);
      const result = await extractText(pdf, { mergePages: true });
      rawText = result.text;
    } else if (extension === "docx") {
      const mammoth = await import("mammoth");
      const result = await mammoth.extractRawText({ arrayBuffer: bytes.buffer });
      rawText = result.value;
    } else {
      throw new Error("Only PDF and DOCX files are supported.");
    }
    rawText = rawText.replace(/\s+/g, " ").trim();
    if (!rawText) throw new Error("No readable text was found in this resume.");

    const { data: candidate, error: createError } = await supabaseAdmin.from("candidates").insert({ job_description_id: data.jobId, file_name: data.fileName, file_path: filePath, raw_text: rawText, status: "processing" }).select().single();
    if (createError) throw new Error(createError.message);

    try {
      const parsed = await askGroq(
        `Parse this resume into JSON with: full_name, email, phone, current_role, current_company, skills, education (institution, degree, year), experience (company, role, duration, description), total_experience_years.\n\n${rawText}`,
        resumeResultSchema,
      );
      const { data: job, error: jobError } = await supabaseAdmin.from("job_descriptions").select("*").eq("id", data.jobId).single();
      if (jobError) throw new Error(jobError.message);
      const match = await askGroq(
        `Analyze this candidate against the job. Return JSON with matched_skills, missing_skills, bonus_skills, contextual_fit_score (0-100), ai_summary (2-3 sentences), strengths (1-2 points), concerns (1-2 points). Candidate: ${JSON.stringify(parsed)} Job: ${JSON.stringify(job)}`,
        matchResultSchema,
      );
      const normalized = new Set(parsed.skills.map((skill) => skill.toLowerCase()));
      const keywordScore = job.required_skills.length ? Math.round((job.required_skills.filter((skill) => normalized.has(skill.toLowerCase())).length / job.required_skills.length) * 100) : 100;
      const overallScore = Math.round((0.4 * keywordScore + 0.6 * match.contextual_fit_score) * 100) / 100;
      const { error: updateError } = await supabaseAdmin.from("candidates").update({ full_name: parsed.full_name, email: parsed.email, phone: parsed.phone, current_role: parsed.current_role, current_company: parsed.current_company, parsed_skills: parsed.skills, parsed_education: parsed.education, parsed_experience: parsed.experience, total_experience_years: parsed.total_experience_years, status: "analyzed", analyzed_at: new Date().toISOString() }).eq("id", candidate.id);
      if (updateError) throw new Error(updateError.message);
      const { data: result, error: matchError } = await supabaseAdmin.from("match_results").insert({ candidate_id: candidate.id, job_description_id: data.jobId, overall_score: overallScore, keyword_score: keywordScore, semantic_score: match.contextual_fit_score, matched_skills: match.matched_skills, missing_skills: match.missing_skills, bonus_skills: match.bonus_skills, ai_summary: match.ai_summary, strengths: match.strengths, concerns: match.concerns }).select().single();
      if (matchError) throw new Error(matchError.message);
      const { data: ranked } = await supabaseAdmin.from("match_results").select("id").eq("job_description_id", data.jobId).order("overall_score", { ascending: false });
      await Promise.all((ranked ?? []).map((row, index) => supabaseAdmin.from("match_results").update({ rank: index + 1 }).eq("id", row.id)));
      return { candidate: parsed, match: { ...result, rank: (ranked ?? []).findIndex((row) => row.id === result.id) + 1 } };
    } catch (error) {
      await supabaseAdmin.from("candidates").update({ status: "failed", error_message: error instanceof Error ? error.message : "Analysis failed" }).eq("id", candidate.id);
      throw error;
    }
  });

export const updateCandidateStatus = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ candidateId: z.string().uuid(), status: z.enum(["analyzed", "shortlisted", "rejected"]) }).parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("candidates").update({ status: data.status }).eq("id", data.candidateId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });