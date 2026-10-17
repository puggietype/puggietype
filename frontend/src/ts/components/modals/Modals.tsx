import { Component, createMemo, JSXElement, lazy, Show } from "solid-js";

import {
  getModalVisibility,
  ModalId,
  getPendingModal,
} from "../../states/modals";
import { CommandlineModal } from "./CommandlineModal";
import { SimpleModal } from "./SimpleModal";

/**
 * Loads and mounts a modal the first time one of its ids is requested, then
 * keeps it mounted. AnimatedModal opens on mount when its id is already
 * visible, so the first show works the same as later ones. Keeps forms,
 * tables and their libraries out of the boot bundle.
 */
function lazyModal<T extends Record<string, unknown>>(
  ids: ModalId[],
  load: () => Promise<T>,
  name: keyof T,
): Component {
  const Modal = lazy(async () =>
    load().then((m) => ({ default: m[name] as Component })),
  );
  return () => {
    const requested = createMemo(
      (was: boolean) =>
        was ||
        ids.some(
          (id) => getModalVisibility(id) !== null || getPendingModal() === id,
        ),
      false,
    );
    return (
      <Show when={requested()}>
        <Modal />
      </Show>
    );
  };
}

const AlertsModal = lazyModal(
  ["Alerts"],
  async () => import("./alerts/AlertsModal"),
  "AlertsModal",
);
const RegisterCaptchaModal = lazyModal(
  ["RegisterCaptcha"],
  async () => import("./RegisterCaptchaModal"),
  "RegisterCaptchaModal",
);
const CustomTextModal = lazyModal(
  [
    "CustomText",
    "SaveCustomText",
    "SavedTexts",
    "WordFilter",
    "CustomGenerator",
  ],
  async () => import("./CustomTextModal"),
  "CustomTextModal",
);
const QuoteRateModal = lazyModal(
  ["QuoteRate"],
  async () => import("./QuoteRateModal"),
  "QuoteRateModal",
);
const QuoteReportModal = lazyModal(
  ["QuoteReport"],
  async () => import("./QuoteReportModal"),
  "QuoteReportModal",
);
const QuoteSearchModal = lazyModal(
  ["QuoteSearch", "QuoteSubmit", "QuoteApprove"],
  async () => import("./QuoteSearchModal"),
  "QuoteSearchModal",
);
const CustomTestDurationModal = lazyModal(
  ["TestDuration"],
  async () => import("./CustomTestDurationModal"),
  "CustomTestDurationModal",
);
const CustomWordAmountModal = lazyModal(
  ["CustomWordAmount"],
  async () => import("./CustomWordAmountModal"),
  "CustomWordAmountModal",
);
const PbTablesModal = lazyModal(
  ["PbTables"],
  async () => import("./PbTablesModal"),
  "PbTablesModal",
);
const PractiseWordsModal = lazyModal(
  ["PractiseWords"],
  async () => import("./PractiseWordsModal"),
  "PractiseWordsModal",
);
const ShareTestSettings = lazyModal(
  ["ShareTestSettings"],
  async () => import("./ShareTestSettings"),
  "ShareTestSettings",
);
const MobileTestConfigModal = lazyModal(
  ["MobileTestConfig"],
  async () => import("./MobileTestConfigModal"),
  "MobileTestConfigModal",
);
const CookiesModal = lazyModal(
  ["Cookies"],
  async () => import("./CookiesModal"),
  "CookiesModal",
);
const AddPresetModal = lazyModal(
  ["AddPresetModal"],
  async () => import("./preset/AddPresetModal"),
  "AddPresetModal",
);
const EditPresetModal = lazyModal(
  ["EditPresetModal"],
  async () => import("./preset/EditPresetModal"),
  "EditPresetModal",
);
const ViewApeKeyModal = lazyModal(
  ["ViewApeKey"],
  async () => import("./account-settings/ViewApeKeyModal"),
  "ViewApeKeyModal",
);
const LastSignedOutResultModal = lazyModal(
  ["LastSignedOutResult"],
  async () => import("./LastSignedOutResultModal"),
  "LastSignedOutResultModal",
);
const StreakHourOffsetModal = lazyModal(
  ["StreakHourOffset"],
  async () => import("./StreakHourOffsetModal"),
  "StreakHourOffsetModal",
);
const GoogleSignupModal = lazyModal(
  ["GoogleSignup"],
  async () => import("./GoogleSignUpModal"),
  "GoogleSignupModal",
);
const ForgotPasswordModal = lazyModal(
  ["ForgotPassword"],
  async () => import("./ForgotPasswordModal"),
  "ForgotPasswordModal",
);
const UserReportModal = lazyModal(
  ["UserReport"],
  async () => import("./UserReportModal"),
  "UserReportModal",
);
const EditResultTagsModal = lazyModal(
  ["EditResultTags"],
  async () => import("./EditResultTagsModal"),
  "EditResultTagsModal",
);
const TheRestModal = lazyModal(
  ["TheRest"],
  async () => import("./TheRestModal"),
  "TheRestModal",
);

// these two subscribe to auth events at module load; with a backend, load
// them on boot so the subscriptions exist (no auth in standalone builds)
if (!__STANDALONE__) {
  void import("./LastSignedOutResultModal");
  void import("./GoogleSignUpModal");
}

export function Modals(): JSXElement {
  return (
    <>
      <CommandlineModal />
      <AlertsModal />
      <RegisterCaptchaModal />
      <SimpleModal />
      <CustomTextModal />
      <QuoteRateModal />
      <QuoteReportModal />
      <QuoteSearchModal />
      <CustomTestDurationModal />
      <CustomWordAmountModal />
      <PbTablesModal />
      <PractiseWordsModal />
      <ShareTestSettings />
      <MobileTestConfigModal />
      <CookiesModal />
      <AddPresetModal />
      <EditPresetModal />
      <ViewApeKeyModal />
      <LastSignedOutResultModal />
      <StreakHourOffsetModal />
      <GoogleSignupModal />
      <ForgotPasswordModal />
      <UserReportModal />
      <EditResultTagsModal />
      <TheRestModal />
    </>
  );
}
