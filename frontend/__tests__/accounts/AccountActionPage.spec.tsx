import { fireEvent, render } from "@solidjs/testing-library";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({
  LINK_INVALID: "link_invalid",
  checkResetLink: vi.fn(),
  finishPasswordReset: vi.fn(),
  applyVerifyEmailLink: vi.fn(),
  applyRecoverEmailLink: vi.fn(),
  requestPasswordReset: vi.fn(),
}));
vi.mock("../../src/ts/accounts/session", () => session);
vi.mock("../../src/ts/accounts/ui/TurnstileWidget", () => ({
  TurnstileWidget: (props: { onToken: (t: string) => void }) => {
    props.onToken("ts-token");
    return null;
  },
}));
vi.mock("../../src/ts/states/notifications", () => ({
  showErrorNotification: vi.fn(),
}));

import { captureActionLink } from "../../src/ts/accounts/action-link";
import { accountsCopy } from "../../src/ts/accounts/strings";
import { AccountActionPage } from "../../src/ts/accounts/ui/AccountActionPage";

const copy = accountsCopy.action;
const SECRET = "oob-SECRET-123";
const linkInvalid = {
  ok: false,
  code: "link_invalid",
  message: copy.linkInvalid,
};

/** lands on the emailed link, as the router does before the page renders */
function openLink(query: string): ReturnType<typeof render> {
  history.replaceState(null, "", `/account/action?${query}`);
  captureActionLink();
  return render(() => <AccountActionPage />);
}

function link(mode: string): string {
  return `mode=${mode}&oobCode=${SECRET}&continueUrl=${encodeURIComponent("https://evil.example/x")}&apiKey=k&lang=fr`;
}

function button(container: HTMLElement, text: string): HTMLButtonElement {
  const found = [...container.querySelectorAll("button")].find(
    (b) => b.textContent?.trim() === text,
  );
  if (found === undefined) throw new Error(`no button ${text}`);
  return found;
}

function type(container: HTMLElement, name: string, value: string): void {
  const input = container.querySelector<HTMLInputElement>(
    `input[name="${name}"]`,
  );
  if (input === null) throw new Error(`no input ${name}`);
  input.value = value;
  fireEvent.input(input);
}

let logs: unknown[][] = [];

beforeEach(() => {
  logs = [];
  for (const level of ["log", "info", "debug", "warn", "error"] as const) {
    vi.spyOn(console, level).mockImplementation((...args: unknown[]) => {
      logs.push(args);
    });
  }
});

afterEach(() => {
  // nothing the page did may have put the code anywhere
  expect(JSON.stringify(logs)).not.toContain(SECRET);
  expect(document.body.innerHTML).not.toContain(SECRET);
  expect(document.body.innerHTML).not.toContain("evil.example");
  expect(location.href).not.toContain(SECRET);
  vi.restoreAllMocks();
  vi.clearAllMocks();
  history.replaceState(null, "", "/");
});

describe("AccountActionPage: the link", () => {
  it("strips the query from the address bar before rendering", () => {
    history.replaceState(null, "", `/account/action?${link("verifyEmail")}#x`);
    captureActionLink();
    expect(location.pathname).toBe("/account/action");
    expect(location.search).toBe("");
    expect(location.hash).toBe("");
  });

  it("ignores continueUrl: no link or redirect to it", async () => {
    session.applyVerifyEmailLink.mockResolvedValue({ ok: true });
    const { container, findByText } = openLink(link("verifyEmail"));
    await findByText(copy.verifyDone);
    const hrefs = [...container.querySelectorAll("a")].map((a) =>
      a.getAttribute("href"),
    );
    expect(hrefs).toEqual(["/login"]);
    expect(location.pathname).toBe("/account/action");
  });

  it.each([
    ["an unknown mode", `mode=signIn&oobCode=${SECRET}`],
    ["no mode", `oobCode=${SECRET}`],
    ["no oobCode", "mode=resetPassword"],
  ])("%s: this link isn't valid, no Firebase call", async (_l, query) => {
    const { findByText } = openLink(query);
    await findByText(copy.notValid);
    for (const fn of Object.values(session)) {
      if (typeof fn === "function") expect(fn).not.toHaveBeenCalled();
    }
  });

  it("a visit with no captured link isn't valid either", async () => {
    history.replaceState(null, "", "/account/action");
    const { findByText } = render(() => <AccountActionPage />);
    await findByText(copy.notValid);
  });
});

