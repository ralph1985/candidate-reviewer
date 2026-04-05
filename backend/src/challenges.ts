import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { pool } from './db';

export type ChallengeKind = 'challenge';

export type ChallengeDefinition = {
  id: number;
  key: string;
  name: string;
  kind: ChallengeKind;
  aliases: string[];
  contentFormat: 'markdown' | 'html';
  content: string;
  sourcePath: string | null;
};

type ChallengeSeed = {
  key: string;
  name: string;
  kind: ChallengeKind;
  aliases: string[];
  contentFormat: 'markdown' | 'html';
  sourcePath: string;
};

const CHALLENGE_SEEDS: ChallengeSeed[] = [
  {
    key: 'autoclicker',
    name: 'Autoclicker',
    kind: 'challenge',
    aliases: ['auto clicker', 'cookie clicker'],
    contentFormat: 'markdown',
    sourcePath: 'autoclicker.md'
  },
  {
    key: 'kill',
    name: 'Kill the Mole',
    kind: 'challenge',
    aliases: ['toca al topo', 'whack a mole', 'topo'],
    contentFormat: 'markdown',
    sourcePath: 'kill.md'
  },
  {
    key: 'memory',
    name: 'Memory Cards',
    kind: 'challenge',
    aliases: ['memoria', 'memory cards'],
    contentFormat: 'markdown',
    sourcePath: 'memory.md'
  },
  {
    key: 'rock_paper_scissors',
    name: 'Rock Paper Scissors',
    kind: 'challenge',
    aliases: ['piedra papel o tijera', 'rock-paper-scissors', 'rps'],
    contentFormat: 'markdown',
    sourcePath: 'rock-paper-scissors.md'
  },
  {
    key: 'statues',
    name: 'Statues (Red Light, Green Light)',
    kind: 'challenge',
    aliases: ['red light green light', 'semaforo', 'statues'],
    contentFormat: 'markdown',
    sourcePath: 'statues.md'
  },
];

function challengesPagesDir(): string {
  return path.resolve(process.cwd(), 'challenges/pages');
}

function challengesIncludesDir(): string {
  return path.resolve(process.cwd(), 'challenges/_includes');
}

const INCLUDE_REGEX = /\{%\s*include\s+([^%\s]+)\s*%\}/g;
const MAX_INCLUDE_DEPTH = 8;

async function resolveIncludeDirectives(content: string, depth = 0): Promise<string> {
  if (depth >= MAX_INCLUDE_DEPTH) return content;

  const matches = [...content.matchAll(INCLUDE_REGEX)];
  if (matches.length === 0) return content;

  let output = content;
  const includesDir = challengesIncludesDir();

  for (const match of matches) {
    const raw = match[0];
    const includeName = (match[1] || '').trim();
    if (!includeName) continue;

    // Prevent path traversal and keep includes contained in challenges/_includes.
    const includePath = path.resolve(includesDir, includeName);
    if (!includePath.startsWith(includesDir + path.sep)) {
      output = output.replace(raw, `\n<!-- include bloqueado: ${includeName} -->\n`);
      continue;
    }

    try {
      const includeContent = await readFile(includePath, 'utf8');
      const resolvedInclude = await resolveIncludeDirectives(includeContent, depth + 1);
      output = output.replace(raw, `\n${resolvedInclude.trim()}\n`);
    } catch {
      output = output.replace(raw, `\n<!-- include no encontrado: ${includeName} -->\n`);
    }
  }

  return output;
}

function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function challengeTerms(def: ChallengeDefinition): string[] {
  return [def.key, def.name, ...def.aliases]
    .map((term) => normalize(term))
    .filter((term) => term.length > 0);
}

function computeMatchScore(input: string, def: ChallengeDefinition): number {
  const normalized = normalize(input);
  if (!normalized) return 0;

  let score = 0;
  for (const term of challengeTerms(def)) {
    if (!term) continue;
    if (normalized === term) score = Math.max(score, 100);
    if (normalized.includes(term)) score = Math.max(score, 80);
    if (term.includes(normalized) && normalized.length >= 4) score = Math.max(score, 60);
  }
  return score;
}

export async function syncChallengeDefinitionsFromFiles(): Promise<{ upserted: number; skipped: string[] }> {
  const baseDir = challengesPagesDir();
  let upserted = 0;
  const skipped: string[] = [];

  for (const seed of CHALLENGE_SEEDS) {
    const sourcePath = path.join(baseDir, seed.sourcePath);
    let rawContent: string;
    try {
      rawContent = await readFile(sourcePath, 'utf8');
    } catch {
      skipped.push(seed.sourcePath);
      continue;
    }
    const content = await resolveIncludeDirectives(rawContent);

    await pool.query(
      `INSERT INTO challenge_definitions
        (key, name, kind, aliases, content_format, content, source_path, active)
       VALUES
        ($1, $2, $3, $4::text[], $5, $6, $7, true)
       ON CONFLICT (key)
       DO UPDATE SET
        name = EXCLUDED.name,
        kind = EXCLUDED.kind,
        aliases = EXCLUDED.aliases,
        content_format = EXCLUDED.content_format,
        content = EXCLUDED.content,
        source_path = EXCLUDED.source_path,
        active = true`,
      [seed.key, seed.name, seed.kind, seed.aliases, seed.contentFormat, content, `challenges/pages/${seed.sourcePath}`]
    );
    upserted += 1;
  }

  return { upserted, skipped };
}

export async function loadActiveChallengeDefinitions(): Promise<ChallengeDefinition[]> {
  const result = await pool.query(
    `SELECT id, key, name, kind, aliases, content_format, content, source_path
     FROM challenge_definitions
     WHERE active = true
     ORDER BY kind ASC, key ASC`
  );

  return result.rows.map((row) => ({
    id: Number(row.id),
    key: String(row.key),
    name: String(row.name),
    kind: String(row.kind) as ChallengeKind,
    aliases: Array.isArray(row.aliases) ? row.aliases.map((item: unknown) => String(item)) : [],
    contentFormat: String(row.content_format) === 'html' ? 'html' : 'markdown',
    content: String(row.content),
    sourcePath: row.source_path ? String(row.source_path) : null
  }));
}

export function resolveChallengeForReview(
  exerciseName: string | null | undefined,
  githubUrl: string,
  challenges: ChallengeDefinition[]
): {
  matchedChallenge: ChallengeDefinition | null;
  matchReason: string;
  globalRequirements: ChallengeDefinition[];
} {
  const candidates = challenges.filter((item) => item.kind === 'challenge');
  const globalRequirements: ChallengeDefinition[] = [];

  let best: { challenge: ChallengeDefinition; score: number; reason: string } | null = null;

  if (exerciseName) {
    for (const challenge of candidates) {
      const score = computeMatchScore(exerciseName, challenge);
      if (!best || score > best.score) {
        best = { challenge, score, reason: 'exercise_name' };
      }
    }
  }

  if ((!best || best.score < 80) && githubUrl) {
    for (const challenge of candidates) {
      const score = computeMatchScore(githubUrl, challenge);
      if (!best || score > best.score) {
        best = { challenge, score, reason: 'github_url' };
      }
    }
  }

  if (!best || best.score < 60) {
    return {
      matchedChallenge: null,
      matchReason: 'no_match',
      globalRequirements
    };
  }

  return {
    matchedChallenge: best.challenge,
    matchReason: best.reason,
    globalRequirements
  };
}
