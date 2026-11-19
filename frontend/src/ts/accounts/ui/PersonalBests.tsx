import { format as formatDate } from "date-fns/format";
import { createResource, For, JSXElement, Match, Switch } from "solid-js";

import { Button } from "../../components/common/Button";
import { H3 } from "../../components/common/Headers";
import { getPersonalBests, PersonalBest } from "../api";
import { callWithIdToken } from "../session";
import { getPersonalBestsVersion } from "../state";
import { accountsCopy } from "../strings";

function achievedOn(pb: PersonalBest): string {
  const date = new Date(pb.achievedAt);
  return Number.isNaN(date.getTime()) ? "" : formatDate(date, "d MMM yyyy");
}

/** the signed-in user's saved personal bests, in the server's order */
export function PersonalBests(): JSXElement {
  const [list, { refetch }] = createResource(
    getPersonalBestsVersion,
    async () => callWithIdToken(getPersonalBests),
  );
  const copy = accountsCopy.personalBests;
  const bests = (): PersonalBest[] | undefined => {
    const result = list();
    return result?.ok === true ? result.personalBests : undefined;
  };

  return (
    <section class="grid gap-2" aria-label={copy.title}>
      <H3 text={copy.title} fa={{ icon: "fa-crown" }} class="p-0" />
      <Switch>
        <Match when={list.loading}>
          <p class="text-sub">{copy.loading}</p>
        </Match>
        <Match when={list()?.ok === false || list.error !== undefined}>
          <p class="text-sub">{copy.error}</p>
          <Button
            variant="text"
            text={copy.retry}
            onClick={() => void refetch()}
          />
        </Match>
        <Match when={bests()?.length === 0}>
          <p class="text-sub">{copy.empty}</p>
        </Match>
        <Match when={bests()}>
          {(pbs) => (
            <ul class="grid gap-1">
              <For each={pbs()}>
                {(pb) => (
                  <li class="flex flex-wrap justify-between gap-x-4">
                    <span>{copy.row(pb)}</span>
                    <span class="text-sub">{achievedOn(pb)}</span>
                  </li>
                )}
              </For>
            </ul>
          )}
        </Match>
      </Switch>
    </section>
  );
}
