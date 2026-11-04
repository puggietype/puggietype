import { fireEvent, render } from "@solidjs/testing-library";
import { afterEach, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({
  requestPasswordReset: vi.fn(),
  resendVerification: vi.fn(),
  refreshVerification: vi.fn(),
}));
vi.mock("../../src/ts/accounts/session", () => session);
const turnstile = vi.hoisted(() => ({ token: "ts-token" as string | null }));
vi.mock("../../src/ts/accounts/ui/TurnstileWidget", () => ({
  TurnstileWidget: (props: {
    action: string;
    onToken: (t: string | null) => void;
  }) => {
    props.onToken(turnstile.token);
    return <div data-turnstile-action={props.action} />;
  },
}));
const notify = vi.hoisted(() => ({
  showErrorNotification: vi.fn(),
  showNoticeNotification: vi.fn(),
  showSuccessNotification: vi.fn(),
}));
vi.mock("../../src/ts/states/notifications", () => notify);

import { accountsCopy } from "../../src/ts/accounts/strings";
import { ResetPasswordForm } from "../../src/ts/accounts/ui/ResetPasswordForm";
import {
  RESEND_COOLDOWN_MS,
  VerifyEmailNotice,
} from "../../src/ts/accounts/ui/VerifyEmailNotice";

function button(container: HTMLElement, text: string): HTMLButtonElement {
  const found = [...container.querySelectorAll("button")].find(
    (b) => b.textContent?.trim() === text,
  );
  if (found === undefined) throw new Error(`no button ${text}`);
  return found;
}

afterEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
  turnstile.token = "ts-token";
});

describe("ResetPasswordForm", () => {
  const typeEmail = (container: HTMLElement, value: string): void => {
    const input = container.querySelector("input");
    if (input === null) throw new Error("no email input");
    input.value = value;
    fireEvent.input(input);
  };

  it("has Turnstile and shows the neutral sent text", async () => {
    session.requestPasswordReset.mockResolvedValue({ ok: true });
    const { container, findByText } = render(() => (
      <ResetPasswordForm onBack={vi.fn()} />
    ));
    expect(
      container.querySelector('[data-turnstile-action="reset"]'),
    ).not.toBeNull();
    typeEmail(container, "a@b.test");
    fireEvent.submit(container.querySelector("form") as HTMLFormElement);
    expect(await findByText(accountsCopy.reset.sent)).toBeTruthy();
    expect(session.requestPasswordReset).toHaveBeenCalledWith("a@b.test");
  });

  it("can't submit without a Turnstile token", async () => {
    turnstile.token = null;
    const { container } = render(() => <ResetPasswordForm onBack={vi.fn()} />);
    typeEmail(container, "a@b.test");
    expect(button(container, accountsCopy.reset.submit).disabled).toBe(true);
    fireEvent.submit(container.querySelector("form") as HTMLFormElement);
    await Promise.resolve();
    expect(session.requestPasswordReset).not.toHaveBeenCalled();
  });
});

describe("VerifyEmailNotice", () => {
  it("resend then cools down", async () => {
    vi.useFakeTimers();
    session.resendVerification.mockResolvedValue({ ok: true });
    const { container } = render(() => <VerifyEmailNotice />);
    const resend = button(container, accountsCopy.verify.resend);
    fireEvent.click(resend);
    await vi.waitFor(() =>
      expect(notify.showSuccessNotification).toHaveBeenCalledWith(
        accountsCopy.verify.resent,
      ),
    );
    expect(resend.disabled).toBe(true);
    vi.advanceTimersByTime(RESEND_COOLDOWN_MS);
    expect(resend.disabled).toBe(false);
  });

  it("check again reports the result", async () => {
    session.refreshVerification.mockResolvedValue(false);
    const { container } = render(() => <VerifyEmailNotice />);
    fireEvent.click(button(container, accountsCopy.verify.check));
    await vi.waitFor(() =>
      expect(notify.showNoticeNotification).toHaveBeenCalledWith(
        accountsCopy.verify.stillUnverified,
      ),
    );
  });
});
