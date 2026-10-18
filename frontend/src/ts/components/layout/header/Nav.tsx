import { useQuery } from "@tanstack/solid-query";
import {
  createMemo,
  createSignal,
  JSXElement,
  onCleanup,
  Show,
} from "solid-js";

import { usePendingConnectionsQuery } from "../../../collections/connections";
import { restartTestEvent } from "../../../events/test";
import { createEffectOn } from "../../../hooks/effects";
import { useRefWithUtils } from "../../../hooks/useRefWithUtils";
import { MULTIPLAYER_ENABLED } from "../../../multiplayer/flags";
import { prefetchLeaderboardPage } from "../../../queries/prefetch";
import { getServerConfigurationQueryOptions } from "../../../queries/server-configuration";
import { getActivePage } from "../../../states/core";
import {
  getAccountButtonSpinner,
  getAnimatedLevel,
  setAnimatedLevel,
} from "../../../states/header";
import { showModal } from "../../../states/modals";
import { getSnapshot } from "../../../states/snapshot";
import { getFocus } from "../../../states/test";
import { cn } from "../../../utils/cn";
import { isStandalone } from "../../../utils/env";
import { getLevelFromTotalXp } from "../../../utils/levels";
import { Anime } from "../../common/anime";
import { AnimePresence } from "../../common/anime/AnimePresence";
import { Button } from "../../common/Button";
import { NotificationBubble } from "../../common/NotificationBubble";
import { User } from "../../common/User";
import { AccountMenu } from "./AccountMenu";
import { AccountXpBar } from "./AccountXpBar";

