# exp_oe_tiptap: the plan

Task #333, 2026-10-09. The contract every part of the extension is built to. Agents B (content mapping) and
C (editor UI, build, AI) read this file; the shared contract points are in section 5.

## 1. What it is

A second online editor for ezxmltext fields in Exponential 6, built on Tiptap (MIT, ProseMirror based), that
an editor can switch to and from the existing Online Editor (ezoe, TinyMCE) on the fly, so both can be compared
on the same content before one is fine tuned. Tiptap's AI hooks are offered through a provider-agnostic server
call that is off by default.

Links: https://tiptap.dev/product/editor , https://tiptap.dev/product/ai-toolkit

## 2. Architecture

```
 ezxmltext (database, unchanged)
      |  eZOEXMLInput::inputXML()            (ezoe, unchanged)
      v
 ezoe editor HTML dialect  ---- textarea ContentObjectAttribute_data_text_<id> ----+
      |                                                                             |
      |  either TinyMCE (ezoe)            or  Tiptap (exp_oe_tiptap)                |
      |  ezxmltext_ezoe.tpl                   ezxmltext_exp_oe_tiptap_editor.tpl    |
      |                                       window.ExpOETiptap.init()            |
      v                                                                             |
 same POST field, same HTML dialect  <---------------------------------------------+
      |  eZOEInputParser (ezoe, unchanged)
      v
 ezxmltext
```

1. **Same storage, same parser.** Tiptap edits the HTML that `eZOEXMLInput::inputXML()` produces and posts it
   back in the same field; `eZOEInputParser` turns it into ezxml exactly as for TinyMCE. Nothing in the
   database, the output handlers or the templates that render content changes. The Tiptap schema mirrors the
   ezoe dialect 1:1 (Agent B, doc/content-mapping.md).
2. **Input handler.** `expOETiptapXMLInput extends eZOEXMLInput`, registered in ezxml.ini
   `[InputSettings] AliasClasses[eZSimplifiedXMLInput]=expOETiptapXMLInput`. Because exp_oe_tiptap comes after
   ezoe in ActiveExtensions, this line wins over ezoe's own `AliasClasses[eZSimplifiedXMLInput]=eZOEXMLInput`.
   The subclass changes one thing: the edit template. `editTemplateSuffix()` returns `exp_oe_tiptap`, and
   `ezxmltext_exp_oe_tiptap.tpl` includes either ezoe's own `ezxmltext_ezoe.tpl` (unchanged, with its engine
   registry, TinyMCE 3 or 8) or the Tiptap template, followed by the switch button. Validation, parsing,
   `isValid()`, policies (`ezoe/editor`, `ezoe/disable_editor`), "Disable editor" and the ezoe engine switch
   all stay ezoe's. ezoe must stay installed and active.
3. **The editor choice** (`expOETiptapEditor::resolve()`), first match wins:
   1. the per-request choice, set by the switch action while the same request renders the form again;
   2. the user preference `exp_oe_editor` (eZPreferences), honoured only while `AllowSwitch=enabled` and the
      user has the policy `exp_oe_tiptap/switch`;
   3. `exp_oe_tiptap.ini [EditorSettings] DefaultEditor` (per siteaccess, default `ezoe`).

   `tiptap` is only ever returned when the built bundle is present on disk; otherwise the editor falls back to
   ezoe, so a missing build never leaves an editor without an editor.
