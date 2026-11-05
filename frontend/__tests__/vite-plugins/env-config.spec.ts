import { describe, expect, it } from "vitest";

import { envConfig } from "../../vite-plugins/env-config";

type EnvConfig = {
  standalone: boolean;
  backendUrl: string;
  recaptchaSiteKey: string;
  ga4MeasurementId: string;
  ga4ConsentRegions: string[];
};

function load(env: Record<string, string>): EnvConfig {
  const plugin = envConfig({ isDevelopment: false, clientVersion: "v", env });
  const call = <T>(hook: unknown, ...args: unknown[]): T =>
    (hook as (...a: unknown[]) => T)(...args);
  const id = call<string>(plugin.resolveId, "virtual:env-config");
  const code = call<string>(plugin.load, id);
  const json = /envConfig = (\{.*\});/s.exec(code)?.[1] ?? "{}";
  return JSON.parse(json) as EnvConfig;
}

describe("env-config production build", () => {
  it("has no backend url and no captcha key without BACKEND_URL", () => {
    const cfg = load({});
    expect(cfg.standalone).toBe(true);
    expect(cfg.backendUrl).toBe("");
    expect(cfg.recaptchaSiteKey).toBe("");
    expect(cfg.ga4MeasurementId).toBe("");
    expect(cfg.ga4ConsentRegions).toContain("DE");
    expect(cfg.ga4ConsentRegions).toContain("GB");
    expect(cfg.ga4ConsentRegions).toContain("CH");
    expect(cfg.ga4ConsentRegions).not.toContain("US");
  });

  it("keeps a valid GA4 measurement id and extra consent regions", () => {
    const cfg = load({
      GA4_MEASUREMENT_ID: "G-TEST1234",
      GA4_CONSENT_REGIONS: "BR, UK",
    });
    expect(cfg.ga4MeasurementId).toBe("G-TEST1234");
    expect(cfg.ga4ConsentRegions).toContain("BR");
    expect(cfg.ga4ConsentRegions).toContain("GB");
  });

  it("rejects a malformed GA4 measurement id", () => {
    expect(() => load({ GA4_MEASUREMENT_ID: "UA-1" })).toThrow(
      /GA4_MEASUREMENT_ID/,
    );
  });

  it("uses BACKEND_URL when set", () => {
    const cfg = load({ BACKEND_URL: "https://api.example.test" });
    expect(cfg.standalone).toBe(false);
    expect(cfg.backendUrl).toBe("https://api.example.test");
  });
});
