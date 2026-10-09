# Configuration

All settings of exp_oe_tiptap, and the settings of other files it relies on.

Where to put them:

- the defaults: `extension/exp_oe_tiptap/settings/` (do not edit them on a site);
- per siteaccess: `settings/siteaccess/<siteaccess>/exp_oe_tiptap.ini.append.php`;
- site wide and secrets: `settings/override/exp_oe_tiptap.ini.append.php` (never committed).

After a change: `php bin/php/ezcache.php --clear-tag=ini --allow-root-user`, then reload PHP-FPM or restart
Velocity.

## exp_oe_tiptap.ini

### [EditorSettings]

| Setting | Default | Meaning |
| --- | --- | --- |
| `DefaultEditor` | `ezoe` | The editor of users without a preference of their own: `ezoe` or `tiptap`. Any other value means `ezoe`. `tiptap` falls back to `ezoe` while the bundle is missing. Per siteaccess. |
| `AllowSwitch` | `enabled` | `enabled`: users with the policy `exp_oe_tiptap/switch` get the switch button, and their stored preference is used. `disabled`: no button, every stored preference is ignored, everybody gets `DefaultEditor`. |
| `AssetLoading` | `ezdesign` | `ezdesign`: `<script>`/`<link>` tags pointing at the built files, with `?v=<file time key>`; the files are never repacked. `ezjscore`: `ezscript_require()`/`ezcss_require()`, packed with the page by ezjscore (only if ezjscore's packer leaves the modern bundle intact). |
| `Scripts[]` | `exp_oe_tiptap/exp_oe_tiptap.js` | The built scripts, design paths below `javascript/`. The first is the bundle defining `window.ExpOETiptap`; Tiptap counts as available only while that file exists. |
| `Styles[]` | `exp_oe_tiptap/exp_oe_tiptap.css` | The built styles, design paths below `stylesheets/`. |
| `MinHeight` | `300` | Minimum height of the editing area in pixels. The class attribute's "number of text rows" can make it taller. |

### [AISettings]

Read by the server function `expoetiptap::ai`; see [ai-hooks.md](ai-hooks.md) for the provider details.

| Setting | Default | Meaning |
| --- | --- | --- |
| `Enabled` | `false` | `true` offers the AI commands to users with the policy `exp_oe_tiptap/ai`. |
| `Provider` | `openai-compatible` | `openai-compatible` (OpenAI chat completions API: OpenAI, Azure OpenAI, Mistral, Ollama, vLLM ...), `anthropic` (Anthropic Messages API), `tiptap-cloud` (Tiptap's hosted service). |
| `Endpoint` | empty | The provider's API URL. |
| `Model` | empty | The model name the provider expects. |
| `ApiKey` | empty | The API key. **Only in settings/override.** Never sent to the browser. |
| `Timeout` | `30` | Seconds to wait for the provider. |
| `MaxInputLength` | `20000` | Longest text in characters a command may send. |
| `MaxOutputTokens` | `2000` | Longest answer a command may ask for. |
| `Commands[]` | improve, shorten, extend, fix_spelling, translate, summarise, continue | The commands offered, in this order. |

## Other files exp_oe_tiptap ships

| File | Setting | Why |
| --- | --- | --- |
| `ezxml.ini` | `[InputSettings] AliasClasses[eZSimplifiedXMLInput]=expOETiptapXMLInput` | Makes the extension's input handler the one ezxmltext uses. Wins over ezoe's alias because extension.xml declares `<extends>ezoe`, which makes the settings load after ezoe's in any `ActiveExtensions` order. |
| `design.ini` | `[ExtensionSettings] DesignExtensions[]=exp_oe_tiptap` | The templates, scripts and styles. |
| `module.ini` | `ModuleList[]=exp_oe_tiptap` | The view `exp_oe_tiptap/switch` and the policy functions `switch`, `ai`. |
| `site.ini` | `TranslationExtensions[]=exp_oe_tiptap`, `ModuleViewAccessMode[exp_oe_tiptap/*]=keep` | Translations (context `extension/exp_oe_tiptap`); no SSL zone change. |
| `ezjscore.ini` | `[ezjscServer_expoetiptap] Class=expOETiptapServerFunctions` | The AI server function `ezjscore/call/expoetiptap::ai`. |

## Settings of ezoe that Tiptap follows

Tiptap reads the same settings as ezoe, so one configuration serves both editors:

| File | Setting | Used for |
| --- | --- | --- |
| `ezoe.ini` | `[EditorLayout] Buttons[]` (and its siteaccess/class variants, through `editor_layout_settings`) | which toolbar buttons exist, in which order |
| `ezoe.ini` | `[EditorLayout] PathLocation`, `ToolbarLocation` | status bar and toolbar position |
| `ezoe.ini` | `[EditorSettings] Skin`, `CustomAttributeStyleMap`, `UploadFileExtensions[]`, `UploadFromUrl` | skin class, custom attribute styles, upload rules |
| `content.ini` | `[CustomTagSettings]`, `[paragraph]`, `[link]`, `[table]`, `[embed]`, `[embed-inline]`, ... `AvailableClasses`, `CustomAttributes`, `AvailableViewModes` | classes, custom attributes, custom tags, view modes |
| `ezoe_attributes.ini` | everything | types and titles of custom attributes in the dialogs |
| `design.ini` | `[StylesheetSettings] EditorCSSFileList[]` | the content CSS of the editing area |
| `image.ini` | `[AliasSettings] AliasList[]` | image sizes of embeds |

## Preferences

| Preference | Values | Set by |
| --- | --- | --- |
| `exp_oe_editor` | `ezoe`, `tiptap`, empty (= site default) | the switch button and `exp_oe_tiptap/switch` |

ezoe's own preference `ezoe_engine` (TinyMCE 3 or 8) is independent: it applies whenever the user is on ezoe.
