import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CATALOG_VIDEO_LANGUAGES, RECIPES } from "../src/lib/catalog";
import type { Recipe, RecipeVideo } from "../src/lib/types";
import { editableVideo, replaceEditableVideo, videoLanguage, videoLanguageIndex, videosForLanguage, youtubeSearchUrl } from "../src/lib/videos";
import { recipe } from "./fixtures";

const yt = (id: string, language?: string): RecipeVideo => ({
  platform: "youtube",
  url: `https://www.youtube.com/watch?v=${id}`,
  title: `Video ${id}`,
  ...(language ? { language } : {}),
});

/** Wie ein Katalogrezept mit einem deutschen und einem englischen Video. */
const soup: Recipe = recipe({
  id: "kuerbissuppe",
  ingredients: [],
  source: { kind: "katalog" },
  media: { videos: [yt("deutsch00001", "de"), yt("english00001", "en")] },
});

describe("Videos in der gewählten Sprache", () => {
  it("zeigt nur das Video der gewählten Sprache", () => {
    assert.deepEqual(videosForLanguage(soup, "de", "Kürbissuppe Rezept").videos, [yt("deutsch00001", "de")]);
    assert.deepEqual(videosForLanguage(soup, "en", "Pumpkin soup recipe").videos, [yt("english00001", "en")]);
    assert.equal(videosForLanguage(soup, "en", "Pumpkin soup recipe").searchUrl, undefined);
  });

  it("zählt Österreich und die Schweiz als Deutsch", () => {
    assert.equal(videoLanguage("de-AT"), "de");
    assert.equal(videoLanguage("de-CH"), "de");
    assert.equal(videoLanguage("en"), "en");
    assert.deepEqual(videosForLanguage(soup, "de-AT", "Kürbissuppe Rezept").videos, [yt("deutsch00001", "de")]);
    assert.deepEqual(videosForLanguage(soup, "de-CH", "Kürbissuppe Rezept").videos, [yt("deutsch00001", "de")]);
  });

  it("sucht ohne Video in der Sprache auf YouTube – mit Rezeptname und Suchwort in dieser Sprache", () => {
    const choice = videosForLanguage(soup, "fr", "Soupe de potiron recette");
    assert.deepEqual(choice.videos, []);
    assert.equal(choice.searchUrl, "https://www.youtube.com/results?search_query=Soupe%20de%20potiron%20recette");
    assert.equal(youtubeSearchUrl("Crème brûlée & Co."), "https://www.youtube.com/results?search_query=Cr%C3%A8me%20br%C3%BBl%C3%A9e%20%26%20Co.");
  });

  it("sucht auch bei Katalogrezepten ganz ohne Video", () => {
    const bare = recipe({ id: "bare", ingredients: [], source: { kind: "katalog" } });
    assert.ok(videosForLanguage(bare, "de", "Bare Rezept").searchUrl);
  });

  it("zeigt Originalbeiträge und eigene Links in jeder Sprache und sucht dann nicht", () => {
    const imported = recipe({
      id: "import_1",
      ingredients: [],
      source: { kind: "import", url: "https://www.instagram.com/p/abc/", platform: "instagram" },
      media: { videos: [{ platform: "instagram", url: "https://www.instagram.com/p/abc/" }] },
    });
    for (const language of ["de", "en", "it"]) {
      assert.deepEqual(videosForLanguage(imported, language, "x").videos, imported.media!.videos);
      assert.equal(videosForLanguage(imported, language, "x").searchUrl, undefined);
    }
    // Eigene Rezepte ohne Video: kein zusätzlicher Suchknopf (dafür gibt es „Mehr Videos“).
    const own = recipe({ id: "eigen_1", ingredients: [] });
    assert.deepEqual(videosForLanguage(own, "en", "x"), { videos: [] });
  });

  it("filtert auch Kopien von Katalogrezepten nach Sprache, der eigene Link bleibt", () => {
    const copy = recipe({
      id: "eigen_copy",
      ingredients: [],
      media: { videos: [{ platform: "tiktok", url: "https://www.tiktok.com/@koch/video/1" }, yt("deutsch00001", "de"), yt("english00001", "en")] },
    });
    assert.deepEqual(
      videosForLanguage(copy, "en", "x").videos.map((v) => v.url),
      ["https://www.tiktok.com/@koch/video/1", "https://www.youtube.com/watch?v=english00001"],
    );
    // Nur Katalogvideos in anderen Sprachen: Suche statt eines fremdsprachigen Videos.
    const copyWithoutOwn = { ...copy, media: { videos: [yt("deutsch00001", "de")] } };
    assert.deepEqual(videosForLanguage(copyWithoutOwn, "es", "Sopa de calabaza receta").videos, []);
    assert.ok(videosForLanguage(copyWithoutOwn, "es", "Sopa de calabaza receta").searchUrl);
  });

  it("erkennt Katalogvideos in alten Kopien ohne Sprache an der URL", () => {
    const known = videoLanguageIndex([soup]);
    assert.equal(known.get("https://www.youtube.com/watch?v=english00001"), "en");
    // Vor dem 24.11.2026 gespeichert: das Katalogvideo ohne Sprache.
    const oldCopy = recipe({ id: "eigen_old", ingredients: [], media: { videos: [{ ...yt("deutsch00001") }] } });
    assert.deepEqual(videosForLanguage(oldCopy, "de", "x", known).videos, [yt("deutsch00001")]);
    assert.deepEqual(videosForLanguage(oldCopy, "en", "x", known).videos, []);
    assert.ok(videosForLanguage(oldCopy, "en", "x", known).searchUrl);
  });

  it("bearbeitet im Editor nur den eigenen Link und behält die Katalogvideos", () => {
    const videos = [yt("deutsch00001", "de"), yt("english00001", "en")];
    assert.equal(editableVideo(videos), undefined);
    const ownLink: RecipeVideo = { platform: "web", url: "https://example.org/rezept" };
    assert.deepEqual(replaceEditableVideo(videos, ownLink), [ownLink, ...videos]);
    // Link ändern ersetzt nur ihn; Link leeren entfernt nur ihn.
    const withOwn = [ownLink, ...videos];
    assert.equal(editableVideo(withOwn), ownLink);
    const changed: RecipeVideo = { platform: "web", url: "https://example.org/neu" };
    assert.deepEqual(replaceEditableVideo(withOwn, changed), [changed, ...videos]);
    assert.deepEqual(replaceEditableVideo(withOwn, null), videos);
    // Alte Kopie: das Katalogvideo ohne Sprache steht nicht im Eingabefeld.
    const known = videoLanguageIndex([soup]);
    assert.equal(editableVideo([yt("deutsch00001")], known), undefined);
    assert.deepEqual(replaceEditableVideo([yt("deutsch00001")], ownLink, known), [ownLink, yt("deutsch00001")]);
  });

  it("findet im Katalog zu jedem Rezept höchstens ein Video je Sprache und sonst eine Suche", () => {
    let german = 0;
    for (const r of RECIPES) {
      for (const language of ["de", "en", "fr", "it", "es"]) {
        const choice = videosForLanguage(r, language, `${r.name} Rezept`, CATALOG_VIDEO_LANGUAGES);
        assert.ok(choice.videos.length <= 1, `${r.id}/${language}`);
        assert.equal(choice.videos.length === 0, choice.searchUrl !== undefined, `${r.id}/${language}`);
        for (const video of choice.videos) assert.equal(video.language, language, `${r.id}/${language}`);
        if (language === "de" && choice.videos.length) german++;
      }
    }
    assert.ok(german >= 190, `nur ${german} deutsche Videos`);
  });
});
