export type EnvConfig = {
  backendUrl: string;
  isDevelopment: boolean;
  standalone: boolean;
  clientVersion: string;
  /** "source" footer link: tarball of the built commit or GitHub tree */
  sourceUrl: string;
  /** "GPL-3.0" footer link: LICENSE at the built commit */
  licenseUrl: string;
  recaptchaSiteKey: string;
  quickLoginEmail: string | undefined;
  quickLoginPassword: string | undefined;
};

declare module "virtual:env-config" {
  export const envConfig: EnvConfig;
}
