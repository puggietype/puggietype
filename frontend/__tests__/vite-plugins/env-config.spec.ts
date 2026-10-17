import { describe, expect, it } from "vitest";

import { envConfig } from "../../vite-plugins/env-config";

type EnvConfig = {
  standalone: boolean;
  backendUrl: string;
  recaptchaSiteKey: string;
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
  });

  it("uses BACKEND_URL when set", () => {
    const cfg = load({ BACKEND_URL: "https://api.example.test" });
    expect(cfg.standalone).toBe(false);
    expect(cfg.backendUrl).toBe("https://api.example.test");
  });
});
