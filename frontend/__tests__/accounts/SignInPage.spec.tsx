import { fireEvent, render } from "@solidjs/testing-library";
import { afterEach, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({
  AGE_BLOCKED: "age_blocked",
  preloadSdk: vi.fn(),
  signIn: vi.fn(),
  signUp: vi.fn(),
  signOut: vi.fn(),
  completeAgeCheck: vi.fn(),
  cancelAgeCheck: vi.fn(),
}));
vi.mock("../../src/ts/accounts/session", () => session);
vi.mock("../../src/ts/accounts/ui/TurnstileWidget", () => ({
  TurnstileWidget: (props: { onToken: (t: string) => void }) => {
    props.onToken("ts-token");
    return null;
  },
}));
const notify = vi.hoisted(() => ({
  showErrorNotification: vi.fn(),
  showSuccessNotification: vi.fn(),
}));
vi.mock("../../src/ts/states/notifications", () => notify);

import { AGE_BLOCK_KEY } from "../../src/ts/accounts/age";
import { setAccountUser } from "../../src/ts/accounts/state";
import { accountsCopy } from "../../src/ts/accounts/strings";
import { SignInPage } from "../../src/ts/accounts/ui/SignInPage";

function button(container: HTMLElement, text: string): HTMLButtonElement {
  const found = [...container.querySelectorAll("button")].find(
    (b) => b.textContent?.trim() === text,
  );
  if (found === undefined) throw new Error(`no button ${text}`);
  return found;
}

afterEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  sessionStorage.clear();
  setAccountUser(null);
});

describe("SignInPage", () => {
  it("Google sign-in that needs the age answer shows the question", async () => {
    session.signIn.mockResolvedValue({ status: "needs-age" });
    const { container, findByText } = render(() => <SignInPage />);
    expect(container.querySelector("select")).toBeNull();
    fireEvent.click(button(container, "google"));
    expect(await findByText(accountsCopy.age.prompt)).toBeTruthy();
    expect(container.querySelector("select")?.value).toBe("");
  });

  it("an under-13 result shows the neutral blocked text", async () => {
    session.signIn.mockResolvedValue({
      status: "error",
      code: "age_blocked",
      message: accountsCopy.age.blocked,
    });
    const { container, findByText } = render(() => <SignInPage />);
    fireEvent.click(button(container, "google"));
    expect(await findByText(accountsCopy.age.blocked)).toBeTruthy();
    expect(notify.showErrorNotification).not.toHaveBeenCalled();
  });

  it("a blocked device (any tab) gets no sign-up form", () => {
    localStorage.setItem(AGE_BLOCK_KEY, "1");
    const { container, getByText } = render(() => <SignInPage />);
    fireEvent.click(button(container, accountsCopy.tabs.signUp));
    expect(getByText(accountsCopy.age.blocked)).toBeTruthy();
    expect(container.querySelector("select")).toBeNull();
  });

  it("signed in: verify notice, sign out and delete account", () => {
    session.signOut.mockResolvedValue(undefined);
    setAccountUser({
      uid: "u1",
      displayName: "Sleepy Pug 42",
      emailVerified: false,
      ageOk: true,
      lbListed: false,
      verifiedTypist: false,
      status: "active",
      createdAt: "2026-11-04T00:00:00.000Z",
    });
    const { container, getByText } = render(() => <SignInPage />);
    expect(getByText(accountsCopy.verify.notice)).toBeTruthy();
    expect(button(container, accountsCopy.account.delete)).toBeTruthy();
    fireEvent.click(button(container, accountsCopy.signedIn.signOut));
    expect(session.signOut).toHaveBeenCalledTimes(1);
    // the uid and pug name are not shown
    expect(container.textContent).not.toContain("u1");
  });

  it("other errors go to a notification", async () => {
    session.signIn.mockResolvedValue({
      status: "error",
      code: "turnstile_failed",
      message: "nope",
    });
    const { container } = render(() => <SignInPage />);
    fireEvent.click(button(container, "google"));
    await vi.waitFor(() =>
      expect(notify.showErrorNotification).toHaveBeenCalledWith("nope"),
    );
  });
});
