import { createSignal, JSXElement, untrack } from "solid-js";

import { Button } from "../../components/common/Button";
import { PugHead } from "../../components/common/PugHead";
import { cn } from "../../utils/cn";
import { normalizeRoomCode } from "../helpers";
import { connect, createRoom, joinRoom } from "../race";
import { connectionStatus, loadNickname, saveNickname } from "../store";
import { PRIMARY_BUTTON } from "./ui";

const CARD = "grid gap-3 rounded-lg bg-sub-alt p-6";
const LABEL = "text-sm tracking-wide text-sub";
const INPUT =
  "w-full rounded bg-bg px-4 py-3 font-(--font) text-text placeholder:text-sub";

export function RaceHome(props: { code?: string }): JSXElement {
  const [name, setName] = createSignal(loadNickname());
  // initial value only, the field is user-editable afterwards
  const [code, setCode] = createSignal(untrack(() => props.code) ?? "");

  const validName = (): string | undefined => {
    const trimmed = name().trim();
    return trimmed.length > 0 && trimmed.length <= 24 ? trimmed : undefined;
  };
  const validCode = (): string | undefined => normalizeRoomCode(code());
  const busy = (): boolean => connectionStatus() === "connecting";

  const withName = (action: () => void): void => {
    const n = validName();
    if (n === undefined) return;
    saveNickname(n);
    connect(n);
    action();
  };

  return (
    <div class="grid gap-6 md:grid-cols-[3fr_2fr]">
      <div class="grid content-start gap-6">
        <section class={CARD}>
          <label class={LABEL} for="mpNickname">
            nickname
          </label>
          <input
            id="mpNickname"
            class={INPUT}
            data-testid="mp-nickname"
            maxLength={24}
            placeholder="your name"
            value={name()}
            onInput={(e) => setName(e.currentTarget.value)}
          />
        </section>
        <section class={CARD}>
          <div class={LABEL}>private match</div>
          <div class="flex flex-wrap items-center justify-between gap-4">
            <div class="text-sub">race up to 4 friends with an invite link</div>
            <Button
              text="create private lobby"
              fa={{ icon: "fa-plus" }}
              class={cn(PRIMARY_BUTTON, "px-5 py-3")}
              disabled={validName() === undefined || busy()}
              dataset={{ "data-testid": "mp-create" }}
              onClick={() => withName(() => createRoom())}
            />
          </div>
        </section>
        <section class={CARD}>
          <label class={LABEL} for="mpJoinCode">
            join by code
          </label>
          <form
            class="flex gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              const c = validCode();
              if (c !== undefined) withName(() => joinRoom(c));
            }}
          >
            <input
              id="mpJoinCode"
              class={`${INPUT} text-xl tracking-[0.3em] uppercase`}
              data-testid="mp-join-code"
              maxLength={7}
              placeholder="ABC234"
              value={code()}
              onInput={(e) => setCode(e.currentTarget.value)}
            />
            <Button
              type="submit"
              text="join"
              fa={{ icon: "fa-sign-in-alt" }}
              class={cn(PRIMARY_BUTTON, "px-5")}
              disabled={
                validName() === undefined || validCode() === undefined || busy()
              }
              dataset={{ "data-testid": "mp-join" }}
            />
          </form>
        </section>
        <section class={CARD}>
          <div class={LABEL}>quick play</div>
          <div class="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div class="text-lg text-text">public match</div>
              <div class="text-sm font-(--font) text-sub">coming soon</div>
            </div>
            <Button
              text="find match"
              fa={{ icon: "fa-globe" }}
              disabled
              dataset={{ "data-testid": "mp-public" }}
            />
          </div>
        </section>
      </div>
      <section class="hidden content-center justify-items-center gap-4 rounded-lg bg-sub-alt p-6 text-center text-sub md:grid">
        <PugHead class="h-24 w-24 text-main" />
        <div class="text-2xl text-text">race your friends</div>
        <div>
          same words, same settings, live carets. first to the finish (or the
          fastest in time mode) wins.
        </div>
      </section>
    </div>
  );
}
