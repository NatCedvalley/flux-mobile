#!/usr/bin/env node
// Renders the app icon PNGs from the SVGs in resources/icon/, with the
// Chromium that Playwright already installs for the e2e tests. Run it by hand
// after changing an SVG (`node scripts/render-icons.mjs`), and commit the
// output. Android's adaptive icon layers aren't rendered: they are vector
// drawables in android/app/src/main/res/drawable/, drawn to match.
//
// - iOS: the 1024 px light, dark and tinted icons. They must be opaque (App
//   Store Connect refuses an icon with alpha), so they're screenshots with
//   the page's own background.
// - Android: the launcher PNGs for API 24–25, which predate adaptive icons:
//   a rounded square and a circle at each density, inset to 46/48 like the
//   legacy launcher keylines, on a transparent background.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const root = fileURLToPath(new URL('..', import.meta.url));
const ios = 'ios/App/App/Assets.xcassets/AppIcon.appiconset';
const res = 'android/app/src/main/res';

const legacy = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };

const outputs = [
  { src: 'icon-ios.svg', out: `${ios}/AppIcon-512@2x.png`, size: 1024 },
  { src: 'icon-ios-dark.svg', out: `${ios}/AppIcon-Dark.png`, size: 1024 },
  { src: 'icon-ios-tinted.svg', out: `${ios}/AppIcon-Tinted.png`, size: 1024 },
  ...Object.entries(legacy).flatMap(([density, size]) => [
    {
      src: 'icon-ios.svg',
      out: `${res}/mipmap-${density}/ic_launcher.png`,
      size,
      radius: '18%',
    },
    {
      src: 'icon-ios.svg',
      out: `${res}/mipmap-${density}/ic_launcher_round.png`,
      size,
      radius: '50%',
    },
  ]),
];

const browser = await chromium.launch();
const page = await browser.newPage();
for (const { src, out, size, radius } of outputs) {
  const svg = readFileSync(`${root}resources/icon/${src}`).toString('base64');
  const inset = radius ? size / 48 : 0;
  const side = size - 2 * inset;
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<body style="margin:0;padding:${inset}px;background:${radius ? 'transparent' : '#000'}">` +
      `<img src="data:image/svg+xml;base64,${svg}" style="display:block;width:${side}px;height:${side}px;border-radius:${radius ?? 0}">`
  );
  await page.locator('img').evaluate((img) => img.decode());
  await page.screenshot({
    path: `${root}${out}`,
    omitBackground: Boolean(radius),
  });
  console.log(`${out} (${size}px)`);
}
await browser.close();
