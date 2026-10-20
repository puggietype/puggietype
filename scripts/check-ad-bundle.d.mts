export declare const FORBIDDEN: RegExp;
export declare const ADSENSE: RegExp;
export declare const ADSENSE_CHUNK: RegExp;
export declare function startupChunks(
  files: string[],
  read: (rel: string) => string,
): Set<string>;
export declare function checkAdBundle(
  files: string[],
  read: (rel: string) => string,
  adsEnabled: boolean,
): string[];
