import assert from "node:assert/strict";
import test from "node:test";

import { scanWebsite } from "../src/lib/scanner/scan-website.ts";
import type { FetchLike } from "../src/lib/scanner/safe-fetch.ts";
import type { HostResolver } from "../src/lib/security/public-url.ts";

const publicResolver: HostResolver = async () => [
  { address: "93.184.216.34", family: 4 },
];

function html(title: string, h1: string, links = "") {
  return `<!doctype html><html><head><title>${title}</title><meta name="description" content="${title} description"></head><body><main><h1>${h1}</h1><p>Focused page content for the website analysis fixture.</p>${links}</main></body></html>`;
}

test("scans a bounded homepage, sitemap, and relevant-page sample", async () => {
  const responses = new Map<string, Response>([
    [
      "https://example.com/",
      new Response(
        html(
          "Northstar Dental",
          "Dental care in Noida",
          '<a href="/services/dental-implants">Dental implants</a><a href="/locations/noida">Noida clinic</a><a href="/dental-implants-noida">Dental implants in Noida</a><a href="/about">About us</a>',
        ),
        { status: 200, headers: { "content-type": "text/html" } },
      ),
    ],
    [
      "https://example.com/robots.txt",
      new Response(
        "User-agent: *\nDisallow: /private\nSitemap: https://example.com/sitemap.xml",
        { status: 200, headers: { "content-type": "text/plain" } },
      ),
    ],
    [
      "https://example.com/sitemap.xml",
      new Response(
        "<?xml version=\"1.0\"?><urlset><url><loc>https://example.com/services/dental-implants</loc></url><url><loc>https://example.com/locations/noida</loc></url><url><loc>https://example.com/dental-implants-noida</loc></url><url><loc>https://example.com/about</loc></url></urlset>",
        { status: 200, headers: { "content-type": "application/xml" } },
      ),
    ],
    [
      "https://example.com/services/dental-implants",
      new Response(html("Dental implants", "Dental implant treatment"), {
        status: 200,
        headers: { "content-type": "text/html" },
      }),
    ],
    [
      "https://example.com/locations/noida",
      new Response(html("Noida clinic", "Our Noida clinic"), {
        status: 200,
        headers: { "content-type": "text/html" },
      }),
    ],
    [
      "https://example.com/dental-implants-noida",
      new Response(html("Implants in Noida", "Dental implants in Noida"), {
        status: 200,
        headers: { "content-type": "text/html" },
      }),
    ],
    [
      "https://example.com/about",
      new Response(html("About Northstar", "About our team"), {
        status: 200,
        headers: { "content-type": "text/html" },
      }),
    ],
  ]);
  const calls: string[] = [];
  const fetchImpl: FetchLike = async (input) => {
    const url = input.toString();
    calls.push(url);
    const response = responses.get(url);
    if (!response) throw new Error(`Unexpected request: ${url}`);
    return response.clone();
  };

  const result = await scanWebsite(
    {
      location: "Noida",
      primaryService: "Dental implants",
      websiteUrl: "https://example.com/",
    },
    { fetchImpl, resolver: publicResolver },
  );

  assert.equal(result.pages.length, 5);
  assert.deepEqual(
    result.pages.map((page) => page.pageType),
    ["homepage", "service", "location", "service-location", "relevant"],
  );
  assert.equal(result.sitemapUrl, "https://example.com/sitemap.xml");
  assert.equal(result.robots.fetched, true);
  assert.equal(calls.length, 7);
});
