import path from 'node:path';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import { pool } from './db';
import { runPhasedReview, type ReviewSkillDefinition } from './review-runner';

type ReviewStatus = 'pending' | 'running' | 'done' | 'failed';
type Recommendation = 'apto' | 'no_apto' | 'pendiente';

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
    `SELECT id, candidate_name, github_url, status, scores, final_report, recommendation, created_at, updated_at, started_at, finished_at
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
    `SELECT id, candidate_name, github_url, status, scores, final_report, recommendation, created_at, updated_at, started_at, finished_at
     FROM reviews
     WHERE id = $1`,
    [id]
  );

  if (result.rowCount === 0) {
    return reply.code(404).send({ error: 'revisión no encontrada' });
  }

  return reply.send(result.rows[0]);
});

app.post<{ Body: { candidateName?: string; githubUrl?: string } }>('/api/reviews', async (request, reply) => {
  const candidateName = request.body?.candidateName?.trim();
  const githubUrl = request.body?.githubUrl?.trim();

  if (!candidateName || !githubUrl) {
    return reply.code(400).send({ error: 'candidateName y githubUrl son obligatorios' });
  }

  const result = await pool.query(
    `INSERT INTO reviews (candidate_name, github_url)
     VALUES ($1, $2)
     RETURNING id, candidate_name, github_url, status, scores, final_report, recommendation, created_at, updated_at, started_at, finished_at`,
    [candidateName, githubUrl]
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

  if (status && !['pending', 'running', 'done', 'failed'].includes(status)) {
    return reply.code(400).send({ error: 'status inválido' });
  }

  if (recommendation && !['apto', 'no_apto', 'pendiente'].includes(recommendation)) {
    return reply.code(400).send({ error: 'recommendation inválido' });
  }

  const result = await pool.query(
    `UPDATE reviews
     SET
       status = COALESCE($2, status),
       scores = COALESCE($3::jsonb, scores),
       final_report = COALESCE($4, final_report),
       recommendation = COALESCE($5, recommendation),
       started_at = CASE
         WHEN status <> 'running' AND COALESCE($2, status) = 'running' THEN NOW()
         ELSE started_at
       END,
       finished_at = CASE
         WHEN COALESCE($2, status) IN ('done', 'failed') THEN NOW()
         ELSE finished_at
       END
     WHERE id = $1
     RETURNING id, candidate_name, github_url, status, scores, final_report, recommendation, created_at, updated_at, started_at, finished_at`,
    [id, status ?? null, scores ? JSON.stringify(scores) : null, finalReport, recommendation ?? null]
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
