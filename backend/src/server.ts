import path from 'node:path';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import { pool } from './db';
import { runAutomatedReview } from './review-runner';

type ReviewStatus = 'pending' | 'running' | 'done' | 'failed';
type Recommendation = 'apto' | 'no_apto' | 'pendiente';

async function executeReviewJob(id: number, githubUrl: string): Promise<void> {
  try {
    const result = await runAutomatedReview(githubUrl);
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

  void executeReviewJob(id, review.github_url);

  return reply.code(202).send({ ok: true, id, status: 'running' });
});

async function start() {
  try {
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
