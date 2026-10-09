# AI hooks of the Tiptap editor

The Tiptap editor of `exp_oe_tiptap` offers an AI assistant: improve, shorten, extend, fix spelling and grammar,
translate, summarise and continue writing. It is **off by default**. When it is on, only users with the policy
`exp_oe_tiptap/ai` see it, and every request is checked again on the server.

The assistant is built on open (MIT) Tiptap packages and code of this extension. Tiptap's paid Pro AI extensions
(AI Toolkit, Content AI) are not used and not needed.

## How it works

```
 editor (browser)                         Exponential server                         provider
 ----------------                         ------------------                         --------
 AI button -> command menu
 selection or whole document as markup:
 text, simple tags, placeholders
 POST /ezjscore/call                 ->   expOETiptapServerFunctions::ai()
   expoetiptap::ai, ezxform_token,          [AISettings] Enabled?   policy exp_oe_tiptap/ai?
   command, text, language, locale,         POST?  form token?  command offered?  length?
   format=markup (strict=1 on a retry)
                                            prompt (expOETiptapAIPrompts)
                                            provider call with the key           ->  OpenAI compatible API
                                              (timeout, answer size limit)       <-  or Anthropic Messages API
                                                                                     or your own class
 check the answer                    <-   { text, command, model }
   every placeholder once, links kept?
   (no: ask once more with strict=1)
 suggestion panel
   word diff with the items as chips
   Accept / Insert below / Try again / Reject
```

- The browser never talks to the provider and never sees the key. It only calls the ezjscore server function
  `expoetiptap::ai` of the same site, with the session cookie and the form token.
- While a suggestion is shown the editor is read-only, so the text the suggestion replaces cannot move.
  Nothing changes in the document (or in the posted field) until the editor presses Accept or Insert.
- Rewriting commands (improve, shorten, extend, fix spelling, translate, custom commands) show a word diff and
  replace the input. Summarise inserts below the input, continue writing inserts at the cursor.
- With nothing selected, the input is the whole document. Either way the assistant only changes wording: every
  embed, image, custom tag, anchor, table and literal comes back as it was and where it was, and formatting, links,
  headings and lists stay (see the next section).

## Keeping embeds, custom tags and formatting

The editor does not send plain text. `src/js/ai/structure.js` turns the selection or the document into a small
HTML-like markup the model can edit safely, keeps the original nodes behind it in the browser, checks the answer and
rebuilds the document from it.

### The markup

| In the document | In the markup |
| --- | --- |
| paragraph, heading, bulleted and numbered list, list item | `<p>`, `<h1>`..`<h6>`, `<ul>`, `<ol>`, `<li>`; one block per line |
| bold, italic, underline, subscript, superscript, line break | `<b>`, `<i>`, `<u>`, `<sub>`, `<sup>`, `<br>` |
| link | `<a href="L1">`: `L1` is a reference; the URL, object or node id, target, title and the other attributes stay in the browser |
| an element with attributes (alignment, class, custom attributes, a formatted mark) | the tag gets `k="B1"` (blocks) or `k="M1"` (marks), a reference to its attributes |
| embedded object, inline object, image | placeholder `⟦E1⟧` |
| anchor | placeholder `⟦A1⟧` |
| custom tag: block, inline (with the text under it) or image | placeholder `⟦C1⟧`; its content is kept as it is |
| table | placeholder `⟦T1⟧` |
| literal (`<pre>`) | placeholder `⟦P1⟧` |
| any other node | placeholder `⟦X1⟧` |

Example: `<p>Our new gym ⟦E1⟧ opens <a href="L1">in May</a> with <b>free</b> trial classes ⟦C1⟧.</p>`

- Each placeholder stands for exactly one original node (or, for an inline custom tag, the run of text under it).
  Its content is never sent: the provider does not need it, and it is data it should not get.
- **Tables are one placeholder.** Rewriting a whole document leaves the text in tables alone, and nothing about a
  table (rows, cells, widths, classes) can be lost. To rewrite text in a table, select text inside one cell: that is
  sent like any other selection. A selection of several cells (a cell selection) is refused with a message.
