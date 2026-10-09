# Extending

Everything here keeps one rule: Tiptap must read and write exactly the ezoe editor HTML. A new node or mark is a
new piece of that dialect, never a new storage format. Before writing one, look at what ezoe produces for the tag
(`eZOEXMLInput::inputTagXML()`) and what `eZOEInputParser` expects back; [content-mapping.md](content-mapping.md)
lists the dialect tag by tag.

## A custom tag

Most custom tags need no code. ezoe's markup for a custom tag is generic (block custom tags as a `div` with
`type="custom"` and the tag name as class, inline ones as a `span`, attributes in `customattributes`), and the
schema's custom tag node handles every tag defined in `content.ini [CustomTagSettings] AvailableCustomTags[]`, with
the attributes of `[<tag>] CustomAttributes[]` and their types from `ezoe_attributes.ini`. The template passes these
definitions to the bundle (`options.customTags`), and ezoe's custom tag dialog edits them.

Write a dedicated node only when a tag should look or behave differently in the editor (a factbox drawn as a box,
a video tag with a preview):

1. Add a node in `src/js/schema/` that parses the same element ezoe produces (`div.<tagname>[type=custom]` or
   `span...`) with a higher priority than the generic custom tag node, keeps every attribute it does not
   understand, and renders back exactly the same element.
2. Add fixtures with the tag (ezxml and the ezoe HTML) in `tests/fixtures/` and run the round-trip tests.
3. Rebuild (`npm run build`) and commit the bundle.

## A toolbar button

The toolbar is ezoe's: `ezoe.ini [EditorLayout] Buttons[]` decides which buttons appear and in which order, for
both editors. The bundle maps each ezoe button name to a Tiptap command (`src/js/ui/`).

- To show an existing button, add its ezoe name to `Buttons[]` (per siteaccess or per class, as for ezoe).
- To add a new one: register its ezoe-style name and command in the toolbar map in `src/js/ui/`, add an icon in the
  ezoe skin style, add its label to the `i18n` hash in `ezxmltext_exp_oe_tiptap_editor.tpl` (context
  `extension/exp_oe_tiptap`) and to `translations/*/translation.ts`, then add the name to `Buttons[]`.

Buttons unknown to the bundle are skipped, so one `Buttons[]` list can serve both editors.

## An AI command

1. Add the command's name to `exp_oe_tiptap.ini [AISettings] Commands[]`.
2. Add its prompt on the server side (`classes/ai/`), never in the browser: the server decides what is sent to the
   provider.
3. Add its menu label to the `i18n` hash (key `ai<Name>`) and the translations.

Details and the provider interface: [ai-hooks.md](ai-hooks.md).

## Another provider

Providers are classes under `classes/ai/` selected by `[AISettings] Provider`; see [ai-hooks.md](ai-hooks.md).

## Overriding templates

The templates are ordinary design templates and can be overridden in a design of higher priority:

- `content/datatype/edit/ezxmltext_exp_oe_tiptap.tpl`: the choice between the editors and the switch;
- `content/datatype/edit/ezxmltext_exp_oe_tiptap_editor.tpl`: the Tiptap field and its options;
- `content/datatype/edit/ezxmltext_exp_oe_tiptap_switch.tpl`: the switch button;
- `exp_oe_tiptap/switch.tpl`: the page of the view `exp_oe_tiptap/switch`.

Keep the textarea's name and the `CustomActionButton[...]` names: the kernel and the bundle rely on them.
