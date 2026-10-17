import { createSignal } from "solid-js";
import { ColorName, Theme } from "../constants/themes";
import { ThemeName } from "@monkeytype/schemas/configs";

export type ThemeIdentifier = ThemeName | "custom";
const defaultTheme: Theme & { name: ThemeIdentifier } = {
  name: "puggie_dark",
  hasCss: true,
  bg: "#161514",
  main: "#e8a96b",
  caret: "#e8a96b",
  sub: "#77706a",
  subAlt: "#211f1d",
  text: "#ece6dd",
  error: "#ef6b5f",
  errorExtra: "#a84a43",
  colorfulError: "#ef6b5f",
  colorfulErrorExtra: "#a84a43",
};

export const [getTheme, setTheme] = createSignal(defaultTheme);

export function updateThemeColor(key: ColorName, color: string): void {
  setTheme((prev) => ({
    ...prev,
    [key]: color,
  }));
}
