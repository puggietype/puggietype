import { createSignal } from "solid-js";

import {
  type ConsentRecord,
  readConsentRecord,
  writeConsentRecord,
} from "./analytics/consent";

export type AcceptedCookies = ConsentRecord;

const [acceptedCookies, _setAcceptedCookies] =
  createSignal<ConsentRecord | null>(readConsentRecord());

export function getAcceptedCookies(): AcceptedCookies | null {
  return acceptedCookies();
}

export function setAcceptedCookies(accepted: AcceptedCookies): void {
  writeConsentRecord(accepted);
  _setAcceptedCookies(accepted);
}
