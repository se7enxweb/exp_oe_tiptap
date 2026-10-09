# Architecture

## The idea

ezoe has two halves around its editor: `eZOEXMLInput::inputXML()` turns stored ezxml into an HTML dialect, and
`eZOEInputParser` turns that dialect back into ezxml when the form is posted. Both are mature and handle every tag,
attribute and quirk the content has. exp_oe_tiptap keeps both halves and replaces only the editor between them.
Tiptap is configured with a schema that is the ezoe dialect, so it reads exactly what TinyMCE reads and writes
exactly what TinyMCE writes.

```
 stored ezxml
     |
     |  eZOEXMLInput::inputXML()                                   ezoe, unchanged
     v
 ezoe editor HTML  (escaped into <textarea name="ContentObjectAttribute_data_text_<id>">)
     |
     +--> ezxmltext_ezoe.tpl --> TinyMCE 3 or 8 (ezoe's engines)   ezoe, unchanged
     |
     +--> ezxmltext_exp_oe_tiptap_editor.tpl                       exp_oe_tiptap
              --> window.ExpOETiptap.init( textarea, options )
              --> Tiptap with the ezoe schema (src/js/schema)
              --> writes ezoe HTML back into the textarea on submit
     |
     v
 POST ContentObjectAttribute_data_text_<id>
     |
     |  eZOEXMLInput::validateInput() -> eZOEInputParser           ezoe, unchanged
     v
 stored ezxml
```

## Parts

| Part | Files | Owner |
| --- | --- | --- |
| Input handler | `classes/expoetiptapxmlinput.php` (`expOETiptapXMLInput extends eZOEXMLInput`) | PHP |
| Editor choice and switch | `classes/expoetiptapeditor.php` (`expOETiptapEditor`), `modules/exp_oe_tiptap/` | PHP |
| Edit templates | `design/standard/templates/content/datatype/edit/ezxmltext_exp_oe_tiptap*.tpl` | templates |
| Schema (ezoe dialect) | `src/js/schema/`, `src/js/convert/` | JS, [content-mapping.md](content-mapping.md) |
| Editor UI, toolbar, dialogs, AI UI | `src/js/editor/`, `src/js/ui/`, `src/js/ai/`, `src/css/` | JS |
| Built bundle | `design/standard/javascript/exp_oe_tiptap/`, `design/standard/stylesheets/exp_oe_tiptap/` | build output, committed |
| AI server function | `classes/expoetiptapserverfunctions.php`, `classes/ai/` | PHP, [ai-hooks.md](ai-hooks.md) |

## The input handler

ezxmltext asks `ezxml.ini [InputSettings]` for its input handler: `HandlerClass=eZSimplifiedXMLInput`, replaced by
`AliasClasses[eZSimplifiedXMLInput]`. ezoe sets that alias to `eZOEXMLInput`; exp_oe_tiptap, read after ezoe (its extension.xml declares `<extends>ezoe`), sets
it to `expOETiptapXMLInput`. If that class refuses (`isValid()`, inherited from ezoe: no `ezoe/editor` policy,
unsupported browser) the kernel falls back to the plain `eZSimplifiedXMLInput`, exactly as with ezoe.

`expOETiptapXMLInput` overrides only:

- `editTemplateSuffix()`: `exp_oe_tiptap`, so the kernel renders `ezxmltext_exp_oe_tiptap.tpl`;
- `attributes()` / `attribute()`: adds `exp_oe_editor`, the editor choice for the template;
- `customObjectAttributeHTTPAction()`: handles the switch action, passes every other action to ezoe.

A test (`tests/php/InputHandlerTest.php`) fails if any other method is overridden.

## The edit template

`ezxmltext_exp_oe_tiptap.tpl` decides per attribute:

- editor enabled and choice `tiptap`: `ezxmltext_exp_oe_tiptap_editor.tpl`;
- otherwise: ezoe's own `ezxmltext_ezoe.tpl`, untouched (TinyMCE, or the plain field after "Disable editor");

then, if the user may switch, `ezxmltext_exp_oe_tiptap_switch.tpl` (the button).

`ezxmltext_exp_oe_tiptap_editor.tpl` loads the bundle once per page, prints the textarea ezoe would print, the
"Disable editor" button ezoe would print, and calls `window.ExpOETiptap.init( textarea, options )`. The options
(from INI and the input handler, the same data ezoe's TinyMCE 8 template uses) are listed in
[plan.md](plan.md#5-contract-between-the-agents).

## The editor choice

`expOETiptapEditor::resolve()`:

1. the per-request choice (set by the switch action while the same request renders the form again);
2. the user preference `exp_oe_editor`, while `AllowSwitch=enabled` and the user has `exp_oe_tiptap/switch`;
3. `[EditorSettings] DefaultEditor`;

and `tiptap` only while the bundle file exists. `expOETiptapEditor::choose()` is the same decision without any
reads, which the tests cover case by case.

## The switch

In the edit form the button is `CustomActionButton[<attribute id>_exp_oe_switch_<editor>]`. content/edit treats
every custom action as a store action: it validates and stores all attributes of the draft (with
`skip-isRequired`), then calls the attribute's `customObjectAttributeHTTPAction()`. ezoe's "Disable editor" works
the same way. `expOETiptapXMLInput` then stores the preference and sets the per-request choice, and content/edit
renders the form again, now with the other editor and the stored draft. The form token is the one ezformtoken
checks on every content/edit POST.

The view `exp_oe_tiptap/switch` does the same store outside an edit form. It accepts only POST, checks the form
token itself (`ezxform_token` field or `X-CSRF-Token` header, constant-time compare) in addition to ezformtoken,
needs the policy `exp_oe_tiptap/switch`, and redirects only to a local path.

## AI

The bundle calls `ezjscore/call/expoetiptap::ai` with the command and the selected text; the server function checks
`[AISettings] Enabled`, the policy `exp_oe_tiptap/ai` and the form token, calls the configured provider and returns
the suggestion. The key stays on the server. Details: [ai-hooks.md](ai-hooks.md).

## What stays ezoe's

Policies `ezoe/editor`, `ezoe/disable_editor`, `ezoe/browse`, `ezoe/search`, `ezoe/relations`; the dialogs under
`/ezoe/dialog/...`, upload, relations and the object browser; validation messages; ezoe's engine switch between
TinyMCE 3 and 8 (`ezoe.ini [EditorSettings] EngineSwitch`, preference `ezoe_engine`), which applies whenever the user
is on ezoe.
