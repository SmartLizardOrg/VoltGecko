export interface BuildReleaseMetadata {readonly commit:string|null;readonly committedAt:string|null;readonly development:boolean;readonly dirty:boolean}
export interface ReleaseOptions {env?:Record<string,string|undefined>;cwd?:string;production?:boolean;runGit?:(args:string[])=>string}
export function normalizeReleaseTimestamp(value:unknown):string;
export function resolveReleaseMetadata(options?:ReleaseOptions):Readonly<BuildReleaseMetadata>;
