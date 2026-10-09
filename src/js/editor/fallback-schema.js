/**
 * Fallback schema, used by the build only if src/js/schema/index.js (the ezoe HTML dialect) is missing,
 * e.g. in a partial checkout. Paragraphs and text only, so the editor still mounts; it keeps no
 * formatting and must never be used to save real content (the editor shows a warning).
 * Same function names and directions as the real schema module.
 */
import { Node } from '@tiptap/core';

export const isFallback = true;

const Doc = Node.create( { name: 'doc', topNode: true, content: 'block+' } );
const Text = Node.create( { name: 'text', group: 'inline' } );
const Paragraph = Node.create( {
    name: 'paragraph', group: 'block', content: 'inline*',
    parseHTML: () => [ { tag: 'p' } ],
    renderHTML: ( { HTMLAttributes } ) => [ 'p', HTMLAttributes, 0 ]
} );

export function ezoeExtensions() {
    return [ Doc, Text, Paragraph ];
}

/** ezoe HTML -> editor content (Tiptap parses the HTML itself) */
export function fromEditorHTML( html ) {
    return html || '';
}

/** editor -> HTML to post */
export function toEditorHTML( editor ) {
    return editor.getHTML();
}
