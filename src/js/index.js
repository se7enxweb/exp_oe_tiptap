/**
 * exp_oe_tiptap browser entry: window.ExpOETiptap
 *
 *   ExpOETiptap.init( textarea, options )   mounts Tiptap on an ezxmltext textarea, returns the instance
 *   ExpOETiptap.get( textareaOrId )         the instance of a textarea
 *   ExpOETiptap.destroy( textareaOrId )     removes the editor, shows the textarea again
 *   ExpOETiptap.instances                   all instances of the page (several attributes per form)
 *   ExpOETiptap.version
 *
 * options: the contract of doc/plan.md section 5 (built by the edit template from INI and the
 * input handler). The textarea holds ezoe's HTML ($input_handler.input_xml) and stays the posted field.
 *
 * Extras read when present (the template may add them, all optional):
 *   skinVariant, height, browseRoots [ { node_id, name } ], rootNode, relationGroups { images: [ class ids ] },
 *   relationDefaultGroup, compatibilityMode, attachmentIcon, urls.ezoeDesign (base URL of ezoe's design/standard/),
 *   ai.labels { command: label }, ai.languages [ [ code, name ] ], ai.maxInputLength
 */
import { ExpOETiptapInstance, normalizeOptions, DEFAULT_BUTTONS } from './editor/instance.js';
import { schema } from './editor/schema-bridge.js';

const instances = [];

function resolveTextarea( textareaOrId ) {
    if ( typeof textareaOrId === 'string' )
        return document.getElementById( textareaOrId );
    return textareaOrId || null;
}

function get( textareaOrId ) {
    const el = resolveTextarea( textareaOrId );
    return instances.find( ( i ) => i.textarea === el ) || null;
}

function init( textareaOrId, options ) {
    const textarea = resolveTextarea( textareaOrId );
    if ( !textarea || textarea.tagName !== 'TEXTAREA' )
        throw new Error( 'ExpOETiptap.init: a textarea element is required' );
    const existing = get( textarea );
    if ( existing )
        return existing;
    const instance = new ExpOETiptapInstance( textarea, options );
    instances.push( instance );
    return instance;
}

function destroy( textareaOrId ) {
    const instance = get( textareaOrId );
    if ( !instance )
        return false;
    instance.destroy();
    instances.splice( instances.indexOf( instance ), 1 );
    return true;
}

const api = {
    version: '0.1.0',
    init,
    get,
    destroy,
    instances,
    normalizeOptions,
    DEFAULT_BUTTONS,
    usesFallbackSchema: schema.isFallback
};

if ( typeof window !== 'undefined' )
    window.ExpOETiptap = api;

export default api;
export { init, get, destroy, instances, ExpOETiptapInstance };
