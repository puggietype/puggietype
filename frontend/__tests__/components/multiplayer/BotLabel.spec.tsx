import { cleanup, render } from "@solidjs/testing-library";
import { afterEach, describe, expect, it } from "vitest";

import { BotLabel } from "../../../src/ts/multiplayer/components/BotLabel";
import { PlayerName } from "../../../src/ts/multiplayer/components/PlayerName";

describe("BotLabel", () => {
  afterEach(() => cleanup());

  it("shows a visible 'Bot' text label with an aria-label", () => {
    const { getByTestId, getByLabelText } = render(() => <BotLabel />);
    const label = getByTestId("mp-bot-label");
    expect(label).toHaveTextContent("🤖");
    expect(label).toHaveTextContent("Bot");
    expect(label).toHaveAttribute(
      "aria-label",
      "Bot: computer-controlled player; ~ means approximate speed",
    );
    expect(
      getByLabelText(
        "Bot: computer-controlled player; ~ means approximate speed",
      ),
    ).toBe(label);
  });
});

describe("PlayerName", () => {
  afterEach(() => cleanup());

  it("badges bot players", () => {
    const { container, getByTestId } = render(() => (
      <PlayerName player={{ name: "Pug Bot · ~80 wpm", isBot: true }} />
    ));
    expect(getByTestId("mp-bot-label")).toHaveTextContent("Bot");
    expect(container).toHaveTextContent("Pug Bot · ~80 wpm");
  });

  it("renders nothing extra for humans or legacy players", () => {
    const { container, queryByTestId } = render(() => (
      <>
        <PlayerName player={{ name: "ZippyPug42", isBot: false }} />
        <PlayerName player={{ name: "BouncyPug11" }} />
      </>
    ));
    expect(queryByTestId("mp-bot-label")).toBeNull();
    expect(container.textContent).toBe("ZippyPug42BouncyPug11");
  });
});
