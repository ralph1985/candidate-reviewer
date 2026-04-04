import path from 'node:path';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import { pool } from './db';
import { runPhasedReview, type ReviewSkillDefinition } from './review-runner';

type ReviewStatus = 'pending' | 'running' | 'done' | 'failed';
type Recommendation = 'apto' | 'no_apto' | 'pendiente';
type ReviewIntakeBody = {
  candidateName?: string;
  githubUrl?: string;
  deployUrl?: string;
  exerciseName?: string;
  reviewerName?: string;
  reviewerEmail?: string;
  reviewedAt?: string;
  intakeConclusions?: string;
  predefinedQuestions?: string[];
  intakeOtherQuestions?: string;
  intakeGoodPractices?: string;
  intakeDesignPatterns?: string;
};

type HistoricalImportPayload = {
  metadata?: {
    evaluador?: string;
    email?: string;
    fecha?: string;
  };
  candidato?: {
    nombre?: string;
    repositorio?: string;
    deploy?: string;
    ejercicio?: string;
  };
  evaluacion?: Record<
    string,
    {
      puntuacion?: number;
      [key: string]: unknown;
    }
  >;
  conclusion?: {
    entrevista?: boolean;
    comentarios?: unknown;
  };
  preguntas_predefinidas?: unknown;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function parseLegacyDate(raw: string | undefined): Date | null {
  if (!raw) return null;
  const normalized = raw.includes('T') ? raw : raw.replace(' ', 'T');
  const withSeconds = normalized.length === 16 ? `${normalized}:00` : normalized;
  const withTimezone = /[zZ]|[+-]\d{2}:\d{2}$/.test(withSeconds) ? withSeconds : `${withSeconds}Z`;
  const date = new Date(withTimezone);
  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeRecommendation(interview: boolean | undefined): Recommendation {
  if (typeof interview !== 'boolean') return 'pendiente';
  return interview ? 'apto' : 'no_apto';
}

function normalizeStringArray(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((item) => String(item ?? '').trim())
    .filter((item) => item.length > 0);
}

function buildConclusionReport(comments: string[]): string | null {
  if (comments.length === 0) return null;
  return ['## Conclusión', '', ...comments.map((comment) => `- ${comment}`)].join('\n');
}

function buildPhaseSummary(phase: Record<string, unknown>): string {
  const comments = normalizeStringArray(phase.comentarios);
  const oks = normalizeStringArray(phase.oks);
  const kos = normalizeStringArray(phase.kos);
  const bonus = normalizeStringArray(phase.bonus);
  const summaryParts: string[] = [];
  if (comments.length > 0) summaryParts.push(`Comentarios: ${comments.slice(0, 2).join(' | ')}`);
  if (oks.length > 0) summaryParts.push(`OKs: ${oks.slice(0, 2).join(' | ')}`);
  if (kos.length > 0) summaryParts.push(`KOs: ${kos.slice(0, 2).join(' | ')}`);
  if (bonus.length > 0) summaryParts.push(`Bonus: ${bonus.slice(0, 2).join(' | ')}`);
  return summaryParts.join(' || ') || 'Fase importada desde evaluación histórica';
}

function sanitizePhaseKey(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64) || 'fase';
}

function normalizeText(value: unknown): string | null {
  const text = String(value ?? '').trim();
  return text.length > 0 ? text : null;
}

const REVIEW_SELECT_COLUMNS = `
  id,
  candidate_name,
  github_url,
  candidate_deploy_url,
  exercise_name,
  reviewer_name,
  reviewer_email,
  reviewed_at,
  intake_conclusions,
  intake_other_questions,
  intake_good_practices,
  intake_design_patterns,
  interview_recommended,
  predefined_questions,
  import_source,
  status,
  scores,
  final_report,
  recommendation,
  created_at,
  updated_at,
  started_at,
  finished_at
`;

async function upsertPhaseResult(
  reviewId: number,
  phase: {
    phaseKey: string;
    status: 'done' | 'failed';
    score: number | null;
    summary: string;
    details: Record<string, unknown>;
    rawOutput: string | null;
    startedAt: Date;
    finishedAt: Date;
  }
): Promise<void> {
  await pool.query(
    `INSERT INTO review_phase_results
      (review_id, phase_key, status, score, summary, details, raw_output, started_at, finished_at)
     VALUES
      ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9)
     ON CONFLICT (review_id, phase_key)
     DO UPDATE SET
      status = EXCLUDED.status,
      score = EXCLUDED.score,
      summary = EXCLUDED.summary,
      details = EXCLUDED.details,
      raw_output = EXCLUDED.raw_output,
      started_at = EXCLUDED.started_at,
      finished_at = EXCLUDED.finished_at`,
    [
      reviewId,
      phase.phaseKey,
      phase.status,
      phase.score,
      phase.summary,
      JSON.stringify(phase.details),
      phase.rawOutput,
      phase.startedAt,
      phase.finishedAt
    ]
  );
}

async function loadActiveSkills(): Promise<ReviewSkillDefinition[]> {
  const result = await pool.query(
    `SELECT key, name, prompt_template
     FROM review_skills
     WHERE active = true
     ORDER BY sort_order ASC, id ASC`
  );

  return result.rows.map((row) => ({
    key: String(row.key),
    name: String(row.name),
    promptTemplate: String(row.prompt_template)
  }));
}

async function executeReviewJob(id: number, githubUrl: string): Promise<void> {
  try {
    const skills = await loadActiveSkills();
    const result = await runPhasedReview(
      githubUrl,
      skills,
      async (phase) => {
        await upsertPhaseResult(id, phase);
      },
      { reviewId: id }
    );

    await pool.query(
      `UPDATE reviews
       SET status = 'done',
           scores = $2::jsonb,
           final_report = $3,
           recommendation = $4,
           finished_at = NOW()
       WHERE id = $1`,
      [id, JSON.stringify(result.scores), result.finalReport, result.recommendation]
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error inesperado ejecutando revisión automática';
    await pool.query(
      `UPDATE reviews
       SET status = 'failed',
           final_report = $2,
           recommendation = 'pendiente',
           finished_at = NOW()
       WHERE id = $1`,
      [id, `Error en revisión automática: ${message}`]
    );
  }
}

const app = Fastify({ logger: true });
const port = Number(process.env.PORT || 3000);
const staticDir = process.env.STATIC_DIR || path.resolve(process.cwd(), 'frontend-dist');

app.register(cors, { origin: true });
app.register(fastifyStatic, {
  root: staticDir,
  prefix: '/'
});
app.register(fastifyStatic, {
  root: staticDir,
  prefix: '/cr/',
  decorateReply: false
});

app.get('/health', async () => ({ ok: true }));

app.get('/api/reviews', async (_, reply) => {
  const result = await pool.query(
    `SELECT ${REVIEW_SELECT_COLUMNS}
     FROM reviews
     ORDER BY created_at DESC
     LIMIT 200`
  );
  return reply.send(result.rows);
});

app.get('/api/skills', async (_, reply) => {
  const result = await pool.query(
    `SELECT id, key, name, description, prompt_template, active, sort_order, created_at, updated_at
     FROM review_skills
     ORDER BY sort_order ASC, id ASC`
  );
  return reply.send(result.rows);
});

app.post<{
  Body: {
    key?: string;
    name?: string;
    description?: string;
    promptTemplate?: string;
    active?: boolean;
    sortOrder?: number;
  };
}>('/api/skills', async (request, reply) => {
  const key = request.body?.key?.trim();
  const name = request.body?.name?.trim();
  const description = request.body?.description?.trim() || null;
  const promptTemplate = request.body?.promptTemplate?.trim();
  const active = request.body?.active ?? true;
  const sortOrder = Number.isInteger(request.body?.sortOrder) ? Number(request.body?.sortOrder) : 100;

  if (!key || !/^[a-z0-9_-]+$/i.test(key)) {
    return reply.code(400).send({ error: 'key inválida (usa letras, números, _ o -)' });
  }
  if (!name) {
    return reply.code(400).send({ error: 'name es obligatorio' });
  }
  if (!promptTemplate) {
    return reply.code(400).send({ error: 'promptTemplate es obligatorio' });
  }

  const result = await pool.query(
    `INSERT INTO review_skills (key, name, description, prompt_template, active, sort_order)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, key, name, description, prompt_template, active, sort_order, created_at, updated_at`,
    [key, name, description, promptTemplate, active, sortOrder]
  );

  return reply.code(201).send(result.rows[0]);
});

app.patch<{
  Params: { id: string };
  Body: {
    key?: string;
    name?: string;
    description?: string;
    promptTemplate?: string;
    active?: boolean;
    sortOrder?: number;
  };
}>('/api/skills/:id', async (request, reply) => {
  const id = Number(request.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return reply.code(400).send({ error: 'id inválido' });
  }

  const key = request.body?.key?.trim();
  const name = request.body?.name?.trim();
  const description = request.body?.description?.trim();
  const promptTemplate = request.body?.promptTemplate?.trim();
  const active = typeof request.body?.active === 'boolean' ? request.body.active : null;
  const sortOrder = Number.isInteger(request.body?.sortOrder) ? Number(request.body?.sortOrder) : null;

  if (key && !/^[a-z0-9_-]+$/i.test(key)) {
    return reply.code(400).send({ error: 'key inválida (usa letras, números, _ o -)' });
  }

  const result = await pool.query(
    `UPDATE review_skills
     SET
       key = COALESCE($2, key),
       name = COALESCE($3, name),
       description = COALESCE($4, description),
       prompt_template = COALESCE($5, prompt_template),
       active = COALESCE($6, active),
       sort_order = COALESCE($7, sort_order)
     WHERE id = $1
     RETURNING id, key, name, description, prompt_template, active, sort_order, created_at, updated_at`,
    [id, key ?? null, name ?? null, description ?? null, promptTemplate ?? null, active, sortOrder]
  );

  if (result.rowCount === 0) {
    return reply.code(404).send({ error: 'skill no encontrada' });
  }

  return reply.send(result.rows[0]);
});

app.get<{ Params: { id: string } }>('/api/reviews/:id', async (request, reply) => {
  const id = Number(request.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return reply.code(400).send({ error: 'id inválido' });
  }

  const result = await pool.query(
    `SELECT ${REVIEW_SELECT_COLUMNS}
     FROM reviews
     WHERE id = $1`,
    [id]
  );

  if (result.rowCount === 0) {
    return reply.code(404).send({ error: 'revisión no encontrada' });
  }

  return reply.send(result.rows[0]);
});

app.post<{ Body: ReviewIntakeBody }>('/api/reviews', async (request, reply) => {
  const candidateName = normalizeText(request.body?.candidateName);
  const githubUrl = normalizeText(request.body?.githubUrl);
  const deployUrl = normalizeText(request.body?.deployUrl);
  const exerciseName = normalizeText(request.body?.exerciseName);
  const reviewerName = normalizeText(request.body?.reviewerName);
  const reviewerEmail = normalizeText(request.body?.reviewerEmail);
  const reviewedAt = parseLegacyDate(normalizeText(request.body?.reviewedAt) ?? undefined);
  const intakeConclusions = normalizeText(request.body?.intakeConclusions);
  const predefinedQuestions = normalizeStringArray(request.body?.predefinedQuestions);
  const intakeOtherQuestions = normalizeText(request.body?.intakeOtherQuestions);
  const intakeGoodPractices = normalizeText(request.body?.intakeGoodPractices);
  const intakeDesignPatterns = normalizeText(request.body?.intakeDesignPatterns);

  if (!candidateName || !githubUrl) {
    return reply.code(400).send({ error: 'candidateName y githubUrl son obligatorios' });
  }

  const result = await pool.query(
    `INSERT INTO reviews
      (
        candidate_name,
        github_url,
        candidate_deploy_url,
        exercise_name,
        reviewer_name,
        reviewer_email,
        reviewed_at,
        intake_conclusions,
        predefined_questions,
        intake_other_questions,
        intake_good_practices,
        intake_design_patterns,
        interview_recommended
      )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11, $12, NULL)
     RETURNING ${REVIEW_SELECT_COLUMNS}`,
    [
      candidateName,
      githubUrl,
      deployUrl,
      exerciseName,
      reviewerName,
      reviewerEmail,
      reviewedAt,
      intakeConclusions,
      JSON.stringify(predefinedQuestions),
      intakeOtherQuestions,
      intakeGoodPractices,
      intakeDesignPatterns
    ]
  );

  return reply.code(201).send(result.rows[0]);
});

app.patch<{
  Params: { id: string };
  Body: {
    status?: ReviewStatus;
    scores?: Record<string, unknown> | null;
    finalReport?: string;
    recommendation?: Recommendation;
    candidateName?: string;
    githubUrl?: string;
    deployUrl?: string;
    exerciseName?: string;
    reviewerName?: string;
    reviewerEmail?: string;
    reviewedAt?: string;
    intakeConclusions?: string;
    predefinedQuestions?: string[];
    intakeOtherQuestions?: string;
    intakeGoodPractices?: string;
    intakeDesignPatterns?: string;
  };
}>('/api/reviews/:id', async (request, reply) => {
  const id = Number(request.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return reply.code(400).send({ error: 'id inválido' });
  }

  const status = request.body.status;
  const scores = request.body.scores ?? null;
  const finalReport = request.body.finalReport ?? null;
  const recommendation = request.body.recommendation;
  const candidateName = normalizeText(request.body?.candidateName);
  const githubUrl = normalizeText(request.body?.githubUrl);
  const deployUrl = normalizeText(request.body?.deployUrl);
  const exerciseName = normalizeText(request.body?.exerciseName);
  const reviewerName = normalizeText(request.body?.reviewerName);
  const reviewerEmail = normalizeText(request.body?.reviewerEmail);
  const reviewedAtRaw = normalizeText(request.body?.reviewedAt);
  const reviewedAt = reviewedAtRaw ? parseLegacyDate(reviewedAtRaw) : null;
  const intakeConclusions = normalizeText(request.body?.intakeConclusions);
  const intakeOtherQuestions = normalizeText(request.body?.intakeOtherQuestions);
  const intakeGoodPractices = normalizeText(request.body?.intakeGoodPractices);
  const intakeDesignPatterns = normalizeText(request.body?.intakeDesignPatterns);
  const hasPredefinedQuestions = Array.isArray(request.body?.predefinedQuestions);
  const predefinedQuestions = hasPredefinedQuestions ? normalizeStringArray(request.body?.predefinedQuestions) : null;

  if (status && !['pending', 'running', 'done', 'failed'].includes(status)) {
    return reply.code(400).send({ error: 'status inválido' });
  }

  if (recommendation && !['apto', 'no_apto', 'pendiente'].includes(recommendation)) {
    return reply.code(400).send({ error: 'recommendation inválido' });
  }
  if (reviewedAtRaw && !reviewedAt) {
    return reply.code(400).send({ error: 'reviewedAt inválido' });
  }

  const result = await pool.query(
    `UPDATE reviews
     SET
       candidate_name = COALESCE($2, candidate_name),
       github_url = COALESCE($3, github_url),
       candidate_deploy_url = COALESCE($4, candidate_deploy_url),
       exercise_name = COALESCE($5, exercise_name),
       reviewer_name = COALESCE($6, reviewer_name),
       reviewer_email = COALESCE($7, reviewer_email),
       reviewed_at = COALESCE($8::timestamptz, reviewed_at),
       intake_conclusions = COALESCE($9, intake_conclusions),
       predefined_questions = COALESCE($10::jsonb, predefined_questions),
       intake_other_questions = COALESCE($11, intake_other_questions),
       intake_good_practices = COALESCE($12, intake_good_practices),
       intake_design_patterns = COALESCE($13, intake_design_patterns),
       status = COALESCE($17, status),
       scores = COALESCE($14::jsonb, scores),
       final_report = COALESCE($15, final_report),
       recommendation = COALESCE($16, recommendation),
       started_at = CASE
         WHEN status <> 'running' AND COALESCE($17, status) = 'running' THEN NOW()
         ELSE started_at
       END,
       finished_at = CASE
         WHEN COALESCE($17, status) IN ('done', 'failed') THEN NOW()
         ELSE finished_at
       END
     WHERE id = $1
     RETURNING ${REVIEW_SELECT_COLUMNS}`,
    [
      id,
      candidateName,
      githubUrl,
      deployUrl,
      exerciseName,
      reviewerName,
      reviewerEmail,
      reviewedAt,
      intakeConclusions,
      hasPredefinedQuestions ? JSON.stringify(predefinedQuestions) : null,
      intakeOtherQuestions,
      intakeGoodPractices,
      intakeDesignPatterns,
      scores ? JSON.stringify(scores) : null,
      finalReport,
      recommendation ?? null,
      status ?? null
    ]
  );

  if (result.rowCount === 0) {
    return reply.code(404).send({ error: 'revisión no encontrada' });
  }

  return reply.send(result.rows[0]);
});

app.get<{ Params: { id: string } }>('/api/reviews/:id/phases', async (request, reply) => {
  const id = Number(request.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return reply.code(400).send({ error: 'id inválido' });
  }

  const result = await pool.query(
    `SELECT id, review_id, phase_key, status, score, summary, details, raw_output, started_at, finished_at, created_at, updated_at
     FROM review_phase_results
     WHERE review_id = $1
     ORDER BY created_at ASC`,
    [id]
  );

  return reply.send(result.rows);
});

app.post<{ Body: HistoricalImportPayload }>('/api/imports/historical-review', async (request, reply) => {
  const payload = request.body;
  const candidateName = payload?.candidato?.nombre?.trim();
  const githubUrl = payload?.candidato?.repositorio?.trim();

  if (!candidateName || !githubUrl) {
    return reply.code(400).send({ error: 'candidato.nombre y candidato.repositorio son obligatorios' });
  }

  const evaluationEntries = isObject(payload?.evaluacion) ? Object.entries(payload.evaluacion) : [];
  const reviewedAt = parseLegacyDate(payload?.metadata?.fecha);
  const recommendation = normalizeRecommendation(payload?.conclusion?.entrevista);
  const conclusionComments = normalizeStringArray(payload?.conclusion?.comentarios);
  const finalReport = buildConclusionReport(conclusionComments);

  const phaseScores = evaluationEntries
    .map(([, value]) => Number(value?.puntuacion))
    .filter((score) => Number.isFinite(score));
  const avgScore = phaseScores.length > 0
    ? Number((phaseScores.reduce((acc, score) => acc + score, 0) / phaseScores.length).toFixed(2))
    : null;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const reviewInsert = await client.query(
      `INSERT INTO reviews
        (
          candidate_name,
          github_url,
          candidate_deploy_url,
          exercise_name,
          reviewer_name,
          reviewer_email,
          reviewed_at,
          interview_recommended,
          predefined_questions,
          import_source,
          status,
          scores,
          final_report,
          recommendation,
          started_at,
          finished_at
        )
       VALUES
        ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb, 'done', $11::jsonb, $12, $13, $14, $15)
       RETURNING id, candidate_name, github_url, candidate_deploy_url, exercise_name, reviewer_name, reviewer_email, reviewed_at, interview_recommended, predefined_questions, import_source, status, scores, final_report, recommendation, created_at, updated_at, started_at, finished_at`,
      [
        candidateName,
        githubUrl,
        payload?.candidato?.deploy?.trim() || null,
        payload?.candidato?.ejercicio?.trim() || null,
        payload?.metadata?.evaluador?.trim() || null,
        payload?.metadata?.email?.trim() || null,
        reviewedAt,
        typeof payload?.conclusion?.entrevista === 'boolean' ? payload.conclusion.entrevista : null,
        JSON.stringify(normalizeStringArray(payload?.preguntas_predefinidas)),
        JSON.stringify({
          kind: 'historical-json-manual',
          format: 'legacy-es-v1',
          importedAt: new Date().toISOString(),
          reviewerEmail: payload?.metadata?.email?.trim() || null
        }),
        JSON.stringify({
          promedio: avgScore,
          total_bloques: phaseScores.length
        }),
        finalReport,
        recommendation,
        reviewedAt,
        reviewedAt
      ]
    );

    const review = reviewInsert.rows[0] as { id: number };

    for (const [rawKey, rawPhase] of evaluationEntries) {
      const phase = isObject(rawPhase) ? rawPhase : {};
      const score = Number(phase.puntuacion);
      await client.query(
        `INSERT INTO review_phase_results
          (review_id, phase_key, status, score, summary, details, raw_output, started_at, finished_at)
         VALUES
          ($1, $2, 'done', $3, $4, $5::jsonb, NULL, $6, $7)`,
        [
          review.id,
          sanitizePhaseKey(rawKey),
          Number.isFinite(score) ? score : null,
          buildPhaseSummary(phase),
          JSON.stringify(phase),
          reviewedAt,
          reviewedAt
        ]
      );
    }

    await client.query('COMMIT');

    const phasesResult = await pool.query(
      `SELECT id, review_id, phase_key, status, score, summary, details, raw_output, started_at, finished_at, created_at, updated_at
       FROM review_phase_results
       WHERE review_id = $1
       ORDER BY created_at ASC`,
      [review.id]
    );

    return reply.code(201).send({
      review: reviewInsert.rows[0],
      phases: phasesResult.rows
    });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
});

app.post<{ Params: { id: string } }>('/api/reviews/:id/run', async (request, reply) => {
  const id = Number(request.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return reply.code(400).send({ error: 'id inválido' });
  }

  const found = await pool.query(`SELECT id, github_url, status FROM reviews WHERE id = $1`, [id]);
  if (found.rowCount === 0) {
    return reply.code(404).send({ error: 'revisión no encontrada' });
  }

  const review = found.rows[0] as { id: number; github_url: string; status: ReviewStatus };
  if (review.status === 'running') {
    return reply.code(409).send({ error: 'la revisión ya está en ejecución' });
  }

  await pool.query(
    `UPDATE reviews
     SET status = 'running',
         recommendation = 'pendiente',
         scores = NULL,
         final_report = 'Revisión en progreso...',
         started_at = NOW(),
         finished_at = NULL
     WHERE id = $1`,
    [id]
  );
  await pool.query(`DELETE FROM review_phase_results WHERE review_id = $1`, [id]);

  void executeReviewJob(id, review.github_url);

  return reply.code(202).send({ ok: true, id, status: 'running' });
});

async function recoverStaleRunningReviews(): Promise<void> {
  const result = await pool.query(
    `UPDATE reviews
     SET status = 'failed',
         final_report = 'Revisión interrumpida por reinicio del servicio. Vuelve a lanzar la ejecución.',
         recommendation = 'pendiente',
         finished_at = NOW()
     WHERE status = 'running'`
  );
  if (result.rowCount && result.rowCount > 0) {
    app.log.warn({ recovered: result.rowCount }, 'Revisiones en running recuperadas como failed');
  }
}

async function start() {
  try {
    await recoverStaleRunningReviews();
    await app.listen({ port, host: '0.0.0.0' });
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
}

process.on('SIGINT', async () => {
  await pool.end();
  await app.close();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await pool.end();
  await app.close();
  process.exit(0);
});

void start();
