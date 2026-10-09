# Content mapping: ezxml, ezoe editor HTML and Tiptap

exp_oe_tiptap stores nothing of its own. The content stays ezxmltext, and the round trip is the same one ezoe uses:

```
stored ezxml --eZOEXMLInput::inputXML()--> ezoe editor HTML (textarea) --fromEditorHTML()--> Tiptap document
Tiptap document --toEditorHTML()--> ezoe editor HTML (posted) --eZOEInputParser--> stored ezxml
```

The Tiptap schema in `src/js/schema/` copies the HTML dialect that ezoe's TinyMCE edits, element for element and
attribute for attribute. The server side does not change: the parser that reads what Tiptap posts is ezoe's own.

## API (`src/js/schema/index.js`)

| export | what it does |
|---|---|
| `ezoeExtensions(options)` | The Tiptap extensions of the dialect: nodes, tables and marks. History, drop cursor, placeholder and similar are left to the editor. `options.headingLevels` limits the heading levels. |
| `fromEditorHTML(html, options)` | ezoe editor HTML (the textarea value) to a Tiptap JSON document. White space is kept, because ezoe's HTML contains no formatting white space. |
| `toEditorHTML(editorOrDocOrJson, options)` | The document as ezoe editor HTML, ready to post. With `save: false` the embed previews are kept, for display. |
| `normalizeEditorHTML(html, options)` | Both steps in one call. |
| `cleanupForEzoe(element, options)` | The clean-ups made on save (`src/js/convert/ezoehtml.js`). |
| `parseCustomAttributes`, `serializeCustomAttributes` | Read and write ezoe's `customattributes` value (`name|value` pairs joined by `attribute_separation`). |
| `cleanClass`, `customTagName` | A class value without ezoe's internal classes, and the name of a custom tag. |

