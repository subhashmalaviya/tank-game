import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
const url = process.argv[2] ?? 'http://localhost:5173';
const out = 'artifacts/mobile-controls';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
});
try {
  const context = await browser.newContext({
    viewport: { width: 667, height: 375 },
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(url);
  await page.getByRole('button', { name: 'Play with friends ◈', exact: true }).click();
  await page.getByRole('textbox', { name: 'Your callsign', exact: true }).fill('UI Test');
  await page.getByRole('button', { name: 'Create a private room ↗', exact: true }).click();
  await page.getByRole('combobox', { name: 'Player limit', exact: true }).selectOption('2');
  await page.getByRole('combobox', { name: 'AI pilots', exact: true }).selectOption('1');
  await page.getByRole('combobox', { name: 'Turn timer', exact: true }).selectOption('120');
  await page.getByRole('combobox', { name: 'Map', exact: true }).selectOption('desert');
  await page.getByRole('button', { name: 'Apply match rules', exact: true }).click();
  await page.getByRole('button', { name: 'Select TITAN', exact: true }).click();
  await page.getByRole('button', { name: 'Mark ready', exact: true }).click();
  await page.getByRole('button', { name: 'Launch battle →', exact: true }).click();
  await page.locator('#lock-shot').waitFor();
  const angle = () => page.locator('#angle-value').textContent().then(parseFloat);
  const fuel = () => page.locator('#fuel').textContent().then(parseFloat);
  const power = () => page.locator('#power-value').textContent().then(parseFloat);
  const original = await angle();
  const stick = page.locator('#aim-stick');
  const b = await stick.boundingBox();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width * 0.2, b.y + b.height * 0.2);
  await page.mouse.up();
  assert.ok((await angle()) > original + 30);
  const p = await power();
  await page
    .getByRole('button', { name: 'Increase power', exact: true })
    .filter({ visible: true })
    .tap();
  assert.ok((await power()) > p);
  const up = page
    .getByRole('button', { name: 'Increase power', exact: true })
    .filter({ visible: true });
  const ub = await up.boundingBox();
  await page.mouse.move(ub.x + 22, ub.y + 22);
  await page.mouse.down();
  await page.waitForTimeout(350);
  await page.mouse.up();
  const held = await power();
  assert.ok(held > p + 4);
  await page.waitForTimeout(150);
  assert.equal(await power(), held);
  const f = await fuel();
  await page.getByRole('button', { name: 'Move right', exact: true }).tap();
  await page.waitForTimeout(150);
  assert.ok((await fuel()) < f);
  await page.mouse.down();
  await up.dispatchEvent('pointercancel', { pointerId: 1 });
  await page.mouse.up();
  const stopped = await power();
  await page.waitForTimeout(150);
  assert.equal(await power(), stopped);
  await page.getByRole('button', { name: 'Standard shell', exact: true }).tap();
  assert.equal(
    await page
      .getByRole('button', { name: 'Standard shell', exact: true })
      .getAttribute('aria-pressed'),
    'true',
  );
  await page.locator('#toast.show').waitFor({ state: 'detached' });
  for (const [width, height] of [
    [568, 320],
    [667, 375],
    [844, 390],
    [390, 844],
  ]) {
    await page.setViewportSize({ width, height });
    await expect
      .poll(
        async () => {
          const r = await page.locator('canvas').boundingBox();
          return [Math.round(r.width), Math.round(r.height)];
        },
        { timeout: 3000 },
      )
      .toEqual([width, height]);
    const boxes = await page
      .locator('#aim-stick,[data-hold],#lock-shot,#super-toggle,#ability-toggle,#expand-inventory')
      .evaluateAll((els) =>
        els
          .filter((e) => e.getBoundingClientRect().width > 0)
          .map((e) => ({
            label: e.getAttribute('aria-label') || e.id,
            r: e.getBoundingClientRect().toJSON(),
          })),
      );
    for (const { label, r } of boxes) {
      assert.ok(r.width >= 40 && r.height >= 40, label + ' touch size');
      assert.ok(
        r.left >= 0 && r.right <= width + 0.5 && r.top >= 0 && r.bottom <= height + 0.5,
        label + ' viewport',
      );
    }
    for (let i = 0; i < boxes.length; i++)
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i].r,
          b = boxes[j].r;
        assert.ok(
          Math.min(a.right, b.right) - Math.max(a.left, b.left) <= 1 ||
            Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) <= 1,
          boxes[i].label + ' overlaps ' + boxes[j].label,
        );
      }
    const canvas = await page.locator('canvas').boundingBox();
    assert.equal(Math.round(canvas.width), width);
    assert.equal(Math.round(canvas.height), height);
    assert.equal(await page.locator('.joystick:visible').count(), 1);
    await page.screenshot({ path: `${out}/${width}x${height}.png` });
  }
  await page.setViewportSize({ width: 667, height: 375 });
  await page.getByRole('button', { name: 'Expand weapon inventory', exact: true }).tap();
  assert.ok((await page.locator('[data-weapon]:visible').count()) > 4);
  await page.getByRole('button', { name: 'Expand weapon inventory', exact: true }).tap();
  await page.getByRole('button', { name: 'Reflective Aegis READY', exact: true }).tap();
  await page.getByRole('button', { name: 'Reflective Aegis PENDING', exact: true }).waitFor();
  await page.locator('#lock-shot').tap();
  await page.getByRole('button', { name: 'Reflective Aegis USED', exact: true }).waitFor();
  assert.ok(await page.getByRole('button', { name: 'Move left', exact: true }).isDisabled());
  await page.reload();
  await page.getByRole('button', { name: 'Reflective Aegis USED', exact: true }).waitFor();
  assert.deepEqual(errors, []);
  // A separate fine-pointer context exercises desktop controls against the same app.
  const desktop = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const d = await desktop.newPage();
  await d.goto(url);
  await d.getByRole('button', { name: /01 \/ TRAINING GROUNDS/ }).click();
  await d.locator('#lock-shot').waitFor();
  await d.locator('#lock-shot').focus();
  await d.keyboard.press('2');
  assert.equal(
    await d
      .getByRole('button', { name: 'Standard shell', exact: true })
      .getAttribute('aria-pressed'),
    'true',
  );
  const dp = parseFloat(await d.locator('#power-value').textContent());
  await d.keyboard.down('w');
  await d.waitForTimeout(250);
  await d.keyboard.up('w');
  assert.ok(parseFloat(await d.locator('#power-value').textContent()) > dp);
  assert.equal(await d.locator('.move-overlay:visible').count(), 0);
  await d.screenshot({ path: `${out}/1366x768.png` });
  await d.keyboard.press('q');
  await d.getByRole('button', { name: 'Reflective Aegis PENDING', exact: true }).waitFor();
  await d.keyboard.press('Space');
  await d.getByRole('button', { name: 'Reflective Aegis USED', exact: true }).waitFor();
  console.log(
    JSON.stringify({
      ok: true,
      sizes: ['568x320', '667x375', '844x390', '390x844', '1366x768'],
      checks: [
        'touch aim/movement/power',
        'hold and release',
        'pointer cancellation',
        'weapon selection',
        'no control overlap',
        'full canvas',
        'expanded inventory',
        'superpower lock and refresh persistence',
        'desktop keyboard',
      ],
      screenshots: out,
    }),
  );
} finally {
  await browser.close();
}
