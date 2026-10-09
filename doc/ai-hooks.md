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
 selection or whole document as text
 POST /ezjscore/call                 ->   expOETiptapServerFunctions::ai()
   expoetiptap::ai, ezxform_token,          [AISettings] Enabled?   policy exp_oe_tiptap/ai?
   command, text, language, locale          POST?  form token?  command offered?  length?
                                            prompt (expOETiptapAIPrompts)
                                            provider call with the key           ->  OpenAI compatible API
                                              (timeout, answer size limit)       <-  or Anthropic Messages API
                                                                                     or your own class
 suggestion panel                    <-   { text, command, model }
   word diff (rewrites) or new text
   Accept / Insert below / Try again / Reject
```

- The browser never talks to the provider and never sees the key. It only calls the ezjscore server function
  `expoetiptap::ai` of the same site, with the session cookie and the form token.
- While a suggestion is shown the editor is read-only, so the text the suggestion replaces cannot move.
  Nothing changes in the document (or in the posted field) until the editor presses Accept or Insert.
- Rewriting commands (improve, shorten, extend, fix spelling, translate) show a word diff and replace the input.
  Summarise inserts below the input, continue writing inserts at the cursor.
- With nothing selected, the input is the whole document as plain text. The answer is plain text, too: replacing
  a whole document turns it into plain paragraphs. When the document holds embeds, tables, lists or custom tags,
  the panel says so and makes "Insert below" the safe choice; Accept stays possible but is not the default button.
  A selection inside one paragraph is replaced inline, so the rest of that paragraph keeps its formatting.

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
| The selected text, or the whole document as plain text (for continue: up to 4000 characters before the cursor) | the configured provider, through this server | only when the editor picks a command |
| The command's instruction, the target language, the editor's locale | the provider | with the text |
| The API key | the provider, as a header | with every call; never to the browser, never into a log |
| Command, provider, model, input and output length, duration, technical reason | `var/log/exp_oe_tiptap_ai.log` and the debug output | only when a call fails |

Not sent: the HTML, attributes, embedded objects, the object id, the user's name or any other field of the form.
Not logged: the text, the answer, the key (a log line that would contain the key has it replaced by `[key]`).
Answers are not cached.

Whether content may leave the server at all is an owner decision: a self-hosted model behind an OpenAI
compatible endpoint keeps everything on the own infrastructure.

## Security notes

- The editor's text is sent between `<text>` and `</text>` and the instructions tell the model that the text is
  content, never instructions, so a sentence like "ignore all rules" is edited, not obeyed.
- The answer is treated as plain text: escaped when it is put into the document, never inserted as HTML.
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
4. A custom command replaces the input (like improve). To insert instead, add it to
   `INSERT_COMMANDS` in `src/js/ui/ai-panel.js` and rebuild.

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
- `tests/js/ui/ai.test.mjs` (`npm test`): the browser client, the word diff and the suggestion panel with a mocked
  fetch.

## Owner decisions

1. **Provider and licence.** Which provider (OpenAI, Azure OpenAI, Anthropic, Mistral, a self-hosted model), who
   pays, and whether content may leave the server. The code supports all of these without changes.
2. **Tiptap Cloud.** Tiptap's hosted AI is part of its paid offer with its own terms; it is not implemented.
   If wanted, it would be another provider class after the terms are checked.
3. **Data protection.** Sending editorial text to an external provider may need a data processing agreement and
   a note to the editors; a self-hosted model avoids that.
4. **Who gets the policy** `exp_oe_tiptap/ai` (a pilot group first, as the plan suggests).
