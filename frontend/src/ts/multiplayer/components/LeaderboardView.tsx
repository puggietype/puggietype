import { format } from "date-fns/format";
import {
  createEffect,
  createSignal,
  For,
  JSXElement,
  onCleanup,
  Show,
} from "solid-js";

import { Button } from "../../components/common/Button";
import { LoadingCircle } from "../../components/common/LoadingCircle";
import { getTheme } from "../../states/theme";
import { cn } from "../../utils/cn";
import { readStoredSession } from "../client";
import {
  currentLeaderboardBase,
  defaultLeaderboardQuery,
  fetchLeaderboard,
  leaderboardMatchesBoard,
  LEADERBOARD_PERIODS,
  type LeaderboardMode,
  type LeaderboardOk,
  type LeaderboardPeriod,
  type LeaderboardQuery,
} from "../leaderboards";
import { DEFAULT_MODE2, TIME_MODE2, WORDS_MODE2 } from "../protocol";
import { selfHighlight, selfPillText } from "../self-highlight";
import { leaderboardsOn } from "../store";
import { LANGUAGES } from "./ui";

const SELF_TINT =
  "bg-[color-mix(in_srgb,var(--main-color)_var(--self-tint),transparent)]";
const SELF_BAR = "shadow-[inset_4px_0_0_var(--main-color)]";

type LoadState =
  | { kind: "loading" }
  | { kind: "error"; error: string }
  | { kind: "ready"; data: LeaderboardOk };

function readyBoard(state: LoadState): LeaderboardOk | undefined {
  return state.kind === "ready" ? state.data : undefined;
}

function errorText(state: LoadState): string | undefined {
  return state.kind === "error" ? state.error : undefined;
}

const PERIOD_LABEL: Record<LeaderboardPeriod, string> = {
  daily: "daily",
  weekly: "weekly",
  monthly: "monthly",
  "all-time": "all-time",
};

function epochMs(n: number): number {
  return Math.abs(n) < 1e12 ? n * 1000 : n;
}

function rangeText(startsAt: number, endsAt: number | null): string {
  const start = new Date(epochMs(startsAt));
  if (Number.isNaN(start.getTime())) return "";
  if (endsAt === null) return `since ${format(start, "MMM d, yyyy")}`;
  const end = new Date(epochMs(endsAt));
  if (Number.isNaN(end.getTime())) return format(start, "MMM d, yyyy");
  return `${format(start, "MMM d")} – ${format(end, "MMM d, yyyy")}`;
}

/** roving tabindex: arrows move the checked radio and focus, Home/End jump */
function moveRadio(
  index: number,
  key: string,
  count: number,
): number | undefined {
  if (count <= 0) return undefined;
  if (key === "ArrowRight" || key === "ArrowDown") {
    return (index + 1) % count;
  }
  if (key === "ArrowLeft" || key === "ArrowUp") {
    return (index + count - 1) % count;
  }
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  return undefined;
}

