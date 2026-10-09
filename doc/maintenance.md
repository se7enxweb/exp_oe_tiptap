# Maintenance

## Rebuilding the bundle

From `extension/exp_oe_tiptap` (Node.js 20 or later):

```bash
npm ci                  # exact versions from package-lock.json
nice -n 15 npm run build
nice -n 15 npm test
```

The build writes `design/standard/javascript/exp_oe_tiptap/` and `design/standard/stylesheets/exp_oe_tiptap/`.
Commit them together with the source change. No cache needs clearing for the browser: the asset URLs carry a key
made of the files' modification times (`expOETiptapEditor::cacheKey()`). With `AssetLoading=ezjscore`, clear the
packer cache and template-block cache instead (`--clear-tag=template --clear-id=template-block`, and the packed
files with `ezjscore-packer`).

`node_modules/` stays inside the extension and is git-ignored.

## Upgrading Tiptap

1. Read Tiptap's changelog for every version between the pinned one and the target.
2. Change the exact versions in `package.json` (all `@tiptap/*` packages to the same version; never ranges).
3. `npm install`, then `npm ci` to confirm the lock file is consistent.
4. `npm run build`, `npm test` (schema and round-trip tests must stay green), then the PHP suites below.
5. Check by hand in the admin: one article with tables, embeds and custom tags, switch both ways, publish, compare
   the stored XML with the version published before the upgrade.
6. Update the version of Tiptap named in `ezinfo.php` and `extension.xml` (`<uses>`), and the extension's own
   version for the release.

Only MIT (or compatible) packages may be added. Tiptap's Pro extensions are not used.

## The test suites

| Suite | Run | What |
| --- | --- | --- |
| PHP unit | `nice -n 15 php vendor/bin/phpunit -c extension/exp_oe_tiptap/phpunit.xml.dist` (from the Exponential root) | editor choice, switch view, metadata, input handler; round trip (`tests/php/roundtrip/`); AI hooks with a fake provider (`tests/php/ai/`) |
| One file | `nice -n 15 php vendor/bin/phpunit extension/exp_oe_tiptap/tests/php/EditorChoiceTest.php` | |
| JS | `npm test` in the extension | schema and conversion (`tests/js/schema/`), UI (`tests/js/ui/`) |
| Round trip | see [content-mapping.md](content-mapping.md) | ezxml -> ezoe HTML -> Tiptap -> ezoe HTML -> ezxml over the fixtures in `tests/fixtures/` |

No suite needs a database or network; the AI tests use a fake provider. Run them on 8.0 and the current PHP
before a release.

## Releasing

Follow the root `AGENTS.md`: choose the next version from the published tags (`git tag -l 'v*'
--sort=version:refname`, `gh release list`), write it into `ezinfo.php` and `extension.xml`, commit, then tag that
commit. A pushed tag is never moved.

## Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| No switch button | `AllowSwitch=disabled`; user lacks `exp_oe_tiptap/switch`; bundle missing (the button to Tiptap is hidden then) | check the setting, the role, the file `design/standard/javascript/exp_oe_tiptap/exp_oe_tiptap.js` |
| ezoe as before, no trace of exp_oe_tiptap | `extension.xml` changed to `<requires>ezoe` instead of `<extends>ezoe`, so ezoe's settings are read last and its alias wins; autoloads not regenerated; INI cache | order, `ezpgenerateautoloads.php -e`, `--clear-tag=ini`, reload PHP / restart Velocity |
| Empty text field area after activation | template override cache does not know the new templates | `--clear-id=template-override` |
| Plain textarea with HTML in it instead of Tiptap | bundle not loaded (404, JS error) | browser console: "exp_oe_tiptap: the editor bundle is not loaded"; rebuild, check `Scripts[]`, check the design path |
| Content changes after saving from Tiptap | a round-trip gap in the schema | switch the user back to ezoe; add the content as a fixture (see content-mapping.md) and fix the schema |
| "Access denied" on `exp_oe_tiptap/switch` | not a POST, missing or wrong form token, or no `switch` policy | use the form; ezformtoken must be active |
| Switch works but the old editor comes back | AllowSwitch was turned off, or the policy was removed: stored preferences are then ignored | expected |
| Velocity shows the old editor after deploy | workers keep classes loaded at warm-up | `exp:velocity restart` (or `exp:velocity deploy`) |
| AI menu missing | `Enabled=false`, no `exp_oe_tiptap/ai`, bundle built without AI | settings, role |
| AI error message | provider unreachable, wrong key, timeout, text too long | see [ai-hooks.md](ai-hooks.md); the debug log names the provider error |
