import { Plugin } from "vite";
import { EnvConfig } from "virtual:env-config";
import {
  consentRegionList,
  resolveGa4MeasurementId,
} from "../src/ts/analytics/consent";
import { getSourceLinks, SourceLinks } from "./source-links";

const virtualModuleId = "virtual:env-config";
const resolvedVirtualModuleId = `\0${virtualModuleId}`;

function fallback(value: string | undefined | null, fallback: string): string {
  if (value === null || value === undefined || value === "") return fallback;
  return value;
}

function analyticsConfig(
  env: Record<string, string>,
): Pick<EnvConfig, "ga4MeasurementId" | "ga4ConsentRegions"> {
  return {
    ga4MeasurementId: resolveGa4MeasurementId(env["GA4_MEASUREMENT_ID"]),
    ga4ConsentRegions: consentRegionList(env["GA4_CONSENT_REGIONS"]),
  };
}

export function envConfig(options: {
  isDevelopment: boolean;
  clientVersion: string;
  env: Record<string, string>;
  sourceLinks?: SourceLinks;
}): Plugin {
  const { sourceUrl, licenseUrl } =
    options.sourceLinks ??
    getSourceLinks({ commitHash: undefined, mode: "github" });
  return {
    name: "virtual-env-config",
    resolveId(id) {
      if (id === virtualModuleId) return resolvedVirtualModuleId;
      return;
    },
    load(id) {
      if (id === resolvedVirtualModuleId) {
        // no BACKEND_URL => run without backend (no auth, api, leaderboards)
        const standalone = fallback(options.env["BACKEND_URL"], "") === "";

        const devConfig: EnvConfig = {
          isDevelopment: true,
          standalone,
          backendUrl: fallback(
            options.env["BACKEND_URL"],
            "http://localhost:5005",
          ),
          clientVersion: options.clientVersion,
          sourceUrl,
          licenseUrl,
          recaptchaSiteKey: "6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI",
          quickLoginEmail: options.env["QUICK_LOGIN_EMAIL"],
          quickLoginPassword: options.env["QUICK_LOGIN_PASSWORD"],
          ...analyticsConfig(options.env),
        };

        const prodConfig: EnvConfig = {
          isDevelopment: false,
          standalone,
          backendUrl: options.env["BACKEND_URL"] ?? "",
          recaptchaSiteKey: options.env["RECAPTCHA_SITE_KEY"] ?? "",
          quickLoginEmail: undefined,
          quickLoginPassword: undefined,
          clientVersion: options.clientVersion,
          sourceUrl,
          licenseUrl,
          ...analyticsConfig(options.env),
        };

        const envConfig = options.isDevelopment ? devConfig : prodConfig;
        return `
          export const envConfig = ${JSON.stringify(envConfig)};
        `;
      }
      return;
    },
  };
}
