import assert from "node:assert/strict";
import test from "node:test";

import {
  parseSitemapDocument,
  selectRelevantPages,
} from "../src/lib/scanner/discovery.ts";
import { analyzeHtmlPage } from "../src/lib/scanner/page-analyzer.ts";
import {
  isPathAllowedByRobots,
  parseRobotsTxt,
} from "../src/lib/scanner/robots.ts";

const homepageHtml = `
<!doctype html>
<html>
  <head>
    <title>Northstar Dental Implants</title>
    <meta name="description" content="Implant dentistry in Noida." />
    <meta name="robots" content="index, follow" />
    <link rel="canonical" href="/dental-implants" />
    <script type="application/ld+json">{"@type":"Dentist","name":"Northstar"}</script>
    <script>window.noise = "must not enter main text";</script>
  </head>
  <body>
    <nav><a href="/services/dental-implants?utm_source=test">Dental implants</a></nav>
    <main>
      <h1>Dental implants in Noida</h1>
      <h2>Permanent tooth replacement</h2>
      <p>Restore your smile with a clinician-led implant treatment plan.</p>
      <img src="team.jpg" alt="Northstar implant team" />
    </main>
  </body>
</html>`;

test("extracts normalized page evidence and internal links", () => {
  const page = analyzeHtmlPage({
    html: homepageHtml,
    pageType: "homepage",
    url: "https://www.example.com/",
  });

  assert.equal(page.title, "Northstar Dental Implants");
  assert.equal(page.metaDescription, "Implant dentistry in Noida.");
  assert.equal(page.h1, "Dental implants in Noida");
  assert.deepEqual(page.h2s, ["Permanent tooth replacement"]);
  assert.equal(page.canonicalUrl, "https://www.example.com/dental-implants");
  assert.deepEqual(page.imageAlts, ["Northstar implant team"]);
  assert.equal(page.internalLinks[0]?.url, "https://www.example.com/services/dental-implants");
  assert.equal((page.structuredData[0] as { name: string }).name, "Northstar");
  assert.equal(page.mainText.includes("window.noise"), false);
});

test("parses robots rules with longest-match allow precedence", () => {
  const parsed = parseRobotsTxt(`
User-agent: *
Disallow: /private
Allow: /private/public
Sitemap: https://example.com/sitemap.xml
  `);

  assert.deepEqual(parsed.sitemaps, ["https://example.com/sitemap.xml"]);
  assert.equal(
    isPathAllowedByRobots(new URL("https://example.com/private/report"), parsed.rules),
    false,
  );
  assert.equal(
    isPathAllowedByRobots(new URL("https://example.com/private/public/info"), parsed.rules),
    true,
  );
});

test("parses sitemap indexes and selects a diverse relevant sample", () => {
  const index = parseSitemapDocument(
    `<?xml version="1.0"?><sitemapindex><sitemap><loc>https://example.com/pages.xml</loc></sitemap></sitemapindex>`,
    new URL("https://example.com/sitemap.xml"),
  );
  assert.equal(index.isIndex, true);
  assert.deepEqual(index.urls, ["https://example.com/pages.xml"]);

  const selected = selectRelevantPages({
    homepageUrl: "https://example.com/",
    internalLinks: [
      { text: "Dental implants", url: "https://example.com/services/dental-implants" },
      { text: "Noida clinic", url: "https://example.com/locations/noida" },
      { text: "Implants in Noida", url: "https://example.com/dental-implants-noida" },
      { text: "Our team", url: "https://example.com/about" },
    ],
    location: "Noida",
    primaryService: "Dental implants",
    sitemapUrls: [],
  });

  assert.deepEqual(
    selected.map((page) => page.pageType),
    ["homepage", "service", "location", "service-location", "relevant"],
  );
});