describe("AccountActionPage: resetPassword", () => {
  beforeEach(() => {
    session.checkResetLink.mockResolvedValue({ ok: true });
    session.finishPasswordReset.mockResolvedValue({ ok: true });
  });

  it("checks the code, takes a new password, then links to sign in", async () => {
    const { container, findByText } = openLink(link("resetPassword"));
    await findByText(copy.resetTitle);
    expect(session.checkResetLink).toHaveBeenCalledWith(SECRET);
    expect(container.textContent).toContain(copy.passwordRule);
    type(container, "new-password", "longenough");
    type(container, "confirm-password", "longenough");
    fireEvent.click(button(container, copy.resetSubmit));
    await findByText(copy.resetDone);
    expect(session.finishPasswordReset).toHaveBeenCalledWith(
      SECRET,
      "longenough",
    );
    expect(container.querySelector('a[href="/login"]')).not.toBeNull();
  });

  it("a short password is refused here, never sent", async () => {
    const { container, findByText } = openLink(link("resetPassword"));
    await findByText(copy.resetTitle);
    type(container, "new-password", "short12");
    type(container, "confirm-password", "short12");
    fireEvent.click(button(container, copy.resetSubmit));
    expect(
      (await findByText(copy.passwordRule, { selector: "[role=alert]" }))
        .textContent,
    ).toBe(copy.passwordRule);
    expect(session.finishPasswordReset).not.toHaveBeenCalled();
  });

  it("the confirm field must match", async () => {
    const { container, findByText } = openLink(link("resetPassword"));
    await findByText(copy.resetTitle);
    type(container, "new-password", "longenough");
    type(container, "confirm-password", "longenougH");
    fireEvent.click(button(container, copy.resetSubmit));
    await findByText(copy.mismatch);
    expect(session.finishPasswordReset).not.toHaveBeenCalled();
  });

  it("invalid or expired code: friendly text and a way to a new reset link", async () => {
    session.checkResetLink.mockResolvedValue(linkInvalid);
    const { container, findByText } = openLink(link("resetPassword"));
    await findByText(copy.linkInvalid);
    expect(container.querySelector("input[name=new-password]")).toBeNull();
    fireEvent.click(button(container, copy.requestNewReset));
    await findByText(accountsCopy.reset.submit);
  });

  it("code expiring between check and save: same friendly text", async () => {
    session.finishPasswordReset.mockResolvedValue(linkInvalid);
    const { container, findByText } = openLink(link("resetPassword"));
    await findByText(copy.resetTitle);
    type(container, "new-password", "longenough");
    type(container, "confirm-password", "longenough");
    fireEvent.click(button(container, copy.resetSubmit));
    await findByText(copy.linkInvalid);
    expect(button(container, copy.requestNewReset)).toBeTruthy();
  });

  it("other failures stay on the form with their fixed message", async () => {
    session.finishPasswordReset.mockResolvedValue({
      ok: false,
      code: "",
      message: accountsCopy.firebaseFallback,
    });
    const { container, findByText } = openLink(link("resetPassword"));
    await findByText(copy.resetTitle);
    type(container, "new-password", "longenough");
    type(container, "confirm-password", "longenough");
    fireEvent.click(button(container, copy.resetSubmit));
    await findByText(accountsCopy.firebaseFallback);
    expect(container.querySelector("input[name=new-password]")).not.toBeNull();
  });
});

describe("AccountActionPage: verifyEmail and recoverEmail", () => {
  it("verifyEmail: applies the code, success and sign-in link", async () => {
    session.applyVerifyEmailLink.mockResolvedValue({ ok: true });
    const { container, findByText } = openLink(link("verifyEmail"));
    await findByText(copy.verifyDone);
    expect(session.applyVerifyEmailLink).toHaveBeenCalledWith(SECRET);
    expect(container.querySelector('a[href="/login"]')).not.toBeNull();
  });

  it("verifyEmail failure: the fixed message, no reset offer", async () => {
    session.applyVerifyEmailLink.mockResolvedValue(linkInvalid);
    const { container, findByText } = openLink(link("verifyEmail"));
    await findByText(copy.linkInvalid);
    expect(container.textContent).not.toContain(copy.requestNewReset);
  });

  it("recoverEmail: success tells them to reset their password if needed", async () => {
    session.applyRecoverEmailLink.mockResolvedValue({ ok: true });
    const { findByText } = openLink(link("recoverEmail"));
    await findByText(copy.recoverDone);
    expect(copy.recoverDone).toMatch(/reset your password/);
    expect(session.applyRecoverEmailLink).toHaveBeenCalledWith(SECRET);
  });

  it("recoverEmail failure: the fixed message", async () => {
    session.applyRecoverEmailLink.mockResolvedValue({
      ok: false,
      code: "",
      message: accountsCopy.firebaseFallback,
    });
    const { findByText } = openLink(link("recoverEmail"));
    await findByText(accountsCopy.firebaseFallback);
  });
});
