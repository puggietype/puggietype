import { For, JSXElement } from "solid-js";

import { birthYearOptions } from "../age";
import { accountsCopy } from "../strings";

/**
 * Neutral birth-year dropdown: starts blank and lists every year alike, so
 * nothing hints at the cutoff. The year stays in the caller's memory only.
 */
export function BirthYearField(props: {
  value: number | null;
  onChange: (year: number | null) => void;
  disabled?: boolean;
}): JSXElement {
  const years = birthYearOptions(new Date());
  return (
    <label class="grid gap-1 text-left text-sm text-sub">
      {accountsCopy.age.birthYear}
      <select
        name="birth-year"
        autocomplete="off"
        class="w-full rounded border-none bg-sub-alt p-[0.5em] text-em-base text-text outline-none focus-visible:shadow-[0_0_0_0.1rem_var(--bg-color),0_0_0_0.2rem_var(--text-color)]"
        disabled={props.disabled}
        value={props.value === null ? "" : String(props.value)}
        onChange={(e) => {
          const value = e.currentTarget.value;
          props.onChange(value === "" ? null : Number(value));
        }}
      >
        <option value="">{accountsCopy.age.birthYearBlank}</option>
        <For each={years}>
          {(year) => <option value={String(year)}>{year}</option>}
        </For>
      </select>
    </label>
  );
}
