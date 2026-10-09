/**
 * The ezoe editor HTML dialect as a Tiptap schema.
 *
 * Tiptap edits exactly the HTML ezoe's TinyMCE edits: eZOEXMLInput::inputXML() makes it from the stored ezxml, the
 * form posts it, eZOEInputParser turns it back into ezxml. Nothing on the server changes.
 *
 *   import { ezoeExtensions, fromEditorHTML, toEditorHTML } from './schema/index.js';
 *
 *   const editor = new Editor( { extensions: [ ...ezoeExtensions(), UndoRedo, ... ],
 *                                content: fromEditorHTML( textarea.value ) } );
 *   form.onsubmit = () => { textarea.value = toEditorHTML( editor ); };
 *
 * editor.getHTML() is NOT what is posted: it keeps embed previews and lacks the clean-ups of toEditorHTML().
 *
 * @license GPL-2.0-or-later
 */
import { getSchema } from '@tiptap/core';
import { DOMParser as PMDOMParser, DOMSerializer, Node as PMNode } from '@tiptap/pm/model';
import { ezoeNodes } from './nodes.js';
import { ezoeMarks } from './marks.js';
import { ezoeTables } from './table.js';
import { cleanupForEzoe } from '../convert/ezoehtml.js';

export { parseCustomAttributes, serializeCustomAttributes, cleanClass, customTagName } from './attributes.js';
export { cleanupForEzoe } from '../convert/ezoehtml.js';
export * from './nodes.js';
export * from './marks.js';
export * from './table.js';

export const isFallback = false;

/**
 * The Tiptap extensions of the ezoe dialect: document, text, paragraph, heading, hard break, lists, literal,
 * anchor, embeds, custom tags, tables and the marks. History, placeholder, drop cursor and the like are left to
 * the editor (src/js/editor).
 *
 * @param {object} [options]
 * @param {number[]} [options.headingLevels=[1..6]]
 * @returns {import('@tiptap/core').AnyExtension[]}
 */
export function ezoeExtensions( options = {} ) {
    const extensions = ezoeNodes().concat( ezoeTables(), ezoeMarks() );
    if ( options.headingLevels ) {
        return extensions.map( extension => ( extension.name === 'heading'
            ? extension.configure( { levels: options.headingLevels } )
            : extension ) );
    }
    return extensions;
}

let defaultSchema = null;

function schemaFor( options ) {
    if ( options && options.schema )
        return options.schema;
    if ( options && options.extensions )
        return getSchema( options.extensions );
    if ( !defaultSchema )
        defaultSchema = getSchema( ezoeExtensions() );
    return defaultSchema;
}

function documentFor( options ) {
    const doc = ( options && options.document ) || ( typeof document !== 'undefined' ? document : null );
    if ( !doc )
        throw new Error( 'exp_oe_tiptap: a DOM document is needed (pass options.document outside a browser)' );
    return doc;
}

/**
 * ezoe editor HTML (the textarea value) -> Tiptap JSON document.
 *
 * @param {string} html
 * @param {object} [options] { schema | extensions, document }
 * @returns {object} ProseMirror/Tiptap JSON
 */
export function fromEditorHTML( html, options = {} ) {
    const schema = schemaFor( options );
    const container = documentFor( options ).createElement( 'div' );
    container.innerHTML = html || '';
    // ezoe's HTML has no formatting white space (eZOEXMLInput strips line breaks and writes runs of spaces with
    // &nbsp;), so every space in it is content: a space at the end of a paragraph is kept as ezoe keeps it
    const doc = PMDOMParser.fromSchema( schema ).parse( container, { preserveWhitespace: options.preserveWhitespace === undefined ? true : options.preserveWhitespace } );
    return doc.toJSON();
}

/**
 * Tiptap document -> ezoe editor HTML, ready to post (or, with save: false, to show with the embed previews).
 *
 * @param {object} input a Tiptap Editor, a ProseMirror Node or Tiptap JSON
 * @param {object} [options] { schema | extensions, document, save = true }
 * @returns {string}
 */
export function toEditorHTML( input, options = {} ) {
    let node;
    let schema;
    if ( input && input.state && input.state.doc ) {
        node = input.state.doc;
        schema = node.type.schema;
    }
    else if ( input instanceof PMNode ) {
        node = input;
        schema = node.type.schema;
    }
    else {
        schema = schemaFor( options );
        node = schema.nodeFromJSON( input );
    }
    const doc = documentFor( options );
    const container = doc.createElement( 'div' );
    container.appendChild( DOMSerializer.fromSchema( schema ).serializeFragment( node.content, { document: doc } ) );
    cleanupForEzoe( container, options );
    return container.innerHTML;
}

/**
 * ezoe editor HTML -> the same HTML as it comes out of the editor untouched (parse and serialise once).
 *
 * @param {string} html
 * @param {object} [options]
 * @returns {string}
 */
export function normalizeEditorHTML( html, options = {} ) {
    return toEditorHTML( fromEditorHTML( html, options ), options );
}
