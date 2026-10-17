import { Component, lazy } from "solid-js";

import { NotFoundPage } from "./404Page";
import { LoadingPage } from "./LoadingPage";
import { PageRegistry } from "./Pages";
import { TestPage } from "./test/TestPage";

// the test page is the landing page; every other page (and its deps such as
// chart.js and tanstack form) loads on first visit to keep the boot bundle small
function lazyPage<T extends Record<string, unknown>>(
  load: () => Promise<T>,
  name: keyof T,
): Component {
  return lazy(async () =>
    load().then((m) => ({ default: m[name] as Component })),
  );
}

const SettingsPage = lazyPage(
  async () => import("./settings/SettingsPage"),
  "SettingsPage",
);
const AboutPage = lazyPage(async () => import("./AboutPage"), "AboutPage");
const AccountPage = lazyPage(
  async () => import("./account/AccountPage"),
  "AccountPage",
);
const LoginPage = lazyPage(
  async () => import("./login/LoginPage"),
  "LoginPage",
);
const ProfilePage = lazyPage(
  async () => import("./profile/ProfilePage"),
  "ProfilePage",
);
const ProfileSearchPage = lazyPage(
  async () => import("./profile/ProfileSearchPage"),
  "ProfileSearchPage",
);
const AccountSettingsPage = lazyPage(
  async () => import("./account-settings/AccountSettingsPage"),
  "AccountSettingsPage",
);
const LeaderboardPage = lazyPage(
  async () => import("./leaderboard/LeaderboardPage"),
  "LeaderboardPage",
);
const FriendsPage = lazyPage(
  async () => import("./connections/FriendsPage"),
  "FriendsPage",
);
const RacePage = lazyPage(
  async () => import("../../multiplayer/components/RacePage"),
  "RacePage",
);

/** Every page's component and wrapper options, rendered by `Pages`. */
export const pageRegistry: PageRegistry = {
  loading: {
    component: LoadingPage,
    class:
      "grid h-full w-full content-center items-center gap-4 place-self-center text-center",
  },
  test: { component: TestPage, class: "full-width content-grid" },
  settings: { component: SettingsPage },
  about: { component: AboutPage, class: "full-width" },
  account: { component: AccountPage, needsAuthentication: true },
  login: { component: LoginPage },
  profile: { component: ProfilePage },
  profileSearch: { component: ProfileSearchPage },
  404: { component: NotFoundPage },
  accountSettings: { component: AccountSettingsPage },
  leaderboards: { component: LeaderboardPage },
  friends: { component: FriendsPage },
  race: { component: RacePage, class: "full-width content-grid" },
};
