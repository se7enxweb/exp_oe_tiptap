/**
 * The server side of ezoe's dialogs, called the way ezoe calls it, so Tiptap uses exactly the views,
 * policies and ezjscore functions ezoe's own dialogs use:
 *
 *   ezjscore call ezjsc::search                       search (SearchStr, SearchOffset, SearchLimit, SearchContentClassID[])
 *   ezjscore call ezoe::browse::<node>::<offset>::<n>  browse a node's children
 *   ezjscore call ezoe::bookmarks::<offset>::<n>       the user's bookmarks
 *   GET  /ezoe/load/<eZObject_N|eZNode_N>[/0/<size>]   the object as JSON (name, class, image aliases)
 *   GET  /ezoe/embed_view/<embedId>?inline&size&view&align&class   the rendered embed for the editor
 *   POST /ezoe/upload/<object>/<version>/auto/1        upload a file as a new object (ezoe's upload view)
 *
 * Every POST carries the form token (ezformtoken), every request the session cookie.
 */

export const PAGE_SIZE = 10;

const slash = ( url ) => String( url || '' ).replace( /\/?$/, '/' );

export class EzoeApi {
    /**
     * @param {Object} options editor options: urls.ezoe, urls.ezjscore, urls.root, formToken,
     *                         contentObjectId, version
     * @param {Function} fetchImpl fetch (injectable for tests)
     */
    constructor( options, fetchImpl ) {
        this.options = options;
        this.fetch = fetchImpl || ( ( ...a ) => window.fetch( ...a ) );
    }

    request( url, init ) {
        init = Object.assign( {
            credentials: 'same-origin',
            headers: { Accept: 'application/json, text/html;q=0.9', 'X-Requested-With': 'XMLHttpRequest' }
        }, init || {} );
        return this.fetch( url, init ).then( ( r ) => {
            if ( !r.ok )
                throw new Error( 'HTTP ' + r.status + ' ' + url );
            return r;
        } );
    }

    ezjscoreCall( functionArguments, params ) {
        const body = params instanceof URLSearchParams ? params : new URLSearchParams( params || {} );
        body.append( 'ezjscServer_function_arguments', functionArguments );
        body.append( 'ezxform_token', this.options.formToken || '' );
        return this.request( slash( this.options.urls.ezjscore ) + 'call', { method: 'POST', body } )
            .then( ( r ) => r.json() )
            .then( ( data ) => {
                if ( data && data.error_text )
                    throw new Error( data.error_text );
                return data ? data.content : null;
            } );
    }

    search( text, offset, classIds ) {
        const params = new URLSearchParams( { SearchStr: text, SearchOffset: String( offset || 0 ), SearchLimit: String( PAGE_SIZE ), EncodingLoadImages: '1' } );
        for ( const id of classIds || [] )
            params.append( 'SearchContentClassID[]', id );
        return this.ezjscoreCall( 'ezjsc::search', params ).then( ( c ) => ( {
            items: ( c && c.SearchResult ) || [], total: ( c && c.SearchCount ) || 0, offset: ( c && c.SearchOffset ) || 0
        } ) );
    }

    browse( nodeId, offset ) {
        return this.ezjscoreCall( 'ezoe::browse::' + parseInt( nodeId, 10 ) + '::' + ( offset || 0 ) + '::' + PAGE_SIZE ).then( ( c ) => ( {
            items: ( c && c.list ) || [], total: ( c && c.total_count ) || 0, offset: ( c && c.offset ) || 0, node: c && c.node
        } ) );
    }

    bookmarks( offset ) {
        return this.ezjscoreCall( 'ezoe::bookmarks::' + ( offset || 0 ) + '::' + PAGE_SIZE ).then( ( c ) => ( {
            items: ( c && c.list ) || [], total: ( c && c.total_count ) || 0, offset: ( c && c.offset ) || 0
        } ) );
    }

    loadObject( embedId, size ) {
        return this.request( slash( this.options.urls.ezoe ) + 'load/' + encodeURIComponent( embedId ) + ( size ? '/0/' + encodeURIComponent( size ) : '' ) )
            .then( ( r ) => r.json() );
    }

    embedView( embedId, params ) {
        return this.request( slash( this.options.urls.ezoe ) + 'embed_view/' + encodeURIComponent( embedId ) + '?' + new URLSearchParams( params ).toString() )
            .then( ( r ) => r.text() );
    }

    /**
     * Uploads like ezoe's upload dialog; ezoe's view answers with a small page for a hidden iframe that
     * calls selectByEmbedId( objectId, nodeId, name ) on success and lists errors as paragraphs.
     * @return Promise of { objectId, nodeId, name }
     */
    upload( file, fields ) {
        const o = this.options, body = new FormData();
        body.append( 'uploadButton', '1' );
        body.append( 'ezxform_token', o.formToken || '' );
        body.append( 'fileName', file, file.name );
        body.append( 'objectName', fields.name || '' );
        body.append( 'ContentObjectAttribute_name', fields.name || '' );
        body.append( 'location', fields.location || 'auto' );
        body.append( 'ContentObjectAttribute_description', fields.description || '' );
        body.append( 'ContentObjectAttribute_caption', fields.description || '' );
        body.append( 'ContentObjectAttribute_image', fields.alternativeText || '' );
        return this.request( slash( o.urls.ezoe ) + 'upload/' + o.contentObjectId + '/' + o.version + '/auto/1',
                             { method: 'POST', body, headers: { 'X-Requested-With': 'XMLHttpRequest' } } )
            .then( ( r ) => r.text() )
            .then( ( html ) => {
                const m = html.match( /selectByEmbedId\(\s*(\d+)\s*,\s*(\d+)\s*,\s*("(?:[^"\\]|\\.)*")\s*\)/ );
                if ( m )
                    return { objectId: parseInt( m[1], 10 ), nodeId: parseInt( m[2], 10 ), name: JSON.parse( m[3] ) };
                const doc = new DOMParser().parseFromString( html, 'text/html' );
                const errors = Array.prototype.map.call( doc.querySelectorAll( 'p' ), ( p ) => p.textContent.trim() ).filter( Boolean );
                throw new Error( errors.join( ' ' ) || 'Upload failed' );
            } );
    }
}

/** customattributes="name|valueattribute_separationname2|value2" <-> { name: value } */
export const ATTRIBUTE_SEPARATOR = 'attribute_separation';

export function parseCustomAttributes( value ) {
    const result = {};
    for ( const part of String( value || '' ).split( ATTRIBUTE_SEPARATOR ) ) {
        const pos = part.indexOf( '|' );
        if ( pos > 0 )
            result[part.slice( 0, pos )] = part.slice( pos + 1 );
    }
    return result;
}

export function serializeCustomAttributes( values ) {
    return Object.keys( values ).filter( ( k ) => values[k] !== null && values[k] !== undefined && values[k] !== '' )
        .map( ( k ) => k + '|' + values[k] ).join( ATTRIBUTE_SEPARATOR );
}

export function decodeHtml( value ) {
    const el = document.createElement( 'textarea' );
    el.innerHTML = String( value === undefined || value === null ? '' : value );
    return el.value;
}
