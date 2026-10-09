# Installing exp_oe_tiptap

## Requirements

- Exponential 6.0.14 or later (the kernel ships ezoe and ezjscore).
- PHP 8.0 or later.
- ezoe and ezjscore active. exp_oe_tiptap uses ezoe's input handler, parser, dialogs and policies; it does not
  replace ezoe.
- ezformtoken active (recommended everywhere; the switch view refuses to work without a form token).
- For the AI commands only: PHP curl, and an account with a provider (see below).
- For building the JavaScript from source only: Node.js 20 or later and npm. The built files are committed, so a
  site does not need Node.

## 1. Get the extension

With Composer, in a project that manages its extensions with Composer:

```bash
composer require se7enxweb/exp_oe_tiptap
```

Or copy (or clone) the extension to `extension/exp_oe_tiptap`.

## 2. Activate it after ezoe

The order matters: exp_oe_tiptap's `ezxml.ini` replaces ezoe's input handler alias, so it must be read after
ezoe's. In `settings/override/site.ini.append.php`:

```ini
[ExtensionSettings]
ActiveExtensions[]=ezjscore
ActiveExtensions[]=ezformtoken
ActiveExtensions[]=ezoe
ActiveExtensions[]=exp_oe_tiptap
```

Check that the alias won: `php bin/php/ezexec.php` with a small script, or the admin's "Setup > Ini settings"
for `ezxml.ini [InputSettings] AliasClasses`: `eZSimplifiedXMLInput` must map to `expOETiptapXMLInput`.

## 3. Autoloads and caches

```bash
php bin/php/ezpgenerateautoloads.php -e
php bin/php/ezcache.php --clear-tag=ini --clear-tag=template --clear-id=template-override --allow-root-user
```

`template-override` matters: the extension adds new template files, and without that cache cleared the edit form
comes back with an empty field.

Then make the web runtime see the new classes:

- PHP-FPM: reload it (`systemctl reload <your php-fpm unit>`).
- Exponential Velocity: `exp:velocity restart`, or `./console exp:velocity deploy` which does every step above.

## 4. Settings

The defaults in `extension/exp_oe_tiptap/settings/exp_oe_tiptap.ini.append.php` keep ezoe as everybody's editor and
let editors with the switch policy try Tiptap. Override per siteaccess in
`settings/siteaccess/<siteaccess>/exp_oe_tiptap.ini.append.php`, for example to make Tiptap the default there:

```ini
[EditorSettings]
DefaultEditor=tiptap
```

Every setting: [doc/configuration.md](doc/configuration.md).

## 5. Policies

| Policy | Who needs it |
| --- | --- |
| `ezoe/editor` | everybody who edits with either editor (unchanged from ezoe) |
| `exp_oe_tiptap/switch` | editors who may switch between ezoe and Tiptap |
| `exp_oe_tiptap/ai` | editors who may use the AI commands (also needs `[AISettings] Enabled=true`) |

Administrators with `*` have all of them. Grant `exp_oe_tiptap/switch` to the editor roles that should compare the
two editors.

## 6. Building the JavaScript from source

Only needed when you change `src/` or upgrade Tiptap. From `extension/exp_oe_tiptap`:

```bash
npm ci                 # exact versions from package-lock.json, into node_modules/ (git-ignored)
npm run build          # writes design/standard/javascript/exp_oe_tiptap/ and design/standard/stylesheets/exp_oe_tiptap/
npm test               # the schema and round-trip tests
```

Commit the built files. Browsers reload them by themselves (the URL carries their file time).

## 7. Enabling the AI commands (optional)

1. Choose a provider ([doc/ai-hooks.md](doc/ai-hooks.md)). Content you send leaves your server unless the
   provider is self-hosted.
2. Put the key **only** in `settings/override/exp_oe_tiptap.ini.append.php`, which is never committed:
   ```ini
   [AISettings]
   Enabled=true
   Provider=openai-compatible
   Endpoint=https://api.example.com/v1/chat/completions
   Model=<model name>
   ApiKey=<your key>
   ```
3. Grant `exp_oe_tiptap/ai` to the roles that may use it.
4. Clear the INI cache (`--clear-tag=ini`) and reload PHP.

The key is used on the server only; the browser never sees it.

## 8. Verifying

1. Run the PHP tests from the Exponential root:
   ```bash
   nice -n 15 php vendor/bin/phpunit -c extension/exp_oe_tiptap/phpunit.xml.dist
   ```
2. Edit an article as an administrator. With `DefaultEditor=ezoe` you see ezoe as before plus a button
   "Switch to Tiptap" below the field.
3. Type something, press the button: the form comes back with Tiptap and your text. Press "Switch to Online
   Editor (TinyMCE)": back to ezoe, text still there.
4. Publish from Tiptap and compare the stored XML with the same text published from ezoe (they must be equal).
5. If the button does not show: the bundle is missing (`design/standard/javascript/exp_oe_tiptap/exp_oe_tiptap.js`),
   `AllowSwitch=disabled`, or the user lacks `exp_oe_tiptap/switch`. See
   [doc/maintenance.md](doc/maintenance.md#troubleshooting).

## Removing it

Remove `exp_oe_tiptap` from `ActiveExtensions`, regenerate autoloads, clear the INI and template caches. ezoe takes
over again with nothing to migrate: the content was ezxmltext all along. The stored preference `exp_oe_editor` of
each user is simply no longer read.
