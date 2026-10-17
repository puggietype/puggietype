import { createEvent } from "../hooks/createEvent";
import { onWindowLoad } from "../utils/dom";

export const connectionEvent = createEvent<boolean>();

onWindowLoad(() => {
  window.addEventListener("online", () => {
    connectionEvent.dispatch(true);
  });
  window.addEventListener("offline", () => {
    connectionEvent.dispatch(false);
  });
});
