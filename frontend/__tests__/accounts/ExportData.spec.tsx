import { fireEvent, render } from "@solidjs/testing-library";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ callWithIdToken: vi.fn() }));
vi.mock("../../src/ts/accounts/session", () => session);

import { exportMyData } from "../../src/ts/accounts/api";
import { accountsCopy } from "../../src/ts/accounts/strings";
import { ExportData } from "../../src/ts/accounts/ui/ExportData";

const copy = accountsCopy.exportData;
const data = { format: 1, exportedAt: "2026-11-19T00:00:00.000Z", results: [] };

let createObjectURL: ReturnType<typeof vi.fn>;
let revokeObjectURL: ReturnType<typeof vi.fn>;
let clicked: { href: string; download: string; attached: boolean }[];

function button(container: HTMLElement): HTMLButtonElement {
  const found = container.querySelector("button");
  if (found === null) throw new Error("no button");
  return found;
}

beforeEach(() => {
  createObjectURL = vi.fn(() => "blob:export-1");
  revokeObjectURL = vi.fn();
  vi.stubGlobal(
    "URL",
    Object.assign(URL, { createObjectURL, revokeObjectURL }),
  );
  clicked = [];
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    clicked.push({
      href: this.getAttribute("href") ?? "",
      download: this.download,
      attached: this.isConnected,
    });
  });
});

const realUrl = {
  createObjectURL: URL.createObjectURL,
  revokeObjectURL: URL.revokeObjectURL,
};

/** jsdom's Blob has no text() */
async function blobText(blob: Blob): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.readAsText(blob);
  });
}

afterEach(() => {
  Object.assign(URL, realUrl);
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("ExportData", () => {
  it("downloads the export as puggietype-data.json and revokes the url", async () => {
    session.callWithIdToken.mockResolvedValue({ ok: true, data });
    const { container } = render(() => <ExportData />);
    expect(button(container).textContent?.trim()).toBe(copy.button);
    fireEvent.click(button(container));
    await vi.waitFor(() => expect(clicked).toHaveLength(1));
    expect(session.callWithIdToken).toHaveBeenCalledWith(exportMyData);
    expect(clicked[0]).toEqual({
      href: "blob:export-1",
      download: "puggietype-data.json",
      attached: true,
    });
    const blob = createObjectURL.mock.calls[0]?.[0] as Blob;
    expect(blob.type).toBe("application/json");
    expect(JSON.parse(await blobText(blob))).toEqual(data);
    await vi.waitFor(() =>
      expect(revokeObjectURL).toHaveBeenCalledWith("blob:export-1"),
    );
    // the temporary link is gone
    expect(document.body.getElementsByTagName("a")).toHaveLength(0);
  });

  it("busy while the export loads; one request per click", async () => {
    let resolve: (v: unknown) => void = () => undefined;
    session.callWithIdToken.mockReturnValue(new Promise((r) => (resolve = r)));
    const { container } = render(() => <ExportData />);
    fireEvent.click(button(container));
    expect(button(container).disabled).toBe(true);
    expect(button(container).textContent?.trim()).toBe(copy.busy);
    fireEvent.click(button(container));
    expect(session.callWithIdToken).toHaveBeenCalledTimes(1);
    resolve({ ok: true, data });
    await vi.waitFor(() => expect(button(container).disabled).toBe(false));
  });

  it("an API error shows its fixed message and saves nothing", async () => {
    session.callWithIdToken.mockResolvedValue({
      ok: false,
      status: 404,
      code: "no_account",
      message: accountsCopy.api.noAccount,
    });
    const { container, findByRole } = render(() => <ExportData />);
    fireEvent.click(button(container));
    expect((await findByRole("alert")).textContent).toBe(
      accountsCopy.api.noAccount,
    );
    expect(createObjectURL).not.toHaveBeenCalled();
    expect(clicked).toEqual([]);
    expect(button(container).disabled).toBe(false);
  });

  it("a throw shows the generic message", async () => {
    session.callWithIdToken.mockRejectedValue(new Error("boom"));
    const { container, findByRole } = render(() => <ExportData />);
    fireEvent.click(button(container));
    expect((await findByRole("alert")).textContent).toBe(
      accountsCopy.api.badResponse,
    );
  });
});
