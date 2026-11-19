import { fireEvent, render } from "@solidjs/testing-library";
import { afterEach, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({
  deleteAccount: vi.fn(),
  getReauthKind: vi.fn(),
}));
vi.mock("../../src/ts/accounts/session", () => session);
const notify = vi.hoisted(() => ({
  showErrorNotification: vi.fn(),
  showSuccessNotification: vi.fn(),
}));
vi.mock("../../src/ts/states/notifications", () => notify);

import { accountsCopy } from "../../src/ts/accounts/strings";
import { DeleteAccount } from "../../src/ts/accounts/ui/DeleteAccount";

function button(container: HTMLElement, text: string): HTMLButtonElement {
  const found = [...container.querySelectorAll("button")].find(
    (b) => b.textContent?.trim() === text,
  );
  if (found === undefined) throw new Error(`no button ${text}`);
  return found;
}

afterEach(() => vi.clearAllMocks());

describe("DeleteAccount", () => {
  it("nothing happens without the confirm step", () => {
    const { container } = render(() => <DeleteAccount />);
    expect(container.textContent).not.toContain(accountsCopy.account.warning);
    fireEvent.click(button(container, accountsCopy.account.delete));
    expect(container.textContent).toContain(accountsCopy.account.warning);
    expect(session.deleteAccount).not.toHaveBeenCalled();
  });

  it("password users confirm with their password", async () => {
    session.getReauthKind.mockResolvedValue("password");
    session.deleteAccount.mockResolvedValue({ ok: true });
    const { container, findByText } = render(() => <DeleteAccount />);
    fireEvent.click(button(container, accountsCopy.account.delete));
    await findByText(accountsCopy.account.confirmPassword);
    const confirm = button(container, accountsCopy.account.confirm);
    expect(confirm.disabled).toBe(true);

    const input = container.querySelector<HTMLInputElement>(
      'input[type="password"]',
    );
    if (input === null) throw new Error("no password input");
    input.value = "pw";
    fireEvent.input(input);
    expect(confirm.disabled).toBe(false);
    fireEvent.click(confirm);
    await vi.waitFor(() =>
      expect(notify.showSuccessNotification).toHaveBeenCalledWith(
        accountsCopy.account.deleted,
      ),
    );
    expect(session.deleteAccount).toHaveBeenCalledWith("pw");
    expect(input.value).toBe("");
  });

  it("Google users confirm with the popup", async () => {
    session.getReauthKind.mockResolvedValue("google");
    session.deleteAccount.mockResolvedValue({ ok: false, message: "nope" });
    const { container, findByText } = render(() => <DeleteAccount />);
    fireEvent.click(button(container, accountsCopy.account.delete));
    await findByText(accountsCopy.account.confirmGoogle);
    fireEvent.click(button(container, accountsCopy.account.confirm));
    await vi.waitFor(() =>
      expect(notify.showErrorNotification).toHaveBeenCalledWith("nope"),
    );
    expect(session.deleteAccount).toHaveBeenCalledWith(undefined);
  });

  it("cancel goes back", async () => {
    session.getReauthKind.mockResolvedValue("google");
    const { container } = render(() => <DeleteAccount />);
    fireEvent.click(button(container, accountsCopy.account.delete));
    fireEvent.click(button(container, accountsCopy.account.cancel));
    expect(container.textContent).not.toContain(accountsCopy.account.warning);
    expect(session.deleteAccount).not.toHaveBeenCalled();
  });
});
