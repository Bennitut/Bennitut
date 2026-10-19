import { describe, expect, it } from "vitest";
import { detectPlatform, hostMatches, metaContent } from "../src/social/fetchPost.js";

describe("Social-Import", () => {
  it("erkennt Instagram- und TikTok-Links", () => {
    expect(detectPlatform("https://www.instagram.com/reel/abc123/")).toBe("instagram");
    expect(detectPlatform("https://www.tiktok.com/@koch/video/123")).toBe("tiktok");
    expect(detectPlatform("https://vm.tiktok.com/ZMabc/")).toBe("tiktok");
  });

  it("lehnt andere Hosts, HTTP und Täuschungsversuche ab", () => {
    expect(detectPlatform("http://www.instagram.com/reel/abc")).toBeNull();
    expect(detectPlatform("https://instagram.com.evil.example/reel")).toBeNull();
    expect(detectPlatform("https://evilinstagram.com/reel")).toBeNull();
    expect(detectPlatform("kein link")).toBeNull();
    expect(hostMatches("169.254.169.254", ["tiktokcdn.com"])).toBe(false);
  });

  it("liest Open-Graph-Beschreibungen inklusive HTML-Entities", () => {
    const html = `<meta property="og:description" content="Pasta &amp; Pesto: 200 g Nudeln&#33;" /><meta property="og:image" content="https://scontent.cdninstagram.com/x.jpg">`;
    expect(metaContent(html, "og:description")).toBe("Pasta & Pesto: 200 g Nudeln!");
    expect(metaContent(html, "og:image")).toBe("https://scontent.cdninstagram.com/x.jpg");
  });
});
