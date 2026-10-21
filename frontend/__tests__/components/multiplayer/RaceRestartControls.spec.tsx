import { cleanup, fireEvent, render, screen } from "@solidjs/testing-library";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../src/ts/test/test-logic", () => ({
  onRestartButtonClick: vi.fn(),
}));
// states/test loads keyboard layouts on import
vi.mock("../../../src/ts/utils/json-data", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getLayout: vi.fn(async () => ({ keys: {} })),
}));

const Hooks = await import("../../../src/ts/multiplayer/engine-hooks");
const { onRestartButtonClick } =
  await import("../../../src/ts/test/test-logic");
const { Keytips } =
  await import("../../../src/ts/components/layout/footer/Keytips");
const { RestartTestButton } =
  await import("../../../src/ts/components/pages/test/RestartTestButton");

// the dom harness mocks document.querySelector
const restartButton = (): HTMLElement | null =>
  document.body.querySelector("[data-ui-element='restartTestButton']");

describe("restart controls", () => {
  afterEach(() => {
    cleanup();
    Hooks.setRaceRestartLocked(false);
    vi.mocked(onRestartButtonClick).mockClear();
  });

  it("solo: restart button renders and restarts", () => {
    render(() => <RestartTestButton />);
    const button = restartButton();
    expect(button).not.toBeNull();
    fireEvent.click(button as HTMLElement);
    expect(onRestartButtonClick).toHaveBeenCalledTimes(1);
  });

  it("multiplayer: no restart button (nothing to Tab to or click)", () => {
    Hooks.setRaceRestartLocked(true);
    render(() => <RestartTestButton />);
    expect(restartButton()).toBeNull();
  });

  it("restart button goes when a race locks and comes back after", () => {
    render(() => <RestartTestButton />);
    expect(restartButton()).not.toBeNull();
    Hooks.setRaceRestartLocked(true);
    expect(restartButton()).toBeNull();
    Hooks.setRaceRestartLocked(false);
    expect(restartButton()).not.toBeNull();
  });

  it("solo: keytips show the restart tip", () => {
    render(() => <Keytips />);
    expect(screen.getByTestId("keytip-restart")).toHaveTextContent(
      "restart test",
    );
    expect(screen.getByText("- command line")).toBeInTheDocument();
  });

  it("multiplayer: keytips drop the restart tip, keep the command line", () => {
    Hooks.setRaceRestartLocked(true);
    render(() => <Keytips />);
    expect(screen.queryByTestId("keytip-restart")).toBeNull();
    expect(screen.queryByText(/restart/)).toBeNull();
    expect(screen.getByText("- command line")).toBeInTheDocument();
  });
});