- The same holds for block custom tags (fact boxes, quotes, ...): their content is kept as it is. Select text inside
  one to rewrite it.
- A selection inside one paragraph is sent as inline markup without block tags and replaces exactly the selected
  range; a selection across blocks is sent as blocks and the partial first and last blocks are joined back to the
  text around them.

### Per command

| Command | Placeholders and links in the answer | Applied by |
| --- | --- | --- |
| improve, shorten, extend, fix_spelling, custom commands | every placeholder exactly once, every link kept (its words may change) | Accept: replaces the input; Insert below: adds the text without items |
| translate | the same; the text is translated, placeholders, tag names, `href` and `k` values are not | as above |
| summarise | none: the summary is new text, the items stay in the original. The panel says so. Placeholders or links in the answer are left out. | Insert below |
| continue | none: the continuation is new text; the context before the cursor is sent as markup so the model knows where items are | Insert at the cursor |

The server tells the model these rules (`expOETiptapAIPrompts`, format `markup`) and lists the placeholders and links
of the input it must keep. A prompt from `[AICommand_<id>]` gets the same rules.

### Checking the answer

`validate()` parses the answer with a small tolerant parser (no DOM; nothing from the answer is ever inserted as
HTML) and counts:

- placeholders that are missing, repeated or unknown (invented);
- links that are missing, and links with an `href` that is not a reference of the input (a URL the model made up
  never becomes a link; its words are kept as text);
- tags outside the list above (their content is kept, the tag is left out).

Plain paragraphs without tags, unclosed tags, `<strong>`/`<em>` and entities are accepted. When the check fails,
the editor asks once more automatically, with `strict=1`, which adds a stricter instruction. If the second answer
fails too, the panel shows it with a warning ("the assistant changed or removed N items ...") and the lost items
crossed out in the preview:

- **Insert below** (the default button) adds the new text below, without any item, and keeps the original;
- **Accept** replaces the input and still keeps every item exactly once: repeated ones are kept once, invented ones
  are left out, missing ones are put back at the end of the new text (blocks after it, inline items into its last
  paragraph);
- **Keep original** closes the panel and changes nothing; **Try again** asks again.

If the rebuilt content does not fit the document (the schema check fails), nothing is changed and the panel says so.

### Preview

The word diff (`src/js/ai/diff.js`) compares the text of the input and of the answer; placeholders are words of
their own and are shown as small chips ("Image", "Object", "Custom tag: factbox", "Table", ...). A chip in the
unchanged text is an item that stays where it was; a crossed out chip is an item the answer lost.

## Configuration

`settings/exp_oe_tiptap.ini.append.php`, block `[AISettings]` (shipped values in the extension, site values in
`settings/override/exp_oe_tiptap.ini.append.php` or a siteaccess):

| Setting | Meaning |
| --- | --- |
| `Enabled` | `true` switches the assistant on. Default `false`. |
| `Provider` | `openai-compatible` (also `openai`), `anthropic` or `custom`. `tiptap-cloud` is accepted by the settings but not implemented (see "Owner decisions"). |
| `Endpoint` | The provider URL, http or https without user and password. Defaults: `https://api.openai.com/v1/chat/completions`, `https://api.anthropic.com/v1/messages`. |
| `Model` | The model name the provider expects. Required. |
| `ApiKey` | The key. **Only in `settings/override`**, never in a committed file. Optional for local servers. |
| `ApiKeyEnvironment` | Optional: the name of an environment variable of the PHP process holding the key, used when `ApiKey` is empty. Keeps the key out of every INI file. |
| `ApiKeyHeader` | OpenAI compatible only: `Authorization` (default, `Bearer <key>`) or `api-key` (Azure OpenAI). |
| `AnthropicVersion` | Anthropic only: the `anthropic-version` header, default `2023-06-01`. |
| `AnthropicWorkspaceId` | Anthropic only: the workspace (`wrkspc_...`) a key that is not scoped to a workspace (a user key) works in, sent as the `anthropic-workspace-id` header. Empty: none is sent, as a workspace key needs. |
| `ProviderClass` | `custom` only: a class implementing `expOETiptapAIProvider`. |
| `Timeout` | Seconds for the whole provider call (1 to 300, default 30). |
| `MaxInputLength` | Longest text in characters a command may send (default 20000). The browser checks it first, the server again. |
| `MaxOutputTokens` | `max_tokens` asked for (16 to 32000, default 2000). The answer is also cut at 8 characters per token. |
| `Temperature` | Optional, 0 to 2. Empty leaves the provider's default. |
| `Commands[]` | The commands offered, in this order. |