Outside a browser, pass `options.document` (for example a happy-dom window's document).

`editor.getHTML()` is not what gets posted. It keeps the embed previews and skips the clean-ups. Post
`toEditorHTML(editor)` instead.

## Element table

The attributes in *italics* are kept under their own names. Every other attribute an element carries ends up in
`extraAttrs` and is written back unchanged. This covers unknown classes, data attributes and attributes that future
ezoe versions might add. TinyMCE's own attributes are dropped, as TinyMCE drops them: `data-mce-*`,
`contenteditable` and `data-mce-bogus` elements.

| ezxml | ezoe editor HTML | Tiptap | kept attributes |
|---|---|---|---|
| `<section>` | (nesting only, gives the heading level) | (none) | |
| `<header>` | `<h1>`..`<h6>`, where the level is the section depth | node `heading` (`level`) | *align, class, customattributes, style* |
| `<header anchor_name>` | `<hN><a name class="mceItemAnchor"></a>text</hN>` | `heading` + `ezAnchor` | |
| `<paragraph>` | `<p>`, written as `<p><br></p>` when empty | node `paragraph` | *align, class, customattributes, style* |
| `<line>` | text followed by `<br>` | node `hardBreak` | |
| `<strong>` | `<strong>` (also reads `<b>` and bold styles) | mark `bold` | *class, customattributes, style* |
| `<emphasize>` | `<em>` (also reads `<i>` and italic styles) | mark `italic` | *class, customattributes, style* |
| `<link>` | `<a href view target title id class customattributes>`; href is `ezobject://ID`, `eznode://ID` or a path, or a URL, each with an optional `#anchor` | mark `link` | *href, target, title, id, view, class, customattributes, style* (data-mce-href dropped) |
| `<anchor name>` | `<a name class="mceItemAnchor"></a>` (also reads TinyMCE 8's `<a id>`) | node `ezAnchor`, inline atom | *name, class, customattributes, style* |
| `<literal>` | `<pre>`, with line breaks as `<br>` | node `literal`, plain text, no marks | *class, customattributes, style* |
| `<ul>` / `<ol>` | `<ul>` / `<ol>` | nodes `bulletList` / `orderedList` | *class, customattributes, style* |
| `<li>` | `<li>`: content without `<p>` for a single paragraph, `<p>` for several | node `listItem` (content `block+`) | *class, customattributes, style* |
| `<table>` | `<table customattributes width border align class style><tbody>` | node `table` (extends @tiptap/extension-table) | *width, border, align, class, customattributes, style* |
| `<tr>` | `<tr>` | node `tableRow` | *class, customattributes, style* |
| `<td>` / `<th>` | `<td>` / `<th>` with *width colspan rowspan align*; an empty cell is `<p><br></p>` | nodes `tableCell` / `tableHeader` | *width, align, class, customattributes, style*; colspan/rowspan left out when 1 |
| `<embed>` (an image object) | `<img id="eZObject_ID\|eZNode_ID" title src width height alt="size" view inline="false" align class customattributes style>` inside the paragraph | node `ezEmbedImage`, inline atom | all, plus *src, width, height* |
| `<embed>` (another object) | `<div id="eZObject_ID" title alt view inline="false" align html_id show_path class="ezoeItemNonEditable CLASS ezoeItemContentTypeGROUP" customattributes style>preview</div>` | node `ezEmbed`, block atom | *id, title, alt, view, inline, align, html_id, show_path, class, customattributes, style*; `preview` is shown and never posted |
| `<embed-inline>` | `<span id=... inline="true" ...>preview</span>` (`<img>` for an image) | node `ezEmbedInline`, inline atom | as `ezEmbed` |
| `<custom>` block | `<div class="ezoeItemCustomTag NAME" type="custom" customattributes style align>blocks</div>`; an empty one holds `<p>NAME</p>` | node `ezCustomBlock` (content `block+`, editable) | *class, type, customattributes, style, align* |
| `<custom>` inline (`IsInline=true`) | `<span class="ezoeItemCustomTag NAME" type="custom" ...>text</span>`, `<u ...>` for `underline` | mark `ezCustomInline` (several can share the same text) | *class, type, customattributes, style, align*; `tag` (span/u) |
| `<custom>` inline image (`IsInline=image`) | `<img src="icon" class="ezoeItemCustomTag NAME" type="custom" customattributes width height>` | node `ezCustomImage`, inline atom | *src, class, type, customattributes, width, height, style, align* |
| `<custom name="sub\|sup">` | `<sub>` / `<sup>` | marks `subscript` / `superscript` | *class, customattributes, style, align* |
| `xhtml:id`, `xhtml:title`, `xhtml:width`, `xhtml:colspan`, `xhtml:rowspan` | `html_id`/`id`, `title`, `width`, `colspan`, `rowspan` | attributes as above | |
| `custom:NAME="value"` | `customattributes="NAME|value…"`, plus `style` for the names in ezoe.ini `CustomAttributeStyleMap` | attribute `customattributes` | verbatim |

The marks are nested in this order on output, outermost first: inline custom tags, emphasize, strong, sub, sup, link.
Stored content usually has formatting around a link (`<emphasize>Credit: <link>…</link></emphasize>`). With the link
innermost, that formatting is not split around it.

### Clean-ups on save (`toEditorHTML`, as ezoe's TinyMCE plugins do)

- An empty paragraph is written as `<p><br></p>`.
- A list item with one paragraph and no attributes is written without the `<p>`.
- The preview inside a `<div>`/`<span>` embed becomes the text `ezembed` (ezembed plugin, issue 18264).
- The `ezoeAlign<align>` helper class is removed from image embeds (EZP-22487).
- Line breaks inside a `<pre>` are written as `<br>`.

## Tests

- `tests/fixtures/`: 63 pairs of `NAME.xml` (stored ezxml) and `NAME.html` (what `eZOEXMLInput::inputXML()` makes of
  it in the admin siteaccess). The 50 `a*` fixtures are real alpha content, taken with read-only queries, with e-mail
  addresses and the names in credit lines replaced. The 13 `s*` fixtures are synthetic and cover what alpha's
  content does not use: anchors, literals, tables with th/colspan/rowspan/width/custom attributes, every kind of
  embed, block and inline custom tags, links to objects and nodes with target/title/id/view. `manifest.json` lists
  the source and the features of each.
- `node --test tests/js/schema/schema.test.mjs`: 17 unit tests. Every fixture must be stable through Tiptap, attributes
  must be kept, embeds, custom tags, tables, lists, literal and white space must survive, and a headless editor must
  edit and save.
- `tests/php/roundtrip/run.sh <copy-of-the-db> <work-dir>`, run from the installation root: first every fixture
  goes ezoe HTML → Tiptap → HTML (`tests/js/schema/roundtrip.mjs`), then `run.php` feeds that HTML to
  `eZOEInputParser` exactly as `validateInput()` does and compares the result with the original ezxml. It does the
  same with the HTML ezoe alone would post (the baseline), so a loss in ezoe is told apart from a loss in Tiptap. The
  script refuses the live database, because the parser registers link URLs.

  Results are graded as **identical**, as **equal** (only white space differs, or the nesting order of
  strong/emphasize/link/inline custom tags, which renders the same) or as **lossy**. The script fails when Tiptap
  loses anything that ezoe alone keeps.

### Results (alpha, 2026-10-09)

| | identical | equal | lossy |
|---|---|---|---|
| Tiptap vs original ezxml | 21 | 15 | 27 |
| ezoe alone vs original ezxml | 23 | 13 | 27 |
| **Tiptap vs ezoe alone** | **52** | **11** | **0** |

Tiptap loses nothing that ezoe keeps. The 11 "equal" cases differ only in mark nesting order (`<link><strong>` versus
`<strong><link>`) or in redundant nested `<emphasize><emphasize>`, which Tiptap merges.

All 27 lossy cases are lossy in ezoe alone, in exactly the same way. In other words they are limits of ezoe's
editor, not of the mapping:

- **Imported content outside ezoe's dialect** (22 of the alpha fixtures, the Netgen media-site import): a `<ul>`,
  `<ol>` or `<embed object_remote_id>` directly under `<section>`, a `<header>` after a paragraph inside the same
  section, `level="2"` on headers, or empty `<paragraph/>` elements. `inputXML()` drops whatever is not a header,
  paragraph or section at section level ("Unsupported tag at this level"). **Saving one of these objects in either
  editor deletes those lists and embeds.**
- `<header anchor_name>` comes back as `<header><anchor/>…` (content.ini `[header] AnchorAsAttribute` is not set).
- An embed without `size` gets the default size (`DefaultEmbedAlias`) written.
- Two block custom tags in one paragraph are split into two paragraphs, or the other way round.
- In a list item whose paragraph is followed by a nested list, the paragraph's text is wrapped in `<line>`.
- A link around an inline embed whose preview itself contains a link is broken by the browser's HTML parser
  (nested `<a>`), in TinyMCE as well as in Tiptap.

## Known limits

- `style` values are kept as written. The happy-dom test DOM normalises the `style` attribute when it is set (it drops
  the invalid `width: 640`). Browsers keep it. The parser turns `style` into attributes either way.
- Inline mark nesting can change order (see above). The rendered output is the same.
- The embed preview is the HTML the server rendered when the edit form was loaded. An embed inserted in the editor
  shows its preview only when the UI supplies one (`preview` attribute), for example from ezoe's embed dialog.
- Tiptap's own `editor.getHTML()` is not the posted format. Always post `toEditorHTML(editor)`.

## How to add a custom tag

Nothing in the schema has to change: custom tags are recognised by their markup, not by their name.

1. Define the tag in content.ini as for ezoe: `[CustomTagSettings] AvailableCustomTags[]=NAME`, and
   `IsInline[NAME]=true` for an inline tag or `IsInline[NAME]=image` (optionally `InlineImageIconPath[NAME]`) for an
   inline image tag. Add `[NAME] CustomAttributes[]=…` and, if wanted, ezoe_attributes.ini `[CustomAttribute_NAME_attr]`.
2. Add the output template `design/<design>/templates/content/datatype/view/ezxmltags/NAME.tpl`, as for ezoe.
3. In the editor:
   - a block tag is inserted with `editor.commands.setCustomBlock(NAME, customattributes)`, which wraps the selection,
     or with `insertCustomBlock(NAME, customattributes)`, which adds an empty one;
   - an inline tag is set with `setCustomInline(NAME, customattributes)` and removed with `unsetCustomInline(NAME)`;
   - an image tag is inserted with `insertCustomImage({ src, class: 'ezoeItemCustomTag NAME', type: 'custom', customattributes })`.

   `customattributes` is ezoe's string. Build it with `serializeCustomAttributes({ name: value })`.
4. To cover the tag in the tests, add a fixture pair to `tests/fixtures/` (ezxml plus the HTML `inputXML()` makes of
   it, which `expOETiptapRoundtrip::xmlToEditorHTML()` in `tests/php/roundtrip/expoetiptaproundtrip.php` returns) and
   run both tests.
