/**
 * Tiny DOM helpers for the toolbar, status bar and dialogs (no framework).
 */

/**
 * h( 'a', { class: 'x', onclick: fn, title: 't' }, [ 'text', otherNode ] )
 * Attributes with a function value become event listeners (on<event>), null/false are skipped.
 */
export function h( tag, attrs, children ) {
    const el = document.createElement( tag );
    for ( const [ key, value ] of Object.entries( attrs || {} ) ) {
        if ( value === null || value === undefined || value === false )
            continue;
        if ( typeof value === 'function' && key.startsWith( 'on' ) )
            el.addEventListener( key.slice( 2 ), value );
        else if ( key === 'class' )
            el.className = value;
        else if ( key === 'text' )
            el.textContent = value;
        else if ( key === 'value' && 'value' in el )
            el.value = value;
        else if ( key === 'checked' || key === 'selected' || key === 'disabled' )
            el[key] = !!value;
        else
            el.setAttribute( key, value === true ? '' : String( value ) );
    }
    for ( const child of [].concat( children === undefined ? [] : children ) ) {
        if ( child === null || child === undefined || child === false )
            continue;
        el.appendChild( typeof child === 'string' || typeof child === 'number' ? document.createTextNode( String( child ) ) : child );
    }
    return el;
}

export function clear( el ) {
    while ( el.firstChild )
        el.removeChild( el.firstChild );
    return el;
}

/** Translation lookup: options.i18n maps the English text to the translated text */
export function translator( i18n ) {
    return ( text, replacements ) => {
        let s = ( i18n && typeof i18n[text] === 'string' && i18n[text] ) || text;
        if ( replacements ) {
            for ( const [ k, v ] of Object.entries( replacements ) )
                s = s.split( k ).join( String( v ) );
        }
        return s;
    };
}
