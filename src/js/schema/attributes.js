/**
 * Attribute helpers for the ezoe editor HTML dialect.
 *
 * Every attribute ezoe writes is kept verbatim: the well known ones as named Tiptap attributes (so the UI can read
 * and change them), everything else in one catch-all attribute `extraAttrs`, so unknown classes, custom attributes
 * and attributes of future ezoe versions survive the editor untouched.
 *
 * @license GPL-2.0-or-later
 */

/** Attributes that belong to TinyMCE or the browser and are never stored. */
const TRANSIENT_ATTRIBUTE = /^(data-mce-|data-pm-|contenteditable$|draggable$|spellcheck$)/i;

/**
 * A Tiptap attribute kept exactly as written in the HTML (string or null).
 *
 * @param {string} name HTML attribute name, also the attribute's name in the node
 * @returns {object}
 */
export function verbatim( name ) {
    return {
        default: null,
        parseHTML: element => element.getAttribute( name ),
        renderHTML: attributes => ( attributes[ name ] == null ? {} : { [ name ]: attributes[ name ] } )
    };
}

/**
 * Tiptap attributes for a list of named HTML attributes plus `extraAttrs` with all the others.
 *
 * @param {string[]} names attributes kept under their own name
 * @param {string[]} [ignore] attributes neither named nor kept (they are made from other attributes)
 * @returns {object}
 */
export function attributeSet( names, ignore = [] ) {
    const attributes = {};
    names.forEach( name => { attributes[ name ] = verbatim( name ); } );
    const known = new Set( names.concat( ignore ).map( name => name.toLowerCase() ) );
    attributes.extraAttrs = {
        default: null,
        parseHTML: element => {
            const extra = {};
            let count = 0;
            for ( const attribute of Array.from( element.attributes ) ) {
                if ( known.has( attribute.name.toLowerCase() ) || TRANSIENT_ATTRIBUTE.test( attribute.name ) )
                    continue;
                extra[ attribute.name ] = attribute.value;
                count++;
            }
            return count ? extra : null;
        },
        renderHTML: attributes => attributes.extraAttrs || {}
    };
    return attributes;
}

/** The attributes ezoe writes on nearly every element: the custom attributes, the style made of them, a class. */
export const COMMON = [ 'customattributes', 'class', 'style' ];

/**
 * Splits ezoe's `customattributes` value ("name|valueattribute_separationname2|value2") into an object.
 *
 * @param {string|null} value
 * @returns {Object<string,string>}
 */
export function parseCustomAttributes( value ) {
    const result = {};
    if ( !value )
        return result;
    value.split( 'attribute_separation' ).forEach( part => {
        const bar = part.indexOf( '|' );
        if ( part !== '' && bar !== -1 )
            result[ part.slice( 0, bar ) ] = part.slice( bar + 1 );
    } );
    return result;
}

/**
 * Joins an object of custom attributes into ezoe's `customattributes` value (null when empty).
 *
 * @param {Object<string,string>} values
 * @returns {string|null}
 */
export function serializeCustomAttributes( values ) {
    const parts = Object.keys( values || {} ).map( name => name + '|' + ( values[ name ] == null ? '' : values[ name ] ) );
    return parts.length ? parts.join( 'attribute_separation' ) : null;
}

/** Classes of ezoe, TinyMCE and browsers that eZOEInputParser strips (eZOEInputParser::HTML_CLASS_REGEX). */
export const INTERNAL_CLASS = /(webkit-[\w-]+|Apple-[\w-]+|mceItem\w+|ezoeItem\w+|ezoeAlign\w+|mceVisualAid)/gi;

/**
 * The class value without ezoe's internal classes, as the server sees it.
 *
 * @param {string|null} value
 * @returns {string}
 */
export function cleanClass( value ) {
    return ( value || '' ).replace( INTERNAL_CLASS, '' ).replace( /\s+/g, ' ' ).trim();
}

/**
 * The name of a custom tag from the class of its element ("ezoeItemCustomTag factbox" -> "factbox").
 *
 * @param {object} attrs node or mark attributes
 * @returns {string}
 */
export function customTagName( attrs ) {
    return cleanClass( attrs && attrs.class );
}
