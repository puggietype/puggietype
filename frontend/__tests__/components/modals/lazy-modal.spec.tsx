import { render } from "@solidjs/testing-library";
import { JSXElement } from "solid-js";
import { describe, expect, it, vi } from "vitest";

import { lazyModal } from "../../../src/ts/components/modals/lazy-modal";
import {
  getModalVisibility,
  hideModalAndClearChain,
  showModal,
} from "../../../src/ts/states/modals";

function Fake(): JSXElement {
  return <div data-testid="fake-modal">fake</div>;
}

describe("lazyModal", () => {
  it("loads nothing until one of its ids is requested, then stays mounted", async () => {
    const load = vi.fn(async () => ({ Fake }));
    const Modal = lazyModal(["QuoteRate", "QuoteReport"], load, "Fake");
    const { queryByTestId, findByTestId } = render(() => <Modal />);

    expect(load).not.toHaveBeenCalled();
    expect(queryByTestId("fake-modal")).toBeNull();

    showModal("QuoteReport");
    expect(await findByTestId("fake-modal")).toBeTruthy();
    expect(load).toHaveBeenCalledOnce();

    hideModalAndClearChain("QuoteReport");
    expect(queryByTestId("fake-modal")).not.toBeNull();
  });
});

describe("lazyModal load failure", () => {
  it("closes the modal instead of leaving it open in the store", async () => {
    const Modal = lazyModal(
      ["PbTables"],
      async () => Promise.reject(new Error("chunk 404")),
      "Nope",
    );
    render(() => <Modal />);
    showModal("PbTables");
    await vi.waitFor(() => {
      expect(getModalVisibility("PbTables")?.visible).toBe(false);
    });
  });
});