export function Nav(): JSXElement {
  const [getAccountMenuOpen, setAccountMenuOpen] = createSignal(false);
  const isCoarse = () => window.matchMedia("(pointer: coarse)").matches;
  const [accountMenuRef, accountMenuEl] = useRefWithUtils<HTMLDivElement>();

  const pendingConnections = usePendingConnectionsQuery();

  const handleClickOutside = (e: MouseEvent) => {
    const el = accountMenuEl();
    if (getAccountMenuOpen() && el && !el.native.contains(e.target as Node)) {
      setAccountMenuOpen(false);
    }
  };
  document.addEventListener("click", handleClickOutside);
  onCleanup(() => document.removeEventListener("click", handleClickOutside));

  const buttonClass = () =>
    cn("aspect-square", {
      "opacity-(--nav-focus-opacity)": getFocus(),
    });

  createEffectOn(getSnapshot, (snapshot) => {
    if (snapshot === undefined) {
      setAnimatedLevel(0);
      return;
    }
    setAnimatedLevel(getLevelFromTotalXp(snapshot.xp ?? 0));
  });

  const showFriendsNotificationBubble = createMemo((): boolean => {
    return pendingConnections().length > 0;
  });

  const showAlertsNotificationBubble = createMemo((): boolean => {
    const snapshot = getSnapshot();
    if (snapshot === undefined) return false;

    return snapshot.inboxUnreadSize > 0;
  });

  const serverConfig = useQuery(() => getServerConfigurationQueryOptions());
  const showLoginButton = (): boolean =>
    !isStandalone() && (serverConfig.data?.users.signUp ?? true);

  return (
    <nav class={cn("z-5 flex w-full items-center gap-1 md:gap-2")}>
      <Button
        variant="text"
        fa={{
          icon: "fa-keyboard",
          fixedWidth: true,
        }}
        router-link
        href="/"
        class={buttonClass()}
        balloon={{ text: "test", position: "down" }}
        dataset={{
          "data-nav-item": "test",
        }}
        onClick={() => {
          if (getActivePage() === "test") restartTestEvent.dispatch();
        }}
      />
      <Show when={MULTIPLAYER_ENABLED}>
        <Button
          variant="text"
          fa={{
            icon: "fa-flag-checkered",
            fixedWidth: true,
          }}
          router-link
          href="/race"
          class={buttonClass()}
          balloon={{ text: "multiplayer", position: "down" }}
          dataset={{
            "data-nav-item": "race",
            "data-testid": "nav-race",
          }}
        />
      </Show>
      <Show when={!isStandalone()}>
        <Button
          variant="text"
          fa={{
            icon: "fa-crown",
            fixedWidth: true,
          }}
          router-link
          balloon={{ text: "leaderboards", position: "down" }}
          dataset={{
            "data-nav-item": "leaderboards",
          }}
          class={buttonClass()}
          href="/leaderboards"
          onMouseEnter={() => {
            prefetchLeaderboardPage();
          }}
        />
      </Show>
      <Button
        variant="text"
        fa={{
          icon: "fa-info",
          fixedWidth: true,
        }}
        class={buttonClass()}
        balloon={{ text: "about", position: "down" }}
        dataset={{
          "data-nav-item": "about",
        }}
        href="/about"
        router-link
      />
      <Button
        variant="text"
        fa={{
          icon: "fa-cog",
          fixedWidth: true,
        }}
        class={buttonClass()}
        href="/settings"
        balloon={{ text: "settings", position: "down" }}
        dataset={{
          "data-nav-item": "settings",
        }}
        router-link
      />
      <div class="grow"></div>
      {/* alerts, login and the account menu need a backend */}
      <Show when={!isStandalone()}>
        <Button
          variant="text"
          fa={{
            icon: "fa-bell",
            fixedWidth: true,
          }}
          balloon={{ text: "notifications", position: "down" }}
          dataset={{
            "data-nav-item": "alerts",
          }}
          onClick={() => {
            showModal("Alerts");
          }}
          class={cn(buttonClass(), "relative")}
        >
          <NotificationBubble
            variant="fromCorner"
            show={showAlertsNotificationBubble()}
          />
        </Button>
        <AnimePresence exitBeforeEnter>
          <Show
            when={getSnapshot()}
            fallback={
              <Anime
                initial={{ opacity: 0 }}
                animate={{ opacity: 1, duration: 125 }}
                exit={{ opacity: 0, duration: 125 }}
              >
                <Show when={showLoginButton()}>
                  <Button
                    variant="text"
                    href="/login"
                    balloon={{ text: "login", position: "down" }}
                    dataset={{
                      "data-nav-item": "login",
                    }}
                    fa={{
                      icon: "fa-user",
                      variant: "regular",
                      fixedWidth: true,
                    }}
                    router-link
                    class={buttonClass()}
                  />
                </Show>
              </Anime>
            }
          >
            {(snap) => (
              <Anime
                initial={{ opacity: 0 }}
                animate={{ opacity: 1, duration: 125 }}
                exit={{ opacity: 0, duration: 125 }}
              >
                <div
                  ref={accountMenuRef}
                  class={cn(
                    "relative",
                    !getFocus() &&
                      "hover:**:data-[ui-element='accountMenu']:pointer-events-auto hover:**:data-[ui-element='accountMenu']:opacity-100",
                    "has-focus-visible:**:data-[ui-element='accountMenu']:pointer-events-auto has-focus-visible:**:data-[ui-element='accountMenu']:opacity-100",
                    getAccountMenuOpen() &&
                      "**:data-[ui-element='accountMenu']:pointer-events-auto **:data-[ui-element='accountMenu']:opacity-100",
                  )}
                  // oxlint-disable-next-line react/no-unknown-property
                  on:click={(e: MouseEvent) => {
                    if (isCoarse()) {
                      if (e.target instanceof HTMLAnchorElement) {
                        if (e.target.dataset["navItem"] === "account") {
                          e.preventDefault();
                          e.stopPropagation();
                        }
                        setAccountMenuOpen((prev) => !prev);
                      }
                    }
                  }}
                >
                  <Button
                    variant="text"
                    class={cn(
                      "h-full",
                      "hover:**:data-[ui-element='userLevel']:bg-(--themable-button-hover-text)",
                      { "opacity-(--nav-focus-opacity)": getFocus() },
                    )}
                    href="/account"
                    router-link
                    balloon={{ text: "account", position: "down" }}
                    dataset={{
                      "data-nav-item": "account",
                    }}
                  >
                    <User
                      user={snap()}
                      showAvatar={true}
                      iconsOnly={true}
                      hideNameOnSmallScreens={true}
                      level={getAnimatedLevel()}
                      showSpinner={getAccountButtonSpinner()}
                      showNotificationBubble={showFriendsNotificationBubble()}
                      fontClass="text-em-xs"
                    />
                  </Button>
                  <AccountMenu
                    showFriendsNotificationBubble={showFriendsNotificationBubble()}
                  />
                </div>
                <div class="relative">
                  <AccountXpBar />
                </div>
              </Anime>
            )}
          </Show>
        </AnimePresence>
      </Show>
    </nav>
  );
}
