/**
 * Post-processing of the HTML Tiptap serialises, so that it is the HTML ezoe's TinyMCE posts and eZOEInputParser
 * expects (the same clean-ups ezoe's own plugins make when the form is saved):
 *
 *  - an empty paragraph is <p><br></p> (TinyMCE's form; the parser keeps it as an empty paragraph)
 *  - a list item with a single paragraph without attributes is written without the <p> (eZOEXMLInput writes it so)
 *  - the preview inside <div>/<span> embeds becomes the text "ezembed" (ezembed plugin, issue 18264)
 *  - the ezoeAlign<align> helper class of image embeds is removed (ezembed plugin, EZP-22487)
 *  - line breaks in a <pre> are <br> (eZOEXMLInput writes them so; the parser reads both)
 *
 * @license GPL-2.0-or-later
 */

const BLOCK_IN_LI = /^(ul|ol)$/i;

function isElement( node, name ) {
    return node && node.nodeType === 1 && ( !name || node.nodeName.toLowerCase() === name );
}

function hasAttributes( element ) {
    return element.attributes && element.attributes.length > 0;
}

/**
 * Applies the save clean-ups to the children of `root` (a DOM element holding the serialised document).
 *
 * @param {Element} root
 * @param {object} [options]
 * @param {boolean} [options.save=true] replace embed previews by "ezembed" and drop ezoeAlign classes
 */
export function cleanupForEzoe( root, options = {} ) {
    const save = options.save !== false;
    const doc = root.ownerDocument;

    root.querySelectorAll( 'p' ).forEach( p => {
        if ( p.childNodes.length === 0 )
            p.appendChild( doc.createElement( 'br' ) );
    } );

    root.querySelectorAll( 'li' ).forEach( li => {
        const children = Array.from( li.childNodes );
        if ( !children.length || !isElement( children[ 0 ], 'p' ) || hasAttributes( children[ 0 ] ) )
            return;
        const rest = children.slice( 1 );
        if ( rest.some( child => !isElement( child ) || !BLOCK_IN_LI.test( child.nodeName ) ) )
            return;
        const p = children[ 0 ];
        // an empty paragraph keeps its <br> only when it is the whole item
        if ( p.childNodes.length === 1 && isElement( p.firstChild, 'br' ) && rest.length )
            p.removeChild( p.firstChild );
        while ( p.firstChild )
            li.insertBefore( p.firstChild, p );
        li.removeChild( p );
    } );

    root.querySelectorAll( 'pre' ).forEach( pre => {
        Array.from( pre.childNodes ).forEach( child => {
            if ( child.nodeType !== 3 || child.nodeValue.indexOf( '\n' ) === -1 )
                return;
            const parts = child.nodeValue.split( '\n' );
            parts.forEach( ( part, index ) => {
                if ( index > 0 )
                    pre.insertBefore( doc.createElement( 'br' ), child );
                if ( part !== '' )
                    pre.insertBefore( doc.createTextNode( part ), child );
            } );
            pre.removeChild( child );
        } );
    } );

    if ( save ) {
        root.querySelectorAll( 'div.ezoeItemNonEditable, span.ezoeItemNonEditable' ).forEach( node => {
            node.textContent = 'ezembed';
        } );
        root.querySelectorAll( '[class*="ezoeAlign"]' ).forEach( node => {
            node.classList.remove( 'ezoeAlign' + node.getAttribute( 'align' ) );
            if ( !node.getAttribute( 'class' ) )
                node.removeAttribute( 'class' );
        } );
    }
    return root;
}
