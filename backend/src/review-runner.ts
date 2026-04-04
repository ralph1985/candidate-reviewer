import { execFile } from 'node:child_process';
import { mkdtemp, readdir, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export const REVIEW_PHASE_KEYS = ['architecture', 'tests', 'security', 'documentation'] as const;

export type ReviewPhaseKey = (typeof REVIEW_PHASE_KEYS)[number];

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

type Scores = {
  arquitectura: number;
  tests: number;
  seguridad: number;
  documentacion: number;
  promedio: number;
};

export type PhasedReviewResult = {
  phases: Array<{
    phaseKey: ReviewPhaseKey;
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

function scoreClamp(value: number): number {
  return Math.max(0, Math.min(10, Math.round(value)));
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

function buildFinalReport(scores: Scores, recommendation: Recommendation): string {
  return [
    'Revisión automática por fases (heurística estructural):',
    `- Arquitectura: ${scores.arquitectura}/10`,
    `- Tests: ${scores.tests}/10`,
    `- Seguridad: ${scores.seguridad}/10`,
    `- Documentación: ${scores.documentacion}/10`,
    `- Promedio: ${scores.promedio}/10`,
    `- Recomendación: ${recommendation}.`
  ].join('\n');
}

function buildPhaseSummary(phaseKey: ReviewPhaseKey, score: number, metrics: RepoMetrics): string {
  if (phaseKey === 'architecture') {
    return `Arquitectura ${score}/10. src=${metrics.hasSrcDir ? 'sí' : 'no'}, ts=${metrics.hasTypeScript ? 'sí' : 'no'}, ci=${metrics.hasCi ? 'sí' : 'no'}.`;
  }
  if (phaseKey === 'tests') {
    return `Tests ${score}/10. archivos_test=${metrics.testFiles}, ratio=${metrics.totalFiles ? (metrics.testFiles / metrics.totalFiles).toFixed(2) : '0.00'}.`;
  }
  if (phaseKey === 'security') {
    return `Seguridad ${score}/10. lockfile=${metrics.hasLockfile ? 'sí' : 'no'}, security_docs=${metrics.hasSecurityDocs ? 'sí' : 'no'}.`;
  }
  return `Documentación ${score}/10. readme=${metrics.hasReadme ? 'sí' : 'no'}, docs_dir=${metrics.hasDocsDir ? 'sí' : 'no'}.`;
}

function phaseScore(phaseKey: ReviewPhaseKey, metrics: RepoMetrics): number {
  if (phaseKey === 'architecture') return scoreArchitecture(metrics);
  if (phaseKey === 'tests') return scoreTests(metrics);
  if (phaseKey === 'security') return scoreSecurity(metrics);
  return scoreDocumentation(metrics);
}

async function analyzeRepository(githubUrl: string): Promise<{ metrics: RepoMetrics }> {
  if (!isGithubUrl(githubUrl)) {
    throw new Error('La URL del repositorio debe ser de GitHub y usar http/https');
  }

  const tmpBase = await mkdtemp(path.join(os.tmpdir(), 'candidate-review-'));
  const repoPath = path.join(tmpBase, 'repo');

  try {
    await execFileAsync('git', ['clone', '--depth', '1', githubUrl, repoPath], {
      timeout: 180000,
      maxBuffer: 2 * 1024 * 1024
    });

    const repoStat = await stat(repoPath);
    if (!repoStat.isDirectory()) {
      throw new Error('No se pudo preparar el repositorio para revisión');
    }

    const files = await collectFilesRecursive(repoPath);
    return { metrics: buildMetrics(files) };
  } finally {
    await rm(tmpBase, { recursive: true, force: true });
  }
}

export async function runPhasedReview(
  githubUrl: string,
  onPhase?: (phase: PhasedReviewResult['phases'][number]) => Promise<void> | void
): Promise<PhasedReviewResult> {
  const { metrics } = await analyzeRepository(githubUrl);

  const phases: PhasedReviewResult['phases'] = [];

  for (const phaseKey of REVIEW_PHASE_KEYS) {
    const startedAt = new Date();
    const score = phaseScore(phaseKey, metrics);
    const finishedAt = new Date();
    const phase = {
      phaseKey,
      status: 'done' as const,
      score,
      summary: buildPhaseSummary(phaseKey, score, metrics),
      details: {
        totalFiles: metrics.totalFiles,
        sourceFiles: metrics.sourceFiles,
        testFiles: metrics.testFiles
      },
      rawOutput: null,
      startedAt,
      finishedAt
    };
    phases.push(phase);
    if (onPhase) {
      await onPhase(phase);
    }
  }

  const arquitectura = phases.find((p) => p.phaseKey === 'architecture')?.score ?? 0;
  const tests = phases.find((p) => p.phaseKey === 'tests')?.score ?? 0;
  const seguridad = phases.find((p) => p.phaseKey === 'security')?.score ?? 0;
  const documentacion = phases.find((p) => p.phaseKey === 'documentation')?.score ?? 0;

  const promedio = scoreClamp((arquitectura + tests + seguridad + documentacion) / 4);
  const recommendation: Recommendation = promedio >= 7 && tests >= 5 ? 'apto' : 'no_apto';

  const scores: Scores = { arquitectura, tests, seguridad, documentacion, promedio };
  const finalReport = buildFinalReport(scores, recommendation);

  return { phases, scores, recommendation, finalReport };
}

export async function runAutomatedReview(githubUrl: string): Promise<Omit<PhasedReviewResult, 'phases'>> {
  const result = await runPhasedReview(githubUrl);
  return {
    scores: result.scores,
    recommendation: result.recommendation,
    finalReport: result.finalReport
  };
}
