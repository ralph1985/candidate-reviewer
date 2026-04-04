import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
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

export type RunnerContext = {
  reviewId?: number;
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

type SecurityPreflightResult = {
  ok: boolean;
  score: number;
  findings: string[];
  blockedReasons: string[];
};

type TestExecutionResult = {
  detected: boolean;
  ran: boolean;
  passed: boolean | null;
  installCommand: string | null;
  testCommand: string | null;
  output: string;
  reason: string;
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

function reviewWorkspaceRoot(): string {
  return process.env.REVIEW_WORKSPACES_ROOT || '/var/candidate-reviewer/workspaces';
}

function workspaceCleanupEnabled(): boolean {
  return process.env.REVIEW_WORKSPACE_CLEANUP_AFTER_RUN === 'true';
}

function testsTimeoutMs(): number {
  const raw = Number(process.env.REVIEW_TEST_TIMEOUT_MS || 300000);
  if (!Number.isFinite(raw) || raw <= 0) return 300000;
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

function capOutput(text: string, max = 12000): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}\n... [output truncated ${text.length - max} chars]`;
}

async function detectNodeProject(repoPath: string): Promise<{
  exists: boolean;
  packageJson: Record<string, unknown> | null;
}> {
  const content = await readFileIfExists(path.join(repoPath, 'package.json'));
  if (!content) return { exists: false, packageJson: null };

  try {
    const parsed = JSON.parse(content) as Record<string, unknown>;
    return { exists: true, packageJson: parsed };
  } catch {
    return { exists: true, packageJson: null };
  }
}

async function runSecurityPreflight(repoPath: string): Promise<SecurityPreflightResult> {
  const findings: string[] = [];
  const blockedReasons: string[] = [];
  let score = 10;

  const { exists, packageJson } = await detectNodeProject(repoPath);

  if (exists) {
    if (!packageJson) {
      score -= 3;
      findings.push('package.json no es JSON válido');
      blockedReasons.push('No se puede evaluar scripts/dependencias por package.json inválido');
    } else {
      const scripts = (packageJson.scripts && typeof packageJson.scripts === 'object' ? packageJson.scripts : {}) as Record<string, unknown>;
      const dangerousScriptPattern = /(curl|wget|nc\s|ncat|bash\s+-c|sh\s+-c|powershell|invoke-webrequest|chmod\s+\+x|\/dev\/tcp|base64\s+-d)/i;

      for (const [name, raw] of Object.entries(scripts)) {
        if (typeof raw !== 'string') continue;
        if (dangerousScriptPattern.test(raw)) {
          score -= 4;
          findings.push(`script potencialmente peligroso: ${name}`);
          blockedReasons.push(`script ${name} contiene comandos de red/ejecución de alto riesgo`);
        }
      }

      const depSections = ['dependencies', 'devDependencies', 'optionalDependencies'];
      for (const section of depSections) {
        const deps = (packageJson[section] && typeof packageJson[section] === 'object' ? packageJson[section] : {}) as Record<string, unknown>;
        for (const [dep, version] of Object.entries(deps)) {
          if (typeof version !== 'string') continue;
          if (version.startsWith('git+') || version.startsWith('http:') || version.startsWith('https:') || version.startsWith('file:')) {
            score -= 1;
            findings.push(`dependencia no-registry en ${section}: ${dep}`);
          }
        }
      }
    }
  }

  const ok = blockedReasons.length === 0;
  return { ok, score: scoreClamp(score), findings, blockedReasons };
}

async function runCommandInRepo(
  repoPath: string,
  command: string,
  timeout: number,
  extraEnv: Record<string, string>
): Promise<{ ok: boolean; output: string; errorMessage: string | null }> {
  let stdout = '';
  let stderr = '';
  let errorMessage: string | null = null;

  try {
    const result = await execFileAsync('bash', ['-lc', command], {
      cwd: repoPath,
      timeout,
      maxBuffer: 6 * 1024 * 1024,
      env: { ...process.env, CI: '1', ...extraEnv }
    });
    stdout = result.stdout || '';
    stderr = result.stderr || '';
  } catch (error) {
    const typed = error as { stdout?: string; stderr?: string; message?: string };
    stdout = typed.stdout || '';
    stderr = typed.stderr || '';
    errorMessage = typed.message || 'command failed';
  }

  return {
    ok: !errorMessage,
    output: capOutput([stdout, stderr].filter(Boolean).join('\n').trim()),
    errorMessage
  };
}

async function runTestsIfAvailable(repoPath: string, security: SecurityPreflightResult): Promise<TestExecutionResult> {
  const node = await detectNodeProject(repoPath);
  if (!node.exists || !node.packageJson) {
    return {
      detected: false,
      ran: false,
      passed: null,
      installCommand: null,
      testCommand: null,
      output: '',
      reason: 'No se detectó proyecto Node ejecutable por este runner (sin package.json válido).'
    };
  }

  if (!security.ok) {
    return {
      detected: true,
      ran: false,
      passed: null,
      installCommand: null,
      testCommand: null,
      output: '',
      reason: `Ejecución bloqueada por seguridad previa: ${security.blockedReasons.join('; ')}`
    };
  }

  const scripts = (node.packageJson.scripts && typeof node.packageJson.scripts === 'object' ? node.packageJson.scripts : {}) as Record<string, unknown>;
  const testScript = scripts.test;
  if (typeof testScript !== 'string' || !testScript.trim() || /no test specified/i.test(testScript)) {
    return {
      detected: true,
      ran: false,
      passed: null,
      installCommand: null,
      testCommand: null,
      output: '',
      reason: 'No hay script de test útil en package.json.'
    };
  }

  const hasPnpm = await stat(path.join(repoPath, 'pnpm-lock.yaml')).then(() => true).catch(() => false);
  const hasYarn = await stat(path.join(repoPath, 'yarn.lock')).then(() => true).catch(() => false);
  const hasNpmLock = await stat(path.join(repoPath, 'package-lock.json')).then(() => true).catch(() => false);

  let installCommand = 'npm install --ignore-scripts';
  let testCommand = 'npm test';

  if (hasPnpm) {
    installCommand = 'pnpm install --frozen-lockfile --ignore-scripts';
    testCommand = 'pnpm test';
  } else if (hasYarn) {
    installCommand = 'yarn install --frozen-lockfile --ignore-scripts';
    testCommand = 'yarn test';
  } else if (hasNpmLock) {
    installCommand = 'npm ci --ignore-scripts';
  }

  const secureInstallEnv = {
    npm_config_ignore_scripts: 'true',
    YARN_ENABLE_SCRIPTS: 'false',
    PNPM_IGNORE_SCRIPTS: 'true'
  };

  const installResult = await runCommandInRepo(repoPath, installCommand, testsTimeoutMs(), secureInstallEnv);
  if (!installResult.ok) {
    return {
      detected: true,
      ran: false,
      passed: false,
      installCommand,
      testCommand,
      output: installResult.output,
      reason: `Falló la instalación segura de dependencias: ${installResult.errorMessage || 'error desconocido'}`
    };
  }

  const testResult = await runCommandInRepo(repoPath, testCommand, testsTimeoutMs(), {});
  return {
    detected: true,
    ran: true,
    passed: testResult.ok,
    installCommand,
    testCommand,
    output: testResult.output,
    reason: testResult.ok ? 'Tests ejecutados correctamente.' : `Tests con fallo: ${testResult.errorMessage || 'error desconocido'}`
  };
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

async function prepareRepository(
  githubUrl: string,
  context?: RunnerContext
): Promise<{ workspacePath: string; metrics: RepoMetrics; cleanupOnExit: boolean }> {
  if (!isGithubUrl(githubUrl)) {
    throw new Error('La URL del repositorio debe ser de GitHub y usar http/https');
  }

  let workspacePath: string;
  let cleanupOnExit = false;

  if (context?.reviewId && Number.isInteger(context.reviewId) && context.reviewId > 0) {
    await mkdir(reviewWorkspaceRoot(), { recursive: true });
    workspacePath = path.join(reviewWorkspaceRoot(), `review-${context.reviewId}`);
    await rm(workspacePath, { recursive: true, force: true });
  } else {
    const tmpBase = await mkdtemp(path.join(os.tmpdir(), 'candidate-review-'));
    workspacePath = path.join(tmpBase, 'repo');
    cleanupOnExit = true;
  }

  await execFileAsync('git', ['clone', '--depth', '1', githubUrl, workspacePath], {
    timeout: 180000,
    maxBuffer: 2 * 1024 * 1024
  });

  const repoStat = await stat(workspacePath);
  if (!repoStat.isDirectory()) {
    throw new Error('No se pudo preparar el repositorio para revision');
  }

  const files = await collectFilesRecursive(workspacePath);
  return { workspacePath, metrics: buildMetrics(files), cleanupOnExit };
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

function mergeTestScore(baseScore: number, execution: TestExecutionResult): number {
  if (!execution.detected) return baseScore;
  if (!execution.ran) {
    if (execution.passed === false) return Math.min(baseScore, 3);
    return Math.min(baseScore, 5);
  }
  if (execution.passed) return Math.max(baseScore, 7);
  return Math.min(baseScore, 4);
}

export async function runPhasedReview(
  githubUrl: string,
  phaseDefinitions: ReviewSkillDefinition[],
  onPhase?: (phase: PhasedReviewResult['phases'][number]) => Promise<void> | void,
  context?: RunnerContext
): Promise<PhasedReviewResult> {
  const skills = phaseDefinitions.length > 0 ? phaseDefinitions : DEFAULT_SKILLS;
  const { workspacePath, metrics, cleanupOnExit } = await prepareRepository(githubUrl, context);
  const phases: PhasedReviewResult['phases'] = [];

  let securityPreflight: SecurityPreflightResult | null = null;

  try {
    for (const skill of skills) {
      const startedAt = new Date();

      let status: 'done' | 'failed' = 'done';
      let score: number | null = null;
      let summary = '';
      let details: Record<string, unknown> = { workspacePath };
      let rawOutput: string | null = null;

      if (skill.key === 'security') {
        securityPreflight = await runSecurityPreflight(workspacePath);
        score = securityPreflight.score;
        summary = securityPreflight.ok
          ? `Security preflight ${score}/10. Sin bloqueos críticos antes de instalación.`
          : `Security preflight ${score}/10. Bloqueo preventivo antes de instalación: ${securityPreflight.blockedReasons.join('; ')}`;
        details = {
          ...details,
          engine: 'security-preflight',
          findings: securityPreflight.findings,
          blockedReasons: securityPreflight.blockedReasons,
          ok: securityPreflight.ok
        };
      } else if (skill.key === 'tests') {
        if (!securityPreflight) {
          securityPreflight = await runSecurityPreflight(workspacePath);
        }

        const execution = await runTestsIfAvailable(workspacePath, securityPreflight);
        const heuristic = heuristicScoreByPhase(skill.key, metrics);
        score = mergeTestScore(heuristic, execution);

        if (!execution.detected) {
          summary = `Tests ${score}/10. ${execution.reason}`;
        } else if (!execution.ran) {
          status = execution.passed === false ? 'failed' : 'done';
          summary = `Tests ${score}/10. ${execution.reason}`;
        } else {
          status = execution.passed ? 'done' : 'failed';
          summary = execution.passed
            ? `Tests ${score}/10. Se ejecutaron tests y pasaron.`
            : `Tests ${score}/10. Se ejecutaron tests y fallaron.`;
        }

        details = {
          ...details,
          engine: 'tests-exec',
          securityPreflight: {
            ok: securityPreflight.ok,
            score: securityPreflight.score,
            blockedReasons: securityPreflight.blockedReasons
          },
          execution
        };
        rawOutput = execution.output || null;
      } else if (codexCliEnabled()) {
        try {
          const codexResult = await runCodexPhase(skill, workspacePath, metrics);
          score = codexResult.score;
          summary = codexResult.summary;
          details = { ...details, ...codexResult.details, engine: 'codex-cli' };
          rawOutput = codexResult.rawOutput;
        } catch (error) {
          const reason = error instanceof Error ? error.message : 'Codex CLI fallo';
          const fallbackScore = heuristicScoreByPhase(skill.key, metrics);
          score = fallbackScore;
          summary = `${buildPhaseSummary(skill.key, fallbackScore, metrics)} Fallback heuristico por error en Codex CLI: ${reason}`;
          details = {
            ...details,
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
          ...details,
          totalFiles: metrics.totalFiles,
          sourceFiles: metrics.sourceFiles,
          testFiles: metrics.testFiles,
          engine: 'heuristic'
        };
      }

      const finishedAt = new Date();
      const phase = {
        phaseKey: skill.key,
        status,
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
    if (cleanupOnExit || workspaceCleanupEnabled()) {
      await rm(workspacePath, { recursive: true, force: true });
    }
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