4. **The switch.** Two ways, one store (`expOETiptapEditor::setUserEditor()`):
   - In the edit form: a submit button `CustomActionButton[<attribute id>_exp_oe_switch_<editor>]`. A custom
     action makes content/edit validate and store the whole draft first (exactly the path of ezoe's "Disable
     editor"), then `expOETiptapXMLInput::customObjectAttributeHTTPAction()` stores the preference and sets the
     per-request choice, and the form comes back with the other editor and the text just typed. The form token
     of ezformtoken protects it like every content/edit POST.
   - Outside the edit form: the view `exp_oe_tiptap/switch` (POST only, form token checked by the view itself
     in addition to ezformtoken, `RedirectURI` limited to a local path), for a preferences page or a link from
     the toolbar of another tool. It cannot store a draft (it is a different request), so the edit form always
     uses the custom action.
5. **AI hooks** (Agent C). Off by default (`[AISettings] Enabled=false`). The browser calls the ezjscore server
   function `expoetiptap::ai`; the server checks the policy `exp_oe_tiptap/ai` and the form token, then calls the
   configured provider (openai-compatible, anthropic, tiptap-cloud) server side. The key lives only in
   settings/override and never reaches the browser. Tiptap's paid Pro AI extensions are not used.
6. **Look and feel.** Toolbar, icons, dialogs and status bar styled like ezoe's TinyMCE skin; ezoe's own dialogs
   (link, embed and object browser, upload, custom tag, table) are reused through the same `/ezoe/...` URLs.

## 3. Phases

| Phase | Goal | Done when |
| --- | --- | --- |
| v1 compare-ready | Both editors on the same attribute, switchable; Tiptap covers every tag ezoe supports with a lossless round trip; ezoe dialogs reused; AI off but wired | round-trip suite green on alpha's real content, switch keeps unsaved text, both editors usable in admin, admin3 and admin4 |
| v2 fine tuning | Owner and editors compare; toolbar order, keyboard shortcuts, paste cleanup, table editing, native dialogs where ezoe's are clumsy, translations | owner picks the default editor per siteaccess |
| v3 AI polish | Provider chosen, prompts tuned, suggestion UX (diff, partial accept), cost limits, audit of AI use | AI enabled on one siteaccess for a pilot group |

## 4. Risks

| Risk | Effect | Mitigation |
| --- | --- | --- |
| Round trip not lossless (custom tags, nested tables, inline embeds, `customattributes`, empty paragraphs, `&nbsp;`) | content silently changes when saved from Tiptap | B's fixture suite from alpha's real content; the switch falls back to ezoe per user; DefaultEditor stays ezoe until the suite is green |
| ProseMirror normalises structure ezoe allows (block inside inline, list in paragraph) | structural drift | schema mirrors the dialect including ezoe's quirks; fixtures cover them |
| Two editors on one page (TinyMCE 3 globals and Tiptap) | conflicts | one editor per request and user; the switch reloads the form |
| ezoe dialogs assume TinyMCE (`tinyMCEPopup`) | dialogs cannot write back into Tiptap | C supplies a small `tinyMCEPopup` shim or Tiptap-native dialogs for the few that do not work |
| Bundle missing or stale on a site | no editor | `isAvailable()` falls back to ezoe; the bundle is committed and cache-busted by file time |
| ezjscore packer minifying modern JS | broken bundle | default `AssetLoading=ezdesign` loads the built file directly like ezoe's TinyMCE 8 engine |
| AI provider: cost, data leaving the server, licence | money and privacy | off by default, policy-gated, key only in override, length limits, provider chosen by the owner |
| Upstream Tiptap changes | rebuild breaks | exact npm versions pinned, upgrade procedure in doc/maintenance.md |
| Velocity workers keep old classes | stale handler after deploy | `exp:velocity deploy` after activation (doc/maintenance.md) |

## 5. Contract between the agents

- **Bundle files** (C builds, A loads): `design/standard/javascript/exp_oe_tiptap/exp_oe_tiptap.js` (one classic
  script, IIFE, no ES module import at run time) and `design/standard/stylesheets/exp_oe_tiptap/exp_oe_tiptap.css`.
  Names are settings (`[EditorSettings] Scripts[]`, `Styles[]`), so C may add more files. The PHP side treats
  the first script as "the bundle" for `isAvailable()` and the cache key.
- **Entry point** (C): `window.ExpOETiptap.init( textareaElement, options )`, called once per attribute after
  the bundle has loaded. The textarea holds the ezoe HTML (`$input_handler.input_xml`), and init must write the
  editor's ezoe HTML back into it before the form is submitted (any submit button, including the switch and
  "Disable editor").
