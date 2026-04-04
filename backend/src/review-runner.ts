import { execFile } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

type Recommendation = 'apto' | 'no_apto';

type RepoMetrics = {
  totalFiles: number;
  sourceFiles: number;
  testFiles: number;
  hasReadme: boolean;
  hasDocsDir: boolean;
  hasLicense: boolean;
  hasCi: boolean;
  hasDocker: boolean;
  hasLockfile: boolean;
  hasSecurityDocs: boolean;
  hasTypeScript: boolean;
  hasLintConfig: boolean;
  hasSrcDir: boolean;
};

export type ReviewSkillDefinition = {
  key: string;
  name: string;
  promptTemplate: string;
};

type Scores = {
  promedio: number;
  [phaseKey: string]: number;
};

export type PhasedReviewResult = {
  phases: Array<{
    phaseKey: string;
    status: 'done' | 'failed';
    score: number | null;
    summary: string;
    details: Record<string, unknown>;
    rawOutput: string | null;
    startedAt: Date;
    finishedAt: Date;
  }>;
  scores: Scores;
  recommendation: Recommendation;
  finalReport: string;
};

const SOURCE_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.java', '.rb', '.php', '.rs', '.cs', '.cpp', '.c', '.h'
]);

const DEFAULT_SKILLS: ReviewSkillDefinition[] = [
  {
    key: 'architecture',
    name: 'Arquitectura',
    promptTemplate:
      'Analiza arquitectura del repositorio: estructura, modularidad, separación de responsabilidades, mantenibilidad y deuda técnica.'
  },
  {
    key: 'tests',
    name: 'Tests',
    promptTemplate:
      'Analiza calidad de testing: cobertura funcional, claridad de tests, estrategia de pruebas, casos límite y señales de fragilidad.'
  },
  {
    key: 'security',
    name: 'Seguridad',
    promptTemplate:
      'Analiza seguridad: manejo de secretos, validación de entradas, dependencias, hardening básico y riesgos potenciales.'
  },
  {
    key: 'documentation',
    name: 'Documentación',
    promptTemplate:
      'Analiza documentación: README, guías de ejecución, onboarding, claridad de decisiones técnicas y limitaciones conocidas.'
  }
];

function scoreClamp(value: number): number {
  return Math.max(0, Math.min(10, Math.round(value)));
}

function codexCliEnabled(): boolean {
  return process.env.CODEX_CLI_ENABLED === 'true';
}

function codexCliBin(): string {
  return process.env.CODEX_CLI_BIN || 'codex';
}

function codexCliArgs(): string[] {
  const raw = process.env.CODEX_CLI_ARGS;
  if (!raw) return ['exec'];
  return raw
    .split(' ')
    .map((arg) => arg.trim())
    .filter(Boolean);
}

function codexCliTimeoutMs(): number {
  const raw = Number(process.env.CODEX_CLI_TIMEOUT_MS || 15000);
  if (!Number.isFinite(raw) || raw <= 0) return 15000;
  return raw;
}

function isGithubUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return ['http:', 'https:'].includes(parsed.protocol) && parsed.hostname.includes('github.com');
  } catch {
    return false;
  }
}

async function collectFilesRecursive(basePath: string, dir = '', acc: string[] = []): Promise<string[]> {
  const absDir = path.join(basePath, dir);
  const entries = await readdir(absDir, { withFileTypes: true });

  for (const entry of entries) {
    const relPath = dir ? path.join(dir, entry.name) : entry.name;

    if (entry.isDirectory()) {
      if (entry.name === '.git' || entry.name === 'node_modules' || entry.name === '.next' || entry.name === 'dist') {
        continue;
      }
      await collectFilesRecursive(basePath, relPath, acc);
      continue;
    }

    if (entry.isFile()) {
      acc.push(relPath.replaceAll('\\', '/'));
    }
  }

  return acc;
}

