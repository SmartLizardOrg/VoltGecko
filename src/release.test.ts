import { describe, expect, it } from 'vitest';
import { normalizeReleaseTimestamp, resolveReleaseMetadata } from '../scripts/release-info.mjs';
import { formatReleaseDate, releaseCommitUrl, RELEASE_REPOSITORY } from './release';

const first='a'.repeat(40),second='b'.repeat(40),committedAt='2026-10-18T14:03:36+02:00';
const repository=(head=first,status='')=>(args:string[])=>{
  if(args[0]==='rev-parse')return head;
  if(args[0]==='show'&&args[3]===head)return committedAt;
  if(args[0]==='status')return status;
  throw new Error('Missing Git object');
};
const noGit=()=>{throw new Error('Git is unavailable');};

describe('frozen release metadata',()=>{
  it('resolves the exact Cloudflare commit and its commit time, never the build time',()=>{
    const metadata=resolveReleaseMetadata({env:{CF_PAGES_COMMIT_SHA:first.toUpperCase()},production:true,runGit:repository()});
    expect(metadata).toEqual({commit:first,committedAt:'2026-10-18T12:03:36.000Z',development:false,dirty:false});
    expect(Object.isFrozen(metadata)).toBe(true);
    expect(releaseCommitUrl(metadata)).toBe(`${RELEASE_REPOSITORY}/commit/${first}`);
  });
  it('supports GitHub CI and refuses a deployment SHA different from the checked-out source',()=>{
    expect(resolveReleaseMetadata({env:{GITHUB_SHA:first},production:true,runGit:repository()}).commit).toBe(first);
    expect(()=>resolveReleaseMetadata({env:{CF_PAGES_COMMIT_SHA:second,GITHUB_SHA:first},production:true,runGit:repository()})).toThrow('does not match the checked-out source');
  });
  it('reads HEAD freshly for each startup while existing metadata remains immutable',()=>{
    let current=first;
    const runGit=(args:string[])=>repository(current)(args);
    const cached=resolveReleaseMetadata({env:{},production:true,runGit});current=second;
    const rebuilt=resolveReleaseMetadata({env:{},production:true,runGit});
    expect(cached.commit).toBe(first);expect(rebuilt.commit).toBe(second);
    expect(releaseCommitUrl(cached)).toContain(`/commit/${first}`);
  });
  it('marks local changes and exposes no exact-version commit link for a dirty build',()=>{
    const metadata=resolveReleaseMetadata({env:{},production:true,runGit:repository(first,' M src/App.tsx\n?? new.ts')});
    expect(metadata.dirty).toBe(true);expect(releaseCommitUrl(metadata)).toBeUndefined();
    expect(resolveReleaseMetadata({env:{},production:false,runGit:repository()}).development).toBe(true);
  });
  it('fails production and suppresses local commit links when working-tree verification fails',()=>{
    const runGit=(args:string[])=>{if(args[0]==='status')throw new Error('Cannot inspect working tree');return repository()(args);};
    expect(()=>resolveReleaseMetadata({env:{},production:true,runGit})).toThrow('working-tree state could not be verified');
    const local=resolveReleaseMetadata({env:{},runGit});expect(local.dirty).toBe(true);expect(releaseCommitUrl(local)).toBeUndefined();
  });
  it('permits reproducible Git-free builds only with a full SHA and explicit commit timestamp',()=>{
    const metadata=resolveReleaseMetadata({env:{VOLTGECKO_RELEASE_COMMIT_SHA:second,VOLTGECKO_RELEASE_COMMITTED_AT:committedAt},production:true,runGit:noGit});
    expect(metadata).toMatchObject({commit:second,committedAt:'2026-10-18T12:03:36.000Z'});
    expect(()=>resolveReleaseMetadata({env:{},production:true,runGit:noGit})).toThrow('no source commit');
    expect(()=>resolveReleaseMetadata({env:{CF_PAGES_COMMIT_SHA:first},production:true,runGit:noGit})).toThrow('commit date is unavailable');
    expect(resolveReleaseMetadata({env:{},runGit:noGit})).toEqual({commit:null,committedAt:null,development:true,dirty:false});
  });
  it('rejects branch refs, abbreviated commits, invalid dates and mismatched timestamps',()=>{
    for(const value of ['main','a'.repeat(7),'z'.repeat(40)])expect(()=>resolveReleaseMetadata({env:{CF_PAGES_COMMIT_SHA:value},production:true,runGit:noGit})).toThrow('full 40-character');
    for(const value of ['2026-10-18','2026-02-30T12:00:00Z','2026-10-18T25:00:00Z'])expect(()=>normalizeReleaseTimestamp(value)).toThrow('valid ISO');
    expect(()=>resolveReleaseMetadata({env:{VOLTGECKO_RELEASE_COMMITTED_AT:'2026-10-18T10:00:00Z'},production:true,runGit:repository()})).toThrow('does not match the source commit date');
    expect(releaseCommitUrl({commit:'main',committedAt:null,development:false,dirty:false})).toBeUndefined();
  });
});

describe('release date display',()=>{
  it('uses Budapest summer and winter time in Hungarian and English',()=>{
    for(const language of ['hu','en'] as const){
      expect(formatReleaseDate('2026-07-01T12:00:00Z',language)).toContain('14:00');
      expect(formatReleaseDate('2026-12-01T12:00:00Z',language)).toContain('13:00');
      expect(formatReleaseDate('2026-07-01T12:00:00Z',language)).toContain('(Europe/Budapest)');
    }
    expect(formatReleaseDate('2026-07-01T12:00:00Z','hu')).not.toBe(formatReleaseDate('2026-07-01T12:00:00Z','en'));
  });
});
