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
import { PageName } from "../../../pages/page";
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
import { FaSolidIcon } from "../../../types/font-awesome";
import { cn } from "../../../utils/cn";
import { isStandalone } from "../../../utils/env";
import { getLevelFromTotalXp } from "../../../utils/levels";
import { Anime } from "../../common/anime";
import { AnimePresence } from "../../common/anime/AnimePresence";
import { Button } from "../../common/Button";
import { Fa } from "../../common/Fa";
import { NotificationBubble } from "../../common/NotificationBubble";
import { User } from "../../common/User";
import { AccountMenu } from "./AccountMenu";
import { AccountXpBar } from "./AccountXpBar";

// icon + visible label; height matches the old icon-only buttons (36px).
// below sm: icon stacked over a tiny label so every item stays labelled
// on touch screens; sm+: icon and label side by side
const navItemClass =
  "inline-flex h-9 flex-col items-center justify-center gap-[0.15em] px-[0.3em] py-0 leading-[1.25] whitespace-nowrap sm:h-min sm:flex-row sm:gap-[0.35em] sm:px-[0.5em] sm:py-[0.5em]";
const labelClass =
  "text-[0.6em] leading-none lowercase sm:text-em-sm sm:leading-[inherit]";

/** full label from sm up, optional shorter one below */
function NavLabel(props: { label: string; short?: string }): JSXElement {
  return (
    <Show
      when={props.short !== undefined && props.short !== props.label}
      fallback={<span class={labelClass}>{props.label}</span>}
    >
      <span class={cn(labelClass, "sm:hidden")}>{props.short}</span>
      <span class={cn(labelClass, "hidden sm:inline")}>{props.label}</span>
    </Show>
  );
}

const focusClass = (): string | false =>
  getFocus() && "opacity-(--nav-focus-opacity)";

function NavLink(props: {
  href: string;
  icon: FaSolidIcon;
  label: string;
  navItem: string;
  page: PageName;
  testId?: string;
  /** shorter visible label below sm (aria-label keeps the full one) */
  shortLabel?: string;
  onClick?: () => void;
  onMouseEnter?: () => void;
}): JSXElement {
  const isActive = (): boolean => getActivePage() === props.page;
  return (
    <Button
      variant="text"
      fa={{ icon: props.icon, fixedWidth: true }}
      router-link
      href={props.href}
      ariaLabel={props.label}
      ariaCurrent={isActive() ? "page" : undefined}
      class={cn(
        navItemClass,
        isActive() && "[--themable-button-text:var(--main-color)]",
        focusClass(),
      )}
      dataset={{
        "data-nav-item": props.navItem,
        ...(props.testId !== undefined ? { "data-testid": props.testId } : {}),
      }}
      onClick={() => props.onClick?.()}
      onMouseEnter={() => props.onMouseEnter?.()}
    >
      <NavLabel label={props.label} short={props.shortLabel} />
    </Button>
  );
}

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
      <NavLink
        href="/"
        icon="fa-keyboard"
        label="solo"
        navItem="test"
        page="test"
        onClick={() => {
          if (getActivePage() === "test") restartTestEvent.dispatch();
        }}
      />
      <Show when={MULTIPLAYER_ENABLED}>
        <NavLink
          href="/race"
          icon="fa-flag-checkered"
          label="multiplayer"
          shortLabel="multi"
          navItem="race"
          page="race"
          testId="nav-race"
        />
      </Show>
      <Show
        when={!isStandalone()}
        fallback={
          // no leaderboards without a backend: a visible, inert placeholder
          <span
            role="link"
            aria-disabled="true"
            aria-label="leaderboard (coming soon)"
            title="leaderboard (coming soon)"
            data-nav-item="leaderboards-soon"
            class={cn(
              navItemClass,
              "cursor-default text-sub opacity-60 transition-opacity duration-125 select-none",
              focusClass(),
            )}
          >
            <Fa icon="fa-crown" fixedWidth />
            <NavLabel label="leaderboard" short="ranks" />
            <span class="hidden rounded bg-sub-alt px-[0.4em] text-[0.6em] leading-[1.6] sm:inline">
              soon
            </span>
          </span>
        }
      >
        <NavLink
          href="/leaderboards"
          icon="fa-crown"
          label="leaderboard"
          navItem="leaderboards"
          page="leaderboards"
          shortLabel="ranks"
          onMouseEnter={() => {
            prefetchLeaderboardPage();
          }}
        />
      </Show>
      <NavLink
        href="/about"
        icon="fa-info"
        label="guides"
        navItem="about"
        page="about"
      />
      <NavLink
        href="/settings"
        icon="fa-cog"
        label="settings"
        navItem="settings"
        page="settings"
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