function buildMetrics(files: string[]): RepoMetrics {
  const lowered = files.map((file) => file.toLowerCase());
  const sourceFiles = files.filter((file) => SOURCE_EXTENSIONS.has(path.extname(file).toLowerCase())).length;
  const testFiles = files.filter((file) => /(^|\/)(__tests__|tests)\//i.test(file) || /\.(test|spec)\.[a-z0-9]+$/i.test(file)).length;

  return {
    totalFiles: files.length,
    sourceFiles,
    testFiles,
    hasReadme: lowered.some((file) => file === 'readme.md' || file.endsWith('/readme.md')),
    hasDocsDir: lowered.some((file) => file.startsWith('docs/')),
    hasLicense: lowered.some((file) => file === 'license' || file === 'license.md'),
    hasCi: lowered.some((file) => file.startsWith('.github/workflows/') && (file.endsWith('.yml') || file.endsWith('.yaml'))),
    hasDocker: lowered.some((file) => file === 'dockerfile' || file.endsWith('/dockerfile') || file === 'docker-compose.yml' || file === 'docker-compose.yaml'),
    hasLockfile: lowered.some((file) => ['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'poetry.lock', 'cargo.lock', 'go.sum'].includes(file)),
    hasSecurityDocs: lowered.some((file) => file === 'security.md' || file === '.github/dependabot.yml' || file === '.github/dependabot.yaml'),
    hasTypeScript: lowered.some((file) => file.endsWith('.ts') || file.endsWith('.tsx') || file === 'tsconfig.json'),
    hasLintConfig: lowered.some((file) => ['.eslintrc', '.eslintrc.js', '.eslintrc.cjs', '.eslintrc.json', 'eslint.config.js', 'eslint.config.mjs'].includes(file)),
    hasSrcDir: lowered.some((file) => file.startsWith('src/'))
  };
}

function scoreArchitecture(metrics: RepoMetrics): number {
  let score = 4;
  if (metrics.hasSrcDir) score += 2;
  if (metrics.hasTypeScript) score += 1;
  if (metrics.hasLintConfig) score += 1;
  if (metrics.hasCi) score += 1;
  if (metrics.hasDocker) score += 1;
  if (metrics.sourceFiles > 50) score += 1;
  return scoreClamp(score);
}

function scoreTests(metrics: RepoMetrics): number {
  let score = 2;
  if (metrics.testFiles > 0) score += 3;
  if (metrics.testFiles >= 5) score += 2;
  if (metrics.hasCi) score += 1;
  if (metrics.totalFiles > 0 && metrics.testFiles / metrics.totalFiles >= 0.1) score += 1;
  return scoreClamp(score);
}

function scoreSecurity(metrics: RepoMetrics): number {
  let score = 3;
  if (metrics.hasLockfile) score += 2;
  if (metrics.hasCi) score += 1;
  if (metrics.hasSecurityDocs) score += 2;
  if (metrics.hasDocker) score += 1;
  return scoreClamp(score);
}

function scoreDocumentation(metrics: RepoMetrics): number {
  let score = 3;
  if (metrics.hasReadme) score += 3;
  if (metrics.hasDocsDir) score += 2;
  if (metrics.hasLicense) score += 1;
  return scoreClamp(score);
}

function heuristicScoreByPhase(phaseKey: string, metrics: RepoMetrics): number {
  if (phaseKey === 'architecture') return scoreArchitecture(metrics);
  if (phaseKey === 'tests') return scoreTests(metrics);
  if (phaseKey === 'security') return scoreSecurity(metrics);
  if (phaseKey === 'documentation') return scoreDocumentation(metrics);

  // Fase personalizada: media estructural simple.
  return scoreClamp((scoreArchitecture(metrics) + scoreTests(metrics) + scoreSecurity(metrics) + scoreDocumentation(metrics)) / 4);
}

function buildPhaseSummary(phaseKey: string, score: number, metrics: RepoMetrics): string {
  if (phaseKey === 'architecture') {
    return `Arquitectura ${score}/10. src=${metrics.hasSrcDir ? 'sí' : 'no'}, ts=${metrics.hasTypeScript ? 'sí' : 'no'}, ci=${metrics.hasCi ? 'sí' : 'no'}.`;
  }
  if (phaseKey === 'tests') {
    return `Tests ${score}/10. archivos_test=${metrics.testFiles}, ratio=${metrics.totalFiles ? (metrics.testFiles / metrics.totalFiles).toFixed(2) : '0.00'}.`;
  }
  if (phaseKey === 'security') {
    return `Seguridad ${score}/10. lockfile=${metrics.hasLockfile ? 'sí' : 'no'}, security_docs=${metrics.hasSecurityDocs ? 'sí' : 'no'}.`;
  }
  if (phaseKey === 'documentation') {
    return `Documentación ${score}/10. readme=${metrics.hasReadme ? 'sí' : 'no'}, docs_dir=${metrics.hasDocsDir ? 'sí' : 'no'}.`;
  }
  return `Fase ${phaseKey} ${score}/10 (fallback estructural).`;
}

function renderPromptTemplate(template: string, phaseKey: string, phaseName: string, metrics: RepoMetrics): string {
  const metricsJson = JSON.stringify(metrics);
  return template
    .replaceAll('{{phase_key}}', phaseKey)
    .replaceAll('{{phase_name}}', phaseName)
    .replaceAll('{{metrics_json}}', metricsJson);
}

function codexPrompt(skill: ReviewSkillDefinition, metrics: RepoMetrics): string {
  const custom = renderPromptTemplate(skill.promptTemplate, skill.key, skill.name, metrics);
  return [
    'Eres un revisor tecnico de pruebas de candidatos.',
    `Fase: "${skill.key}" (${skill.name}).`,
    custom,
    'Responde SOLO JSON valido sin markdown con este esquema exacto:',
    '{"score": <0-10>, "summary": "<texto corto>", "details": {"strengths": ["..."], "risks": ["..."], "notes": ["..."]}}',
    'Debes ser conciso y objetivo.',
    `Contexto metricas: ${JSON.stringify(metrics)}`
  ].join('\n');
}

function extractJsonPayload(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) return trimmed;

  const fenced = trimmed.match(/```json\s*([\s\S]*?)```/i);
  if (fenced?.[1]) return fenced[1].trim();

  const first = trimmed.indexOf('{');
  const last = trimmed.lastIndexOf('}');
  if (first >= 0 && last > first) return trimmed.slice(first, last + 1);
  return null;
}

function parseCodexResponse(output: string): { score: number; summary: string; details: Record<string, unknown> } {
  const payload = extractJsonPayload(output);
  if (!payload) {
    throw new Error('Codex CLI no devolvio JSON parseable');
  }
  const parsed = JSON.parse(payload) as { score?: unknown; summary?: unknown; details?: unknown };
  const score = scoreClamp(Number(parsed.score));
  const summary = typeof parsed.summary === 'string' ? parsed.summary : 'Sin resumen';
  const details =
    parsed.details && typeof parsed.details === 'object' && !Array.isArray(parsed.details)
      ? (parsed.details as Record<string, unknown>)
      : {};
  return { score, summary, details };
}

async function readFileIfExists(filePath: string): Promise<string | null> {
  try {
    return await readFile(filePath, 'utf8');
  } catch {
    return null;
  }
}

type CodexExecResult = {
  mergedOutput: string;
  schemaOutput: string | null;
  errorMessage: string | null;
};

async function runCodexExecWithSchema(repoPath: string, prompt: string): Promise<CodexExecResult> {
  const schemaPath = path.join(repoPath, '.candidate-review-schema.json');
  const outputPath = path.join(repoPath, '.candidate-review-output.json');

  const schema = {
    type: 'object',
    required: ['score', 'summary', 'details'],
    properties: {
      score: { type: 'number', minimum: 0, maximum: 10 },
      summary: { type: 'string', minLength: 1 },
      details: {
        type: 'object',
        properties: {
          strengths: { type: 'array', items: { type: 'string' } },
          risks: { type: 'array', items: { type: 'string' } },
          notes: { type: 'array', items: { type: 'string' } }
        },
        additionalProperties: true
      }
    },
    additionalProperties: false
  };

  await writeFile(schemaPath, JSON.stringify(schema), 'utf8');
  let stdout = '';
  let stderr = '';
  let errorMessage: string | null = null;

  try {
    const args = [...codexCliArgs()];
    if (!args.includes('--full-auto')) args.push('--full-auto');
    if (!args.includes('--skip-git-repo-check')) args.push('--skip-git-repo-check');
    args.push('--output-schema', schemaPath, '--output-last-message', outputPath, '--color', 'never', prompt);

    const execResult = await execFileAsync(codexCliBin(), args, {
      cwd: repoPath,
      timeout: codexCliTimeoutMs(),
      maxBuffer: 4 * 1024 * 1024,
      env: { ...process.env, CI: '1' }
    });
    stdout = execResult.stdout || '';
    stderr = execResult.stderr || '';
  } catch (error) {
    const typed = error as { stdout?: string; stderr?: string; message?: string };
    stdout = typed.stdout || '';
    stderr = typed.stderr || '';
    errorMessage = typed.message || 'Codex exec failed';
  } finally {
    await rm(schemaPath, { force: true });
  }

  const schemaOutput = await readFileIfExists(outputPath);
  await rm(outputPath, { force: true });

  const mergedOutput = [stdout, stderr].filter(Boolean).join('\n').trim();
  return { mergedOutput, schemaOutput, errorMessage };
}

async function runCodexPhase(
  skill: ReviewSkillDefinition,
  repoPath: string,
  metrics: RepoMetrics
): Promise<{ score: number; summary: string; details: Record<string, unknown>; rawOutput: string }> {
  const execResult = await runCodexExecWithSchema(repoPath, codexPrompt(skill, metrics));
  const raw = execResult.schemaOutput?.trim() || execResult.mergedOutput;
  if (!raw) {
    throw new Error(`Codex CLI fallo antes de JSON valido: ${execResult.errorMessage || 'sin salida util'}`);
  }
  const parsed = parseCodexResponse(raw);
  return { ...parsed, rawOutput: raw };
}

async function prepareRepository(githubUrl: string): Promise<{ tmpBase: string; repoPath: string; metrics: RepoMetrics }> {
  if (!isGithubUrl(githubUrl)) {
    throw new Error('La URL del repositorio debe ser de GitHub y usar http/https');
  }

  const tmpBase = await mkdtemp(path.join(os.tmpdir(), 'candidate-review-'));
  const repoPath = path.join(tmpBase, 'repo');

  await execFileAsync('git', ['clone', '--depth', '1', githubUrl, repoPath], {
    timeout: 180000,
    maxBuffer: 2 * 1024 * 1024
  });

  const repoStat = await stat(repoPath);
  if (!repoStat.isDirectory()) {
    throw new Error('No se pudo preparar el repositorio para revision');
  }

  const files = await collectFilesRecursive(repoPath);
  return { tmpBase, repoPath, metrics: buildMetrics(files) };
}

function buildFinalReport(phases: PhasedReviewResult['phases'], recommendation: Recommendation, promedio: number): string {
  const lines = ['Revisión automática por fases:'];
  for (const phase of phases) {
    lines.push(`- ${phase.phaseKey}: ${phase.score ?? '-'} / 10`);
  }
  lines.push(`- Promedio: ${promedio}/10`);
  lines.push(`- Recomendación: ${recommendation}.`);
  return lines.join('\n');
}

function computeScores(phases: PhasedReviewResult['phases']): Scores {
  const scores: Scores = { promedio: 0 };
  const numeric = phases.map((p) => p.score ?? 0);

  for (const phase of phases) {
    scores[phase.phaseKey] = phase.score ?? 0;
  }

  scores.promedio = numeric.length > 0 ? scoreClamp(numeric.reduce((acc, value) => acc + value, 0) / numeric.length) : 0;
  return scores;
}

function computeRecommendation(scores: Scores): Recommendation {
  const testsScore = typeof scores.tests === 'number' ? scores.tests : undefined;
  if (testsScore !== undefined) {
    return scores.promedio >= 7 && testsScore >= 5 ? 'apto' : 'no_apto';
  }
  return scores.promedio >= 7 ? 'apto' : 'no_apto';
}

export async function runPhasedReview(
  githubUrl: string,
  phaseDefinitions: ReviewSkillDefinition[],
  onPhase?: (phase: PhasedReviewResult['phases'][number]) => Promise<void> | void
): Promise<PhasedReviewResult> {
  const skills = phaseDefinitions.length > 0 ? phaseDefinitions : DEFAULT_SKILLS;
  const { tmpBase, repoPath, metrics } = await prepareRepository(githubUrl);
  const phases: PhasedReviewResult['phases'] = [];

  try {
    for (const skill of skills) {
      const startedAt = new Date();

      let score: number | null = null;
      let summary = '';
      let details: Record<string, unknown> = {};
      let rawOutput: string | null = null;

      if (codexCliEnabled()) {
        try {
          const codexResult = await runCodexPhase(skill, repoPath, metrics);
          score = codexResult.score;
          summary = codexResult.summary;
          details = { ...codexResult.details, engine: 'codex-cli' };
          rawOutput = codexResult.rawOutput;
        } catch (error) {
          const reason = error instanceof Error ? error.message : 'Codex CLI fallo';
          const fallbackScore = heuristicScoreByPhase(skill.key, metrics);
          score = fallbackScore;
          summary = `${buildPhaseSummary(skill.key, fallbackScore, metrics)} Fallback heuristico por error en Codex CLI: ${reason}`;
          details = {
            totalFiles: metrics.totalFiles,
            sourceFiles: metrics.sourceFiles,
            testFiles: metrics.testFiles,
            engine: 'heuristic-fallback',
            codexError: reason
          };
        }
      } else {
        const heuristicScore = heuristicScoreByPhase(skill.key, metrics);
        score = heuristicScore;
        summary = buildPhaseSummary(skill.key, heuristicScore, metrics);
        details = {
          totalFiles: metrics.totalFiles,
          sourceFiles: metrics.sourceFiles,
          testFiles: metrics.testFiles,
          engine: 'heuristic'
        };
      }

      const finishedAt = new Date();
      const phase = {
        phaseKey: skill.key,
        status: 'done' as const,
        score,
        summary,
        details,
        rawOutput,
        startedAt,
        finishedAt
      };
      phases.push(phase);
      if (onPhase) await onPhase(phase);
    }
  } finally {
    await rm(tmpBase, { recursive: true, force: true });
  }

  const scores = computeScores(phases);
  const recommendation = computeRecommendation(scores);
  const finalReport = buildFinalReport(phases, recommendation, scores.promedio);

  return { phases, scores, recommendation, finalReport };
}

export async function runAutomatedReview(githubUrl: string): Promise<Omit<PhasedReviewResult, 'phases'>> {
  const result = await runPhasedReview(githubUrl, DEFAULT_SKILLS);
  return {
    scores: result.scores,
    recommendation: result.recommendation,
    finalReport: result.finalReport
  };
}
