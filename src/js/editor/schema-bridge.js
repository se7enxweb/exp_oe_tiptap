/**
 * The one place the editor talks to the schema module (src/js/schema/index.js, Agent B).
 *
 * The schema module's naming (doc/content-mapping.md): "editor HTML" is ezoe's editor HTML dialect,
 *   ezoeExtensions( options )               Tiptap extensions of the dialect (no history, cursors, keys)
 *   fromEditorHTML( html, { schema } )      ezoe HTML (the textarea) -> Tiptap JSON document
 *   toEditorHTML( editor|node, { schema } ) Tiptap document -> ezoe HTML to post
 *   cleanupForEzoe( element, options )      the clean-up toEditorHTML applies after serialising
 *
 * The bridge turns that into what the editor needs:
 *   extensions( options ), load( html, schema ), save( editor ), parseFragment( html, schema ), cleanup( el )
 */
import * as schemaModule from '#ezoe-schema';

const has = ( name ) => typeof schemaModule[name] === 'function';

export function createBridge( mod ) {
    const fn = ( name ) => ( typeof mod[name] === 'function' ? mod[name] : null );
    return {
        isFallback: !!mod.isFallback,
        extensions( options ) {
            if ( !fn( 'ezoeExtensions' ) )
                throw new Error( 'exp_oe_tiptap: the schema module does not export ezoeExtensions()' );
            return mod.ezoeExtensions( options );
        },
        /** Content for new Editor() / setContent() from the textarea value */
        load( html, schema ) {
            return fn( 'fromEditorHTML' ) ? mod.fromEditorHTML( html || '', { schema } ) : ( html || '' );
        },
        /** The ezoe HTML the form posts */
        save( editor ) {
            return fn( 'toEditorHTML' ) ? mod.toEditorHTML( editor, { schema: editor.schema } ) : editor.getHTML();
        },
        /** Content (array of node JSON) for insertContent() from a piece of ezoe HTML */
        parseFragment( html, schema ) {
            const loaded = this.load( html, schema );
            return loaded && typeof loaded === 'object' && Array.isArray( loaded.content ) ? loaded.content : loaded;
        },
        /** Turns rendered editor DOM into the posted dialect in place */
        cleanup( element ) {
            if ( fn( 'cleanupForEzoe' ) )
                mod.cleanupForEzoe( element, {} );
        }
    };
}

export const schema = createBridge( schemaModule );
export const schemaHas = has;
