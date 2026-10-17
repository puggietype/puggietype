import { Button } from "../common/Button";
import { H2 } from "../common/Headers";
import { PugHead } from "../common/PugHead";

export function NotFoundPage() {
  return (
    <div class="flex h-full items-center justify-center">
      <div class="flex flex-col gap-16 md:flex-row">
        <div class="place-self-center">
          <PugHead class="h-48 w-48 text-main" />
        </div>
        <div class="flex max-w-md flex-col items-center gap-4">
          <H2 text="404" class="pb-0 text-7xl text-main" />
          <p class="text-center text-2xl">page not found</p>
          <p class="text-center text-sub">
            This pug sniffed around, but there&apos;s nothing here.
          </p>
          <div class="flex flex-wrap justify-center gap-4">
            <Button
              fa={{ icon: "fa-home" }}
              text="Go Home"
              router-link
              href="/"
              class="px-8 py-4"
            />
            <Button
              fa={{ icon: "fa-flag-checkered" }}
              text="Race a friend"
              router-link
              href="/race"
              class="px-8 py-4"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
