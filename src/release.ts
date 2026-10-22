import type { Language } from './i18n';

export interface ReleaseMetadata {readonly commit:string|null;readonly committedAt:string|null;readonly development:boolean;readonly dirty:boolean}
export const RELEASE_TIME_ZONE = 'Europe/Budapest';
export const RELEASE_REPOSITORY = 'https://github.com/molnard-labs/VoltGecko';

// This literal is injected into the bundle at build startup, with no network lookup.
export const RELEASE:Readonly<ReleaseMetadata> = Object.freeze(typeof __VOLTGECKO_RELEASE__ === 'undefined' ? {commit:null,committedAt:null,development:true,dirty:false} : __VOLTGECKO_RELEASE__);

export function releaseCommitUrl(release:ReleaseMetadata):string|undefined {
  return !release.dirty&&release.commit&&/^[a-f0-9]{40}$/.test(release.commit) ? `${RELEASE_REPOSITORY}/commit/${release.commit}` : undefined;
}

export function formatReleaseDate(value:string,language:Language):string {
  const timestamp=new Date(value);
  if(!Number.isFinite(timestamp.getTime()))throw new Error('Invalid release commit date.');
  return new Intl.DateTimeFormat(language==='en'?'en-GB':'hu-HU',{timeZone:RELEASE_TIME_ZONE,dateStyle:'medium',timeStyle:'short'}).format(timestamp);
}