export function LeaderboardView(props: {
  variant: "page" | "compact";
  initial?: Partial<LeaderboardQuery>;
  load?: typeof fetchLeaderboard;
}): JSXElement {
  const seed = defaultLeaderboardQuery(props.initial);
  const [verified, setVerified] = createSignal(seed.verified);
  const [period, setPeriod] = createSignal<LeaderboardPeriod>(seed.period);
  const [mode, setMode] = createSignal<LeaderboardMode>(seed.mode);
  const [mode2, setMode2] = createSignal(seed.mode2);
  const [language, setLanguage] = createSignal(seed.language);
  const [punctuation, setPunctuation] = createSignal(seed.punctuation);
  const [numbers, setNumbers] = createSignal(seed.numbers);
  const [state, setState] = createSignal<LoadState>({ kind: "loading" });
  const [reload, setReload] = createSignal(0);

  const query = (): LeaderboardQuery =>
    defaultLeaderboardQuery({
      period: period(),
      mode: mode(),
      mode2: mode2(),
      language: language(),
      punctuation: punctuation(),
      numbers: numbers(),
      verified: verified(),
    });

  const lengths = (): readonly number[] =>
    mode() === "time" ? TIME_MODE2 : WORDS_MODE2;

  const languages = (): string[] => {
    const current = language();
    return (LANGUAGES as readonly string[]).includes(current)
      ? [...LANGUAGES]
      : [current, ...LANGUAGES];
  };

  const selectMode = (next: LeaderboardMode): void => {
    setMode(next);
    const allowed: readonly number[] =
      next === "time" ? TIME_MODE2 : WORDS_MODE2;
    if (!allowed.includes(mode2())) setMode2(DEFAULT_MODE2[next]);
  };

  createEffect(() => {
    if (!leaderboardsOn()) return;
    const next = query();
    const token = reload();
    void token;
    const ac = new AbortController();
    setState({ kind: "loading" });
    const load = props.load ?? fetchLeaderboard;
    const sessionToken = readStoredSession()?.sessionToken;
    void load(currentLeaderboardBase(), next, ac.signal, fetch, sessionToken)
      .then((result) => {
        if (ac.signal.aborted) return;
        if (result.ok && !leaderboardMatchesBoard(result, next.verified)) {
          setState({
            kind: "error",
            error: "Couldn't load the leaderboard.",
          });
          return;
        }
        setState(
          result.ok
            ? { kind: "ready", data: result }
            : { kind: "error", error: result.error },
        );
      })
      .catch(() => {
        // aborted
      });
    onCleanup(() => ac.abort());
  });

  const hl = () => selfHighlight(getTheme(), getTheme().name);
  const compact = () => props.variant === "compact";

  const focusId = (id: string): void => {
    document.getElementById(id)?.focus();
  };

  return (
    <Show when={leaderboardsOn()}>
      <section
        class={cn("grid gap-4", compact() ? "" : "gap-6")}
        data-testid="lb-view"
        data-variant={props.variant}
        aria-labelledby="lb-heading"
        style={{
          "--self-tint": `${hl().pct}%`,
          "--self-pill-text": selfPillText(getTheme()),
        }}
      >
        <h2
          id="lb-heading"
          class={cn(compact() ? "text-lg text-text" : "text-3xl text-text")}
        >
          leaderboard
        </h2>
        <div role="radiogroup" aria-label="Leaderboard kind" class="flex gap-1">
          <For
            each={
              [
                { verified: true, label: "Multiplayer", id: "race" },
                { verified: false, label: "Solo", id: "solo" },
              ] as const
            }
          >
            {(item, index) => (
              <button
                type="button"
                role="radio"
                id={`lb-board-${item.id}`}
                data-testid={`lb-board-${item.id}`}
                aria-checked={verified() === item.verified}
                tabIndex={verified() === item.verified ? 0 : -1}
                class={cn(
                  "rounded px-3 py-1.5 text-sm",
                  verified() === item.verified
                    ? "bg-main text-bg"
                    : "bg-sub-alt text-sub hover:text-text",
                )}
                onClick={() => setVerified(item.verified)}
                onKeyDown={(e) => {
                  const next = moveRadio(index(), e.key, 2);
                  if (next === undefined) return;
                  e.preventDefault();
                  const boardNext = next === 0;
                  setVerified(boardNext);
                  focusId(boardNext ? "lb-board-race" : "lb-board-solo");
                }}
              >
                {item.label}
              </button>
            )}
          </For>
        </div>
        <div
          role="radiogroup"
          aria-label="Leaderboard period"
          class="flex flex-wrap gap-1"
        >
          <For each={LEADERBOARD_PERIODS}>
            {(item, index) => (
              <button
                type="button"
                role="radio"
                id={`lb-tab-${item}`}
                data-testid={`lb-tab-${item}`}
                aria-checked={period() === item}
                tabIndex={period() === item ? 0 : -1}
                class={cn(
                  "rounded px-3 py-1.5 text-sm font-(--font)",
                  period() === item
                    ? "bg-main text-bg"
                    : "bg-sub-alt text-sub hover:text-text",
                )}
                onClick={() => setPeriod(item)}
                onKeyDown={(e) => {
                  const next = moveRadio(
                    index(),
                    e.key,
                    LEADERBOARD_PERIODS.length,
                  );
                  if (next === undefined) return;
                  e.preventDefault();
                  const periodNext = LEADERBOARD_PERIODS[next];
                  if (periodNext === undefined) return;
                  setPeriod(periodNext);
                  focusId(`lb-tab-${periodNext}`);
                }}
              >
                {PERIOD_LABEL[item]}
              </button>
            )}
          </For>
        </div>
        <div class="flex flex-wrap items-end gap-4">
          <div role="radiogroup" aria-label="Mode" class="flex gap-1">
            <For each={["time", "words"] as const}>
              {(item, index) => (
                <button
                  type="button"
                  role="radio"
                  id={`lb-mode-${item}`}
                  aria-checked={mode() === item}
                  tabIndex={mode() === item ? 0 : -1}
                  data-testid={`lb-mode-${item}`}
                  class={cn(
                    "rounded px-3 py-1.5 text-sm",
                    mode() === item
                      ? "bg-main text-bg"
                      : "bg-sub-alt text-sub hover:text-text",
                  )}
                  onClick={() => selectMode(item)}
                  onKeyDown={(e) => {
                    const next = moveRadio(index(), e.key, 2);
                    if (next === undefined) return;
                    e.preventDefault();
                    const modeNext = next === 0 ? "time" : "words";
                    selectMode(modeNext);
                    focusId(`lb-mode-${modeNext}`);
                  }}
                >
                  {item}
                </button>
              )}
            </For>
          </div>
          <div role="radiogroup" aria-label="Length" class="flex gap-1">
            <For each={lengths()}>
              {(n, index) => (
                <button
                  type="button"
                  role="radio"
                  id={`lb-mode2-${n}`}
                  aria-checked={mode2() === n}
                  tabIndex={mode2() === n ? 0 : -1}
                  data-testid={`lb-mode2-${n}`}
                  class={cn(
                    "rounded px-3 py-1.5 text-sm",
                    mode2() === n
                      ? "bg-main text-bg"
                      : "bg-sub-alt text-sub hover:text-text",
                  )}
                  onClick={() => setMode2(n)}
                  onKeyDown={(e) => {
                    const options = lengths();
                    const next = moveRadio(index(), e.key, options.length);
                    if (next === undefined) return;
                    e.preventDefault();
                    const lengthNext = options[next];
                    if (lengthNext === undefined) return;
                    setMode2(lengthNext);
                    focusId(`lb-mode2-${lengthNext}`);
                  }}
                >
                  {mode() === "time" ? `${n}s` : `${n}`}
                </button>
              )}
            </For>
          </div>
          <label class="grid gap-1 text-sm text-sub">
            language
            <select
              class="rounded bg-sub-alt px-3 py-1.5 text-text"
              data-testid="lb-language"
              aria-label="Language"
              value={language()}
              onChange={(e) => setLanguage(e.currentTarget.value)}
            >
              <For each={languages()}>
                {(item) => (
                  <option value={item}>{item.replace(/_/g, " ")}</option>
                )}
              </For>
            </select>
          </label>
          <button
            type="button"
            aria-pressed={punctuation()}
            data-testid="lb-punctuation"
            class={cn(
              "rounded px-3 py-1.5 text-sm",
              punctuation() ? "bg-main text-bg" : "bg-sub-alt text-sub",
            )}
            onClick={() => setPunctuation((v) => !v)}
          >
            punctuation
          </button>
          <button
            type="button"
            aria-pressed={numbers()}
            data-testid="lb-numbers"
            class={cn(
              "rounded px-3 py-1.5 text-sm",
              numbers() ? "bg-main text-bg" : "bg-sub-alt text-sub",
            )}
            onClick={() => setNumbers((v) => !v)}
          >
            numbers
          </button>
        </div>
        <div
          id="lb-panel"
          aria-busy={state().kind === "loading"}
          class="min-w-0"
        >
          <Show when={state().kind === "loading"}>
            <div
              class="flex items-center gap-3 py-6 text-sub"
              data-testid="lb-loading"
              role="status"
            >
              <LoadingCircle color="sub" />
              Loading leaderboard
            </div>
          </Show>
          <Show when={errorText(state())}>
            {(message) => (
              <div
                class="grid justify-items-start gap-3 rounded-lg bg-sub-alt p-4"
                data-testid="lb-error"
                role="alert"
              >
                <p class="text-text">{message()}</p>
                <Button
                  text="try again"
                  fa={{ icon: "fa-redo-alt" }}
                  dataset={{ "data-testid": "lb-retry" }}
                  onClick={() => setReload((n) => n + 1)}
                />
              </div>
            )}
          </Show>
          <Show when={readyBoard(state())}>
            {(board) => (
              <div class="grid gap-3">
                <p class="text-sm text-sub" data-testid="lb-meta">
                  {board().periodKey}
                  {rangeText(board().startsAt, board().endsAt) === ""
                    ? ""
                    : ` · ${rangeText(board().startsAt, board().endsAt)}`}
                  {` · minimum accuracy ${board().accuracyFloor}%`}
                </p>
                <Show
                  when={board().entries.length > 0}
                  fallback={
                    <p
                      class="rounded-lg bg-sub-alt p-4 text-sub"
                      data-testid="lb-empty"
                      role="status"
                    >
                      No scores for this board yet.
                    </p>
                  }
                >
                  <div class="overflow-x-auto rounded-lg bg-sub-alt">
                    <table class="w-full font-(--font)" data-testid="lb-table">
                      <caption class="sr-only">
                        {board().verified === false ? "Solo" : "Multiplayer"}{" "}
                        {PERIOD_LABEL[board().period]} {board().mode}{" "}
                        {board().mode2} leaderboard
                      </caption>
                      <thead>
                        <tr class="text-left text-xs text-sub">
                          <th scope="col" class="px-3 py-3 font-normal">
                            rank
                          </th>
                          <th scope="col" class="w-full px-3 py-3 font-normal">
                            typist
                          </th>
                          <th
                            scope="col"
                            class="px-3 py-3 text-right font-normal"
                          >
                            wpm
                          </th>
                          <th
                            scope="col"
                            class="px-3 py-3 text-right font-normal"
                          >
                            raw
                          </th>
                          <th
                            scope="col"
                            class="px-3 py-3 text-right font-normal"
                          >
                            acc
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        <For each={board().entries}>
                          {(entry) => {
                            const mine = (): boolean => entry.isYou === true;
                            return (
                              <tr
                                id={`lb-rank-${entry.rank}`}
                                class={cn(
                                  "border-t border-bg",
                                  mine() && SELF_TINT,
                                )}
                                data-testid="lb-row"
                                data-self={mine() ? "true" : undefined}
                                aria-current={mine() ? "true" : undefined}
                              >
                                <th
                                  scope="row"
                                  class={cn(
                                    "px-3 py-3 text-left font-normal text-text",
                                    mine() && SELF_BAR,
                                  )}
                                >
                                  {entry.rank}
                                </th>
                                <td class="px-3 py-3">
                                  <span class="inline-flex min-w-0 items-center gap-2">
                                    <span
                                      class={cn(
                                        "truncate text-text",
                                        mine() && "font-bold",
                                      )}
                                      data-testid="lb-name"
                                    >
                                      {entry.name}
                                    </span>
                                    <Show when={mine()}>
                                      <span
                                        class="shrink-0 rounded bg-main px-1.5 text-xs leading-4 font-bold text-(--self-pill-text)"
                                        aria-hidden="true"
                                        data-testid="lb-you"
                                      >
                                        You
                                      </span>
                                      <span class="sr-only">(you)</span>
                                    </Show>
                                  </span>
                                </td>
                                <td class="px-3 py-3 text-right text-text">
                                  {Math.round(entry.wpm)}
                                </td>
                                <td class="px-3 py-3 text-right text-sub">
                                  {Math.round(entry.raw)}
                                </td>
                                <td class="px-3 py-3 text-right text-text">
                                  {entry.acc.toFixed(1)}%
                                </td>
                              </tr>
                            );
                          }}
                        </For>
                      </tbody>
                    </table>
                  </div>
                </Show>
                <Show when={board().verified === false}>
                  <p class="text-xs text-sub" data-testid="lb-solo-note">
                    Solo scores are self-reported and checked for plausibility,
                    not verified.
                  </p>
                </Show>
              </div>
            )}
          </Show>
        </div>
      </section>
    </Show>
  );
}