Examples (override file, never committed):

```ini
[AISettings]
Enabled=true
# OpenAI
Provider=openai-compatible
Endpoint=https://api.openai.com/v1/chat/completions
Model=<model name>
ApiKey=<key>
```

```ini
[AISettings]
Enabled=true
# a model on the own server (Ollama), no data leaves the machine, no key
Provider=openai-compatible
Endpoint=http://127.0.0.1:11434/v1/chat/completions
Model=<local model name>
```

```ini
[AISettings]
Enabled=true
Provider=anthropic
Model=<model name>
ApiKeyEnvironment=ANTHROPIC_API_KEY
```

After changing the settings clear the INI cache (`php bin/php/ezcache.php --clear-tag=ini`) and, on Velocity,
restart it.

### The ezjscore registration

`settings/ezjscore.ini.append.php`:

```ini
[ezjscServer_expoetiptap]
Class=expOETiptapServerFunctions
```

The class checks access itself; no `Functions[]`/ezjscore policy is needed on top.

## Policies

- `exp_oe_tiptap/ai` — may use the assistant. The edit template only shows the button with it
  (`ai.enabled` in the editor options), and `expOETiptapServerFunctions::ai()` checks it again for every call.
  Any limitation counts as access.
- The request must be a POST with the session's form token (`ezxform_token` field or `X-CSRF-Token` header).
  ezformtoken checks it for every POST anyway; the server function compares it again with `hash_equals`.

## Privacy: what is sent where

| What | To whom | When |
| --- | --- | --- |
| The selected text, or the whole document, as markup: the text, simple tags (paragraphs, headings, lists, bold, italic, underline, sub, sup, line breaks), link references (`L1`), attribute references (`k="B1"`) and numbered placeholders for the items (for continue: up to 4000 characters before the cursor) | the configured provider, through this server | only when the editor picks a command |
| The command's instruction, the target language, the editor's locale | the provider | with the text |
| The API key | the provider, as a header | with every call; never to the browser, never into a log |
| Command, provider, model, input and output length, duration, technical reason | `var/log/exp_oe_tiptap_ai.log` and the debug output | only when a call fails |

Not sent: the HTML, attributes, link URLs, object and node ids, image sources and sizes, custom attributes, the
content of embedded objects, tables, literals and custom tags, the user's name or any other field of the form.
The original nodes behind the references and placeholders stay in the browser.
Not logged: the text, the answer, the key (a log line that would contain the key has it replaced by `[key]`).
Answers are not cached.

Whether content may leave the server at all is an owner decision: a self-hosted model behind an OpenAI
compatible endpoint keeps everything on the own infrastructure.

## Security notes

- The editor's text is sent between `<text>` and `</text>` and the instructions tell the model that the text is
  content, never instructions, so a sentence like "ignore all rules" is edited, not obeyed.
- The answer is never inserted as HTML. It is parsed by the editor's own small parser into text, a fixed list of
  marks and blocks, and placeholders; only original nodes and marks of the document can come back from it. A link
  the model invents is not made a link.
