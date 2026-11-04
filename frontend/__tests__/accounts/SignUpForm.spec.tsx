import { fireEvent, render } from "@solidjs/testing-library";
import { afterEach, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({
  signUp: vi.fn(),
  completeAgeCheck: vi.fn(),
  cancelAgeCheck: vi.fn(),
}));
vi.mock("../../src/ts/accounts/session", () => session);
// stands in for Cloudflare: hands out a token right away
vi.mock("../../src/ts/accounts/ui/TurnstileWidget", () => ({
  TurnstileWidget: (props: { onToken: (t: string) => void }) => {
    props.onToken("ts-token");
    return null;
  },
}));

import { AGE_BLOCK_KEY } from "../../src/ts/accounts/age";
import { AgeCheckPrompt } from "../../src/ts/accounts/ui/AgeCheckPrompt";
import { SignUpForm } from "../../src/ts/accounts/ui/SignUpForm";

const thisYear = new Date().getFullYear();

function pickYear(container: HTMLElement, year: number): HTMLSelectElement {
  const select = container.querySelector("select");
  if (select === null) throw new Error("no birth year select");
  select.value = String(year);
  fireEvent.change(select);
  return select;
}

function button(container: HTMLElement, text: string): HTMLButtonElement {
  const found = [...container.querySelectorAll("button")].find((b) =>
    b.textContent?.includes(text),
  );
  if (found === undefined) throw new Error(`no button ${text}`);
  return found;
}

afterEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
});

describe("SignUpForm birth year", () => {
  const renderForm = (): ReturnType<typeof render> & {
    onResult: ReturnType<typeof vi.fn>;
    onBlocked: ReturnType<typeof vi.fn>;
  } => {
    const onResult = vi.fn();
    const onBlocked = vi.fn();
    const view = render(() => (
      <SignUpForm onResult={onResult} onBlocked={onBlocked} />
    ));
    return { ...view, onResult, onBlocked };
  };

  it("starts blank, lists plain years only, nothing disabled", () => {
    const { container } = renderForm();
    const select = container.querySelector("select");
    expect(select?.value).toBe("");
    const options = [...(select?.options ?? [])];
    expect(options[0]?.value).toBe("");
    expect(options).toHaveLength(102);
    for (const option of options.slice(1)) {
      expect(option.textContent).toMatch(/^\d{4}$/);
      expect(option.disabled).toBe(false);
    }
    expect(button(container, "sign up with google").disabled).toBe(true);
  });

  it("13+: signs up with the method and token only, then drops the year", async () => {
    session.signUp.mockResolvedValue({ status: "signed-in", created: true });
    const { container, onResult } = renderForm();
    const select = pickYear(container, thisYear - 30);
    fireEvent.click(button(container, "sign up with google"));
    await vi.waitFor(() => expect(onResult).toHaveBeenCalled());
    expect(session.signUp).toHaveBeenCalledWith({ kind: "google" }, "ts-token");
    expect(select.value).toBe("");
    expect(sessionStorage.getItem(AGE_BLOCK_KEY)).toBeNull();
  });

  it("under 13: no sign-up at all, tab blocked", () => {
    const { container, onBlocked } = renderForm();
    pickYear(container, thisYear - 5);
    fireEvent.click(button(container, "sign up with google"));
    expect(session.signUp).not.toHaveBeenCalled();
    expect(onBlocked).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem(AGE_BLOCK_KEY)).toBe("1");
  });
});

describe("AgeCheckPrompt", () => {
  it("sends only the 13+ boolean to completeAgeCheck", async () => {
    session.completeAgeCheck.mockResolvedValue({ status: "signed-in" });
    const onResult = vi.fn();
    const { container } = render(() => (
      <AgeCheckPrompt onResult={onResult} onCancel={vi.fn()} />
    ));
    expect(button(container, "continue").disabled).toBe(true);
    pickYear(container, thisYear - 8);
    fireEvent.click(button(container, "continue"));
    await vi.waitFor(() => expect(onResult).toHaveBeenCalled());
    expect(session.completeAgeCheck).toHaveBeenCalledWith(false, "ts-token");
  });

  it("cancel backs out", async () => {
    session.cancelAgeCheck.mockResolvedValue(undefined);
    const onCancel = vi.fn();
    const { container } = render(() => (
      <AgeCheckPrompt onResult={vi.fn()} onCancel={onCancel} />
    ));
    fireEvent.click(button(container, "cancel"));
    await vi.waitFor(() => expect(onCancel).toHaveBeenCalled());
    expect(session.cancelAgeCheck).toHaveBeenCalledTimes(1);
  });
});
