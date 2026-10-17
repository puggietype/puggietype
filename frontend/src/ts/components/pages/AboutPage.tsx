import { JSXElement } from "solid-js";

import { Button } from "../common/Button";
import { H2, H3 } from "../common/Headers";
import { PugHead } from "../common/PugHead";
import { CommandlineHotkey } from "../hotkeys/CommandlineHotkey";
import { QuickRestartHotkey } from "../hotkeys/QuickRestartHotkey";

export function AboutPage(): JSXElement {
  return (
    <div class="content-grid grid gap-8">
      <section class="grid justify-items-center gap-2 text-center text-sub">
        <PugHead class="h-16 w-16 text-main" />
        type fast. stay cute.
      </section>
      <section>
        <H2 fa={{ icon: "fa-info-circle" }} text="about" />
        <p>
          puggietype is a minimalist and customizable typing test with a little
          pug who types along with you. It features many test modes, multiplayer
          races with friends, and user-configurable features such as themes,
          sounds, a smooth caret, and more. It attempts to emulate the
          experience of natural keyboard typing during a typing test, by
          unobtrusively presenting the text prompts and displaying typed
          characters in-place, providing straightforward, real-time feedback on
          typos, speed, and accuracy.
          <br />
          <br />
          Test yourself in various modes, track your progress and improve your
          speed.
        </p>
      </section>
      <section>
        <H3 fa={{ icon: "fa-align-left" }} text="word set" />
        <p>
          By default, this website uses the most common 200 words in the English
          language to generate its tests. You can change to an expanded set
          (1000 most common words) in the options, or change the language
          entirely.
        </p>
      </section>
      <section>
        <H3 fa={{ icon: "fa-keyboard" }} text="keybinds" />
        <p>
          You can use <QuickRestartHotkey /> to restart the typing test. Open
          the command line by pressing <CommandlineHotkey /> - there you can
          access all the functionality you need without touching your mouse.
        </p>
      </section>
      <section>
        <H3 fa={{ icon: "fa-list-ol" }} text="stats" />
        <dl class="grid">
          <dt class="col-1 mr-4">wpm</dt>
          <dd class="col-2">
            - total number of characters in the correctly typed words (including
            spaces), divided by 5 and normalised to 60 seconds.
          </dd>

          <dt class="col-1 mr-4">raw wpm</dt>
          <dd class="col-2">
            {" "}
            - calculated just like wpm, but also includes incorrect words.
          </dd>

          <dt class="col-1 mr-4">acc</dt>
          <dd class="col-2"> - percentage of correctly pressed keys.</dd>

          <dt class="col-1 mr-4">char</dt>
          <dd class="col-2">
            - correct characters / incorrect characters. Calculated after the
            test has ended.
          </dd>

          <dt class="col-1 mr-4">consistency</dt>
          <dd class="col-2">
            - based on the variance of your raw wpm. Closer to 100% is better.
            Calculated using the coefficient of variation of raw wpm and mapped
            onto a scale from 0 to 100.
          </dd>
        </dl>
      </section>
      <section>
        <H3 fa={{ icon: "fa-chart-area" }} text="results screen" />
        <p>
          After completing a test you will be able to see your wpm, raw wpm,
          accuracy, character stats, test length, leaderboards info and test
          info (you can hover over some values to get floating point numbers).
          You can also see a graph of your wpm and raw over the duration of the
          test. Remember that the wpm line is a global average, while the raw
          wpm line is a local, momentary value (meaning if you stop, the value
          is 0).
        </p>
      </section>
      <section>
        <H3 fa={{ icon: "fa-bug" }} text="bug report or feature request" />
        <p>
          If you encounter a bug, or have a feature request, create an issue on
          GitHub.
        </p>
        <div class="mt-4 text-xl">
          <Button
            text="github issues"
            fa={{ icon: "fa-github", variant: "brand" }}
            href="https://github.com/puggietype/puggietype/issues"
            class="w-full p-8"
          />
        </div>
      </section>
      <div></div>
      <section>
        <H2 fa={{ icon: "fa-users" }} text="credits" />
        <p>
          puggietype is based on{" "}
          <Button
            variant="text"
            text="Monkeytype"
            href="https://github.com/monkeytypegame/monkeytype"
            class="p-0"
          />{" "}
          by Miodec and its{" "}
          <Button
            variant="text"
            text="contributors"
            href="https://github.com/monkeytypegame/monkeytype/graphs/contributors"
            class="p-0"
          />
          , licensed under GPL-3.0. puggietype is not affiliated with
          Monkeytype.
        </p>
        <p>
          The source code of puggietype is available on{" "}
          <Button
            variant="text"
            text="GitHub"
            href="https://github.com/puggietype/puggietype"
            class="p-0"
          />{" "}
          under the same license.
        </p>
      </section>
    </div>
  );
}