- Provider errors reach the editor as fixed, translated-ready messages ("did not answer in time", "busy or over
  its limit", ...). The provider's own error text is never passed on (it may echo the request or the key).
- Endpoints must be http or https without credentials; redirects are not followed; the answer is limited to 2 MB;
  only http and https protocols are allowed for curl.

## Adding a command

1. Name it (lower case, digits, underscore) and list it: `[AISettings] Commands[]=seo_title`.
2. Give it a prompt in a block of its own:

   ```ini
   [AICommand_seo_title]
   Prompt=Write a short, descriptive page title for the text, in %locale.
   ```

   `%language` is the target language (as for translate), `%locale` the editor's locale. The same block can
   replace the prompt of a built-in command.
3. Translate its label: the editor shows `options.ai.labels[<command>]` when the template passes one, otherwise
   the command name. Built-in labels are in `src/js/ai/client.js` (`COMMAND_LABELS`) and in `strings.json`.
4. A custom command replaces the input (like improve) and follows the rules of the rewriting commands: every
   placeholder and link must come back. To insert instead, add it to `INSERT_COMMANDS` in `src/js/ui/ai-panel.js`
   and to `expOETiptapAIPrompts::$insertCommands`, and rebuild.

## A provider of your own

```php
class mySiteAIProvider implements expOETiptapAIProvider
{
    public function __construct( array $settings ) { /* [AISettings] values */ }
    public function complete( $system, $user, array $options ) { /* return the text, throw expOETiptapAIException */ }
    public function modelName() { return 'my-model'; }
}
```

```ini
[AISettings]
Provider=custom
ProviderClass=mySiteAIProvider
```

Throw `expOETiptapAIException( $messageForTheEditor, $technicalDetailForTheLog )` on errors; never put the text
or the key into either.

## Tests

- `tests/php/ai/AIHooksTest.php` (phpunit, via `phpunit.xml.dist`): a fake provider
  (`tests/php/ai/fakeprovider.php`) is started with `php -S` on a free port of 127.0.0.1 and stopped after the
  tests. It covers the OpenAI and Anthropic request formats, key headers, custom providers, access checks,
  limits, timeout, oversized and broken answers, redirects, and that neither key nor text reach messages or logs.
  No real provider is called and no real key is used.
- `tests/php/ai/AIPromptsTest.php`: the prompts of the markup format for every command (placeholders and links kept,
  summarise and continue without them, translate leaves them alone, the strict retry, custom prompts) and that the
  service passes format and retry flag on. The plain text format is unchanged.
- `tests/js/ui/ai.test.mjs` (`npm test`): the browser client, the word diff and the suggestion panel with a mocked
  fetch.
- `tests/js/ui/ai-structure.test.mjs` (`npm test`): every fixture of `tests/fixtures/` is serialized, answered by a
  fake assistant and rebuilt into what `toEditorHTML()` posts. An assistant that changes nothing gives the identical
  HTML; one that rewrites words keeps every embed, image, custom tag, anchor, table, literal and link byte-identical
  and the element structure the same; ones that drop, repeat or invent placeholders fail the check, and the repaired
  result still holds every item exactly once. The markup never holds ids, URLs, sources or custom attributes. The
  panel tests cover selections inside a paragraph and across blocks, the automatic stricter retry, the warning with
  Keep original / Insert below / Accept, summarise, translate and cell selections.
- Once, with the real provider (Anthropic, 2026-10-09, four requests): a paragraph with two placeholders, a link and
  bold text came back from improve, shorten and translate (German) with both placeholders exactly once and the link
  and the bold text kept; the summary held no placeholder.

## Owner decisions

1. **Provider and licence.** Which provider (OpenAI, Azure OpenAI, Anthropic, Mistral, a self-hosted model), who
   pays, and whether content may leave the server. The code supports all of these without changes.
2. **Tiptap Cloud.** Tiptap's hosted AI is part of its paid offer with its own terms; it is not implemented.
   If wanted, it would be another provider class after the terms are checked.
3. **Data protection.** Sending editorial text to an external provider may need a data processing agreement and
   a note to the editors; a self-hosted model avoids that.
4. **Who gets the policy** `exp_oe_tiptap/ai` (a pilot group first, as the plan suggests).
