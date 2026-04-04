import { mkdtemp, readdir, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

type Recommendation = 'apto' | 'no_apto';

type ReviewResult = {
  scores: {
    arquitectura: number;
    tests: number;
    seguridad: number;
    documentacion: number;
    promedio: number;
  };
  recommendation: Recommendation;
  finalReport: string;
};

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

const SOURCE_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.py',
  '.go',
  '.java',
  '.rb',
  '.php',
  '.rs',
  '.cs',
  '.cpp',
  '.c',
  '.h'
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

  const hasReadme = lowered.some((file) => file === 'readme.md' || file.endsWith('/readme.md'));
  const hasDocsDir = lowered.some((file) => file.startsWith('docs/'));
  const hasLicense = lowered.some((file) => file === 'license' || file === 'license.md');
  const hasCi = lowered.some((file) => file.startsWith('.github/workflows/') && (file.endsWith('.yml') || file.endsWith('.yaml')));
  const hasDocker = lowered.some((file) => file === 'dockerfile' || file.endsWith('/dockerfile') || file === 'docker-compose.yml' || file === 'docker-compose.yaml');
  const hasLockfile = lowered.some((file) =>
    ['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'poetry.lock', 'cargo.lock', 'go.sum'].includes(file)
  );
  const hasSecurityDocs = lowered.some((file) => file === 'security.md' || file === '.github/dependabot.yml' || file === '.github/dependabot.yaml');
  const hasTypeScript = lowered.some((file) => file.endsWith('.ts') || file.endsWith('.tsx') || file === 'tsconfig.json');
  const hasLintConfig = lowered.some((file) =>
    ['.eslintrc', '.eslintrc.js', '.eslintrc.cjs', '.eslintrc.json', 'eslint.config.js', 'eslint.config.mjs'].includes(file)
  );
  const hasSrcDir = lowered.some((file) => file.startsWith('src/'));

  return {
    totalFiles: files.length,
    sourceFiles,
    testFiles,
    hasReadme,
    hasDocsDir,
    hasLicense,
    hasCi,
    hasDocker,
    hasLockfile,
    hasSecurityDocs,
    hasTypeScript,
    hasLintConfig,
    hasSrcDir
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

function buildFinalReport(metrics: RepoMetrics, scores: ReviewResult['scores'], recommendation: Recommendation): string {
  const strengths: string[] = [];
  const gaps: string[] = [];

  if (metrics.hasCi) strengths.push('pipeline CI detectado');
  if (metrics.hasReadme) strengths.push('README presente');
  if (metrics.testFiles > 0) strengths.push(`tests detectados (${metrics.testFiles})`);
  if (metrics.hasLockfile) strengths.push('lockfile de dependencias presente');

  if (metrics.testFiles === 0) gaps.push('no se detectaron tests automatizados');
  if (!metrics.hasCi) gaps.push('no se detectó pipeline CI');
  if (!metrics.hasReadme) gaps.push('falta README');
  if (!metrics.hasSecurityDocs) gaps.push('falta documentación/política de seguridad');

  const strengthLine = strengths.length ? strengths.join(', ') : 'sin fortalezas claras detectables por análisis estático';
  const gapLine = gaps.length ? gaps.join(', ') : 'sin brechas críticas detectables en análisis estructural';

  return [
    'Revisión automática inicial (heurística estructural):',
    `- Arquitectura: ${scores.arquitectura}/10`,
    `- Tests: ${scores.tests}/10`,
    `- Seguridad: ${scores.seguridad}/10`,
    `- Documentación: ${scores.documentacion}/10`,
    `- Promedio: ${scores.promedio}/10`,
    `- Fortalezas: ${strengthLine}.`,
    `- Gaps: ${gapLine}.`,
    `- Recomendación: ${recommendation}.`
  ].join('\n');
}

export async function runAutomatedReview(githubUrl: string): Promise<ReviewResult> {
  if (!isGithubUrl(githubUrl)) {
    throw new Error('La URL del repositorio debe ser de GitHub y usar http/https');
  }

  const tmpBase = await mkdtemp(path.join(os.tmpdir(), 'candidate-review-'));
  const repoPath = path.join(tmpBase, 'repo');

  try {
    await execFileAsync('git', ['clone', '--depth', '1', githubUrl, repoPath], {
      timeout: 180_000,
      maxBuffer: 2 * 1024 * 1024
    });

    const repoStat = await stat(repoPath);
    if (!repoStat.isDirectory()) {
      throw new Error('No se pudo preparar el repositorio para revisión');
    }

    const files = await collectFilesRecursive(repoPath);
    const metrics = buildMetrics(files);

    const arquitectura = scoreArchitecture(metrics);
    const tests = scoreTests(metrics);
    const seguridad = scoreSecurity(metrics);
    const documentacion = scoreDocumentation(metrics);
    const promedio = scoreClamp((arquitectura + tests + seguridad + documentacion) / 4);
    const recommendation: Recommendation = promedio >= 7 && tests >= 5 ? 'apto' : 'no_apto';

    const scores = { arquitectura, tests, seguridad, documentacion, promedio };
    const finalReport = buildFinalReport(metrics, scores, recommendation);

    return { scores, recommendation, finalReport };
  } finally {
    await rm(tmpBase, { recursive: true, force: true });
  }
}
