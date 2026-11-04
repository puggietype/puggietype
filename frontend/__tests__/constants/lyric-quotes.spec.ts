import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  filterLyricQuotes,
  isSongLyricQuote,
  lyricMatch,
  QuoteLike,
} from "../../src/ts/constants/lyric-quotes";

const quotesDir = path.resolve(__dirname, "../../static/quotes");

function loadQuotes(language: string): (QuoteLike & { text: string })[] {
  return (
    JSON.parse(
      readFileSync(path.join(quotesDir, `${language}.json`), "utf8"),
    ) as {
      quotes: (QuoteLike & { text: string })[];
    }
  ).quotes;
}

describe("lyric quote detection", () => {
  it("matches the keyword rule", () => {
    expect(lyricMatch("I've Seen It All Lyrics")).toBe("keyword");
    expect(lyricMatch("Lối Nhỏ, Đen ft. Phương Anh Đào")).toBe("keyword");
  });

  it("matches credited recording artists in any order", () => {
    expect(lyricMatch("Phoebe Bridgers - Funeral")).toBe("artist");
    expect(lyricMatch("All Too Well, Taylor Swift")).toBe("artist");
    expect(lyricMatch("Hotel California - The Eagles")).toBe("artist");
    expect(lyricMatch("Not Around by Nova")).toBe("artist");
    expect(lyricMatch("My Shot, Hamilton")).toBe("artist");
  });

  it("matches whole-source song titles case-insensitively", () => {
    expect(lyricMatch("Bohemian Rhapsody")).toBe("title");
    expect(lyricMatch("  stairway to  heaven ")).toBe("title");
  });

  it("keeps books, films and people", () => {
    for (const source of [
      "Lyrics: Writing Better Words for Your Songs",
      "The Song of Achilles",
      "Hamilton: the Revolution",
      "Alexander Hamilton",
      "Douglas Adams, The Hitchhiker's Guide to the Galaxy",
      "Fire and Ice",
      "Pride and Prejudice",
      "",
    ]) {
      expect(lyricMatch(source), source).toBeNull();
    }
    expect(lyricMatch(undefined)).toBeNull();
  });

  it("never filters code quotes", () => {
    expect(isSongLyricQuote({ source: "Imagine" }, "code_python")).toBe(false);
    expect(isSongLyricQuote({ source: "Imagine" }, "english")).toBe(true);
  });

  it("drops lyrics but keeps the other quotes and their source fields untouched", () => {
    const quotes = [
      { id: 1, text: "a", source: "Wonderwall" },
      { id: 2, text: "b", source: "Meditations", length: 1 },
    ];
    const kept = filterLyricQuotes(quotes, "english");
    expect(kept).toEqual([
      { id: 2, text: "b", source: "Meditations", length: 1 },
    ]);
    expect(kept[0]).toBe(quotes[1]);
    expect(quotes).toHaveLength(2);
  });

  it("drops Legal's regression sources (all present in english.json)", () => {
    const english = new Set(loadQuotes("english").map((q) => q.source));
    for (const source of [
      "The End - The Beatles",
      "Cardigan, Taylor Swift",
      "Champagne Problems, Taylor Swift",
      "The Beatles, Come Together",
      "Taylor Swift - Marjorie",
      "The Beatles - A Day in the Life",
      "The Real Slim Shady - Eminem",
      "Bob Dylan, John Brown",
      "Kanye West - Violent Crimes",
      "All Too Well, Taylor Swift",
      "The Logical Song",
      "The Lazy Song",
      "Love You Like a Love Song",
      "Fresh Prince of Bel Air (Theme Song)",
      "Adam's Song",
      "Kathy's Song",
      "The Ship Song",
      "Every Single Night",
      "The Beatles",
    ]) {
      expect(english.has(source), source).toBe(true);
      expect(isSongLyricQuote({ source }, "english"), source).toBe(true);
    }
  });

  it("drops bare musical artist names", () => {
    for (const source of [
      "The Beatles",
      "Taylor Swift",
      "Kurt Cobain",
      "John Lennon",
    ]) {
      expect(isSongLyricQuote({ source }, "english"), source).toBe(true);
    }
  });

  it("keeps a novel and a non-lyric Swan Song", () => {
    expect(
      isSongLyricQuote({ source: "The Song of Achilles" }, "english"),
    ).toBe(false);
    const swan = loadQuotes("english").filter((q) => q.source === "Swan Song");
    expect(swan).toHaveLength(1);
    expect(swan[0]?.text).toMatch(/^We all start out knowing magic/);
    expect(isSongLyricQuote({ source: swan[0]?.source }, "english")).toBe(
      false,
    );
  });

  it("drops a known number of quotes from the shipped data", () => {
    let total = 0;
    let dropped = 0;
    for (const file of readdirSync(quotesDir).filter((f) =>
      f.endsWith(".json"),
    )) {
      const language = file.slice(0, -".json".length);
      const quotes = loadQuotes(language);
      total += quotes.length;
      dropped += quotes.length - filterLyricQuotes(quotes, language).length;
    }
    // update together with docs/steam-asset-clearance.md when quotes change
    expect({ total, dropped }).toEqual({ total: 15828, dropped: 929 });
  });
});
