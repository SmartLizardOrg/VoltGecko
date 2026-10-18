import { execFileSync } from 'node:child_process';

const fullCommit = /^[a-f0-9]{40}$/i;

/** Normalize an explicit commit timestamp; never substitute the build clock. */
export function normalizeReleaseTimestamp(value) {
  const match = typeof value === 'string' && /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.exec(value.trim());
  const timestamp = match && Date.parse(value.trim());
  if (!match || !Number.isFinite(timestamp) || Number(match[2]) < 1 || Number(match[2]) > 12 || Number(match[3]) < 1 || Number(match[3]) > new Date(Date.UTC(Number(match[1]), Number(match[2]), 0)).getUTCDate() || Number(match[4]) > 23 || Number(match[5]) > 59 || Number(match[6]) > 59) {
    throw new Error('Release metadata: committedAt must be a valid ISO 8601 commit timestamp including its timezone.');
  }
  return new Date(timestamp).toISOString();
}

/** Resolve once at Vite startup, so a cached bundle always keeps its own stamp. */
export function resolveReleaseMetadata({ env = process.env, cwd = process.cwd(), production = false, runGit } = {}) {
  const git = runGit ?? (args => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim());
  const readGit = args => { try { return git(args).trim(); } catch { return undefined; } };
  const head = readGit(['rev-parse', 'HEAD']);
  const supplied = env.CF_PAGES_COMMIT_SHA || env.GITHUB_SHA || env.VOLTGECKO_RELEASE_COMMIT_SHA;
  const source = supplied || head;
  if (source && !fullCommit.test(source.trim())) throw new Error('Release metadata: expected a full 40-character commit SHA in CF_PAGES_COMMIT_SHA, GITHUB_SHA or VOLTGECKO_RELEASE_COMMIT_SHA.');
  const commit = source?.trim().toLowerCase() ?? null;
  if (!commit) {
    if (production) throw new Error('Release metadata: no source commit is available. Build from Git or provide a full VOLTGECKO_RELEASE_COMMIT_SHA and VOLTGECKO_RELEASE_COMMITTED_AT.');
    return Object.freeze({ commit: null, committedAt: null, development: true, dirty: false });
  }
  if (supplied && head && fullCommit.test(head) && head.toLowerCase() !== commit) throw new Error('Release metadata: the deployment commit does not match the checked-out source HEAD. Build the requested commit before publishing.');
  const gitTimestamp = readGit(['show', '-s', '--format=%cI', commit, '--']);
  const suppliedTimestamp = env.VOLTGECKO_RELEASE_COMMITTED_AT;
  const committedAt = gitTimestamp ? normalizeReleaseTimestamp(gitTimestamp) : suppliedTimestamp ? normalizeReleaseTimestamp(suppliedTimestamp) : null;
  if (!committedAt && production) throw new Error('Release metadata: the commit date is unavailable. Provide its exact ISO timestamp in VOLTGECKO_RELEASE_COMMITTED_AT for a Git-free build.');
  if (gitTimestamp && suppliedTimestamp && normalizeReleaseTimestamp(suppliedTimestamp) !== committedAt) throw new Error('Release metadata: the supplied timestamp does not match the source commit date.');
  const status = head ? readGit(['status', '--porcelain', '--untracked-files=normal']) : undefined;
  if (head && status === undefined && production) throw new Error('Release metadata: the working-tree state could not be verified.');
  return Object.freeze({ commit, committedAt, development: !production, dirty: head ? status === undefined || Boolean(status) : false });
}
