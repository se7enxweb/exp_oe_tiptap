# Using the Tiptap editor

For editors. What is different from the Online Editor (ezoe), and how to switch between them.

## Which editor you get

Every text field (ezxmltext) is edited with one of two editors:

- **Online Editor (TinyMCE)**, the editor Exponential has always had (ezoe);
- **Tiptap**, the new one.

The site decides which one you start with. If you have the right to switch, a button below the text field lets
you change it, and your choice is remembered for your user on every text field and every visit, until you switch
again.

## Switching

Below the text field:

- with the Online Editor: **Switch to Tiptap**;
- with Tiptap: **Switch to Online Editor (TinyMCE)** (Tiptap also has the same action in its toolbar).

When you press it, the whole form is stored as a draft first, exactly as when you press "Disable editor", and the
form comes back with the other editor. Nothing you typed is lost, in any field. Nothing is published.

You can also choose without opening a form: `/exp_oe_tiptap/switch` (in the admin: add it to the URL) shows a
small page with a choice "Default of this site", "Online Editor (TinyMCE)" and "Tiptap".

The button is not there when:

- the site does not allow switching (`AllowSwitch=disabled`), or
- your role does not have the policy `exp_oe_tiptap/switch` (ask an administrator), or
- Tiptap is not installed completely on this site; then everybody gets the Online Editor.

## What is the same

- The text is stored the same way. A page saved from Tiptap looks the same on the site as one saved from the
  Online Editor.
- Everything the Online Editor can do, Tiptap can do: headings, bold, italic, underline, sub- and superscript,
  links (with their class, view and target), anchors, lists, tables (with their classes and sizes), literal
  blocks, embedded images, objects and files (block and inline), custom tags such as factboxes, and the classes
  and custom attributes of each.
- The dialogs for links, embedding (with the object browser and upload), custom tags and tables are the same
  dialogs as in the Online Editor.
- "Disable editor" works the same: it turns either editor into the plain text field.

## What is different

- Tiptap edits in the page itself, not in a frame; it follows the page's font size and zoom.
- Typing shortcuts: `**bold**`, `*italic*`, `# ` for a heading, `- ` or `1. ` for a list at the start of a line.
- Paste from Word and web pages is cleaned to what a text field can store.

## AI commands

If the site has them switched on and your role has the policy `exp_oe_tiptap/ai`, Tiptap's toolbar has an **AI**
menu: improve writing, make shorter, make longer, fix spelling and grammar, translate, summarise, continue
writing. Select text (or place the cursor, for "continue"), choose a command, and the result is shown as a
suggestion: **Accept** puts it into the text, **Reject** leaves the text as it was. The assistant only changes the
wording: images, embedded objects, tables, custom tags, anchors, links and formatting stay where they are (they show
as small chips in the suggestion). If an answer loses one, the panel warns and **Insert below** or **Keep original**
keep your text safe. Text inside a table or a custom tag box is changed only when you select it. The text you select is sent
to the AI provider the site has chosen; do not use it on confidential content unless your organisation allows
it. More: [ai-hooks.md](ai-hooks.md).

## When something looks wrong

Switch back to the Online Editor: the text is the same, so you lose nothing. Tell the site administrator which
content and what you saw; [maintenance.md](maintenance.md#troubleshooting) is their checklist.
