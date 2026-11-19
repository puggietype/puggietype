import { render } from "@solidjs/testing-library";
import { afterEach, describe, expect, it, vi } from "vitest";

// the real TurnstileWidget, with Cloudflare's script stood in for
const turnstile = vi.hoisted(() => ({
  loadTurnstile: vi.fn(async () => ({
    render: vi.fn(() => "widget-1"),
    reset: vi.fn(),
    remove: vi.fn(),
  })),
}));
vi.mock("../../src/ts/accounts/turnstile", () => turnstile);
vi.mock("../../src/ts/accounts/session", () => ({
  signIn: vi.fn(),
  signUp: vi.fn(),
  completeAgeCheck: vi.fn(),
  cancelAgeCheck: vi.fn(),
  requestPasswordReset: vi.fn(),
}));
vi.mock("../../src/ts/accounts/config", async (importOriginal) => {
  const real =
    await importOriginal<typeof import("../../src/ts/accounts/config")>();
  return {
    ...real,
    getAccountsConfig: () =>
      real.parseAccountsConfig({ VITE_TURNSTILE_SITE_KEY: "site-key" }),
  };
});
vi.mock("../../src/ts/states/notifications", () => ({
  showErrorNotification: vi.fn(),
}));

import { JSXElement } from "solid-js";

import { accountsCopy } from "../../src/ts/accounts/strings";
import { AgeCheckPrompt } from "../../src/ts/accounts/ui/AgeCheckPrompt";
import { ResetPasswordForm } from "../../src/ts/accounts/ui/ResetPasswordForm";
import { SignInForm } from "../../src/ts/accounts/ui/SignInForm";
import { SignUpForm } from "../../src/ts/accounts/ui/SignUpForm";

const NOTICE =
  "This form uses Cloudflare Turnstile to check that you're not a bot. It reads signals such as your IP address and browser details. Privacy Policy";

afterEach(() => vi.clearAllMocks());

describe("Turnstile notice (Legal C7)", () => {
  it.each<[string, () => JSXElement]>([
    [
      "sign in",
      () => <SignInForm onResult={vi.fn()} onForgotPassword={vi.fn()} />,
    ],
    [
      "create account",
      () => <SignUpForm onResult={vi.fn()} onBlocked={vi.fn()} />,
    ],
    [
      "age prompt",
      () => <AgeCheckPrompt onResult={vi.fn()} onCancel={vi.fn()} />,
    ],
  ])("%s: every widget is followed by the notice", async (_name, form) => {
    const { container } = render(form);
    await vi.waitFor(() =>
      expect(turnstile.loadTurnstile).toHaveBeenCalledTimes(1),
    );
    const widgets = container.querySelectorAll('[data-testid="turnstile"]');
    expect(widgets).toHaveLength(1);
    for (const widget of widgets) {
      const notice = widget.nextElementSibling;
      expect(notice?.getAttribute("data-testid")).toBe("turnstile-notice");
      expect(notice?.textContent).toBe(NOTICE);
      const links = [...(notice?.querySelectorAll("a") ?? [])];
      expect(
        links.map((a) => [
          a.textContent,
          a.getAttribute("href"),
          a.getAttribute("target"),
          a.getAttribute("rel"),
        ]),
      ).toEqual([
        [
          accountsCopy.turnstile.notice.privacy,
          "/privacy#accounts-ages-13",
          "_blank",
          "noopener",
        ],
      ]);
    }
    expect(
      container.querySelectorAll('[data-testid="turnstile-notice"]'),
    ).toHaveLength(widgets.length);
  });

  it("reset password: no widget, so no notice (Legal M2)", async () => {
    const { container } = render(() => <ResetPasswordForm onBack={vi.fn()} />);
    await Promise.resolve();
    expect(turnstile.loadTurnstile).not.toHaveBeenCalled();
    expect(container.querySelector('[data-testid="turnstile"]')).toBeNull();
    expect(
      container.querySelector('[data-testid="turnstile-notice"]'),
    ).toBeNull();
  });
});