- **options** (A builds them in the template, from INI and the input handler; all keys always present; an empty
  map arrives as `[]` from json_encode, so treat `[]` and `{}` alike for `linkClasses`, `customTags`, `i18n` ...):

  | key | value |
  | --- | --- |
  | `attributeId`, `contentObjectId`, `version`, `language` | the attribute being edited |
  | `rows` | the class attribute's text rows, for the initial height |
  | `buttons` | ezoe.ini `[EditorLayout] Buttons[]` (via `editor_layout_settings`), ezoe button names, the toolbar C maps |
  | `pathLocation`, `toolbarLocation` | from `editor_layout_settings` |
  | `skin`, `contentCss` | ezoe.ini `Skin`, design.ini `EditorCSSFileList` resolved |
  | `xmlTagAlias`, `customTags`, `literal`, `tableDefinitions`, `generalDefinitions`, `embedDefinitions` | the same structures ezoe's TinyMCE 8 template gets from the input handler |
  | `linkClasses`, `linkViewModes`, `customAttributeStyleMap`, `imageSizes`, `viewModes`, `defaultSize` | content.ini / ezoe.ini, as for TinyMCE 8 |
  | `urls` | `root`, `ezoe` (`/ezoe`), `ezjscore` (`/ezjscore`), both without the trailing slash (ezurl strips it), `contentEdit`, `switch` (the view) |
  | `formToken` | the ezformtoken token (the `@$ezxFormToken@` placeholder replaced on output) |
  | `switchButtonName`, `disableButtonName` | names of the form buttons the toolbar may click (`''` when absent) |
  | `ai` | `{ enabled: bool, commands: [..], call: 'expoetiptap::ai' }`; `enabled` true only when AI is on and the user has `exp_oe_tiptap/ai` |
  | `i18n` | English text => translation (context `extension/exp_oe_tiptap`), placeholders such as `%editor` kept; a text missing from the map stays English. Sources: the list in `expOETiptapEditor::$strings` plus `strings.json` (a JSON array of English texts) that the build may write next to the bundle |
  | `editorLabel`, `otherEditorLabel` | translated names of the current and the other editor (for "Switch to %editor") |
  | `minHeight`, `uploadExtensions`, `uploadFromUrl` | `[EditorSettings] MinHeight`; ezoe.ini upload rules |
  | `locale` | the http locale, e.g. `de-DE` |
- **Schema** (B): `src/js/schema/index.js` exports `ezoeExtensions(options)` and `toEditorHTML/fromEditorHTML`; C
  imports it from `src/js/index.js`.
- **AI settings** (A writes the INI, C reads them): `[AISettings] Enabled, Provider, Endpoint, Model, ApiKey,
  Timeout, MaxInputLength, MaxOutputTokens, Commands[]`. The ezjscore registration
  `[ezjscServer_expoetiptap] Class=expOETiptapServerFunctions` is in A's ezjscore.ini; the class is C's.
- **Policies** (A): module `exp_oe_tiptap`, functions `switch` and `ai`. C checks `ai` with
  `eZUser::currentUser()->hasAccessTo( 'exp_oe_tiptap', 'ai' )`.
- **PHP tests**: `tests/php/bootstrap.php` (A) loads the kernel and the extension's classes without a database;
  B's `tests/php/roundtrip/` and C's `tests/php/ai/` may require it.

## 6. Decisions for the owner

Defaults are chosen so v1 can be built; each one is open to change.

1. **AI provider, licence and cost.** Default: none enabled. The code supports an OpenAI-compatible endpoint
   (covers OpenAI, Azure OpenAI, Mistral, local servers such as Ollama or vLLM), Anthropic, and Tiptap Cloud.
   To decide: which provider, who pays, whether content may leave the server (a self-hosted model keeps it),
   and whether Tiptap Cloud's terms are acceptable. Tiptap's Pro AI extensions are not used either way.
2. **Switch granularity.** Default: per user (eZPreferences `exp_oe_editor`), with a per-siteaccess default
   (`DefaultEditor`) and a policy (`exp_oe_tiptap/switch`) for who may switch. Alternatives: per content class
   or attribute, or per section.
3. **v1 feature scope.** Default: everything ezoe supports, lossless, with ezoe's dialogs reused; no collaboration,
   no comments, no track changes, no Tiptap Pro extensions. To confirm: is reusing the ezoe dialogs acceptable for
   v1, or must v1 already have native Tiptap dialogs?
4. **Who may switch.** Default: the `exp_oe_tiptap/switch` policy, which administrators have through `*`; editor
   roles need it granted for the comparison.
5. **Relation to ezoe's own engine registry.** ezoe already has `ezoe.ini [EditorSettings] Engines[]` (TinyMCE 3
   and 8). Tiptap is deliberately a separate extension and choice (brief), so ezoe stays untouched; registering
   Tiptap as a third ezoe engine later is possible and would merge the two switches into one.
