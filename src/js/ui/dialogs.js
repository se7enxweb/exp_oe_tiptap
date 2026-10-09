/**
 * The ezoe dialogs for Tiptap: link, anchor, embed (image/object/file with search, browse, bookmarks
 * and upload), custom tag, table, table cell, special characters and help.
 *
 * They call ezoe's own server side (ezoe-api.js) and produce the ezoe HTML dialect, exactly the
 * markup eZOEXMLInput writes and eZOEInputParser reads. The markup goes into Tiptap through the
 * schema's own parse rules (insertContent / attrsFromElement), so the dialogs never depend on the
 * node and attribute names of the schema.
 */
import { DOMSerializer as Serializer } from '@tiptap/pm/model';
import { NodeSelection } from '@tiptap/pm/state';
import { h, clear } from './dom.js';
import { openDialog, field, select } from './dialog.js';
import { EzoeApi, PAGE_SIZE, parseCustomAttributes, serializeCustomAttributes, decodeHtml } from './ezoe-api.js';
import {
    linkMark, markForTag, nodeForTag, selectedAncestor, attrsFromElement, dialectElement, makeElement, escapeHtml
} from '../editor/schema-utils.js';


const EMBED_ID = /^eZ(Object|Node)_(\d+)$/;

// ---------------------------------------------------------------- helpers

function dialect( ctx, nodeOrMark ) {
    return dialectElement( ctx.editor, nodeOrMark, ( el ) => ctx.schema.cleanup( el ), Serializer );
}

/** Inserts ezoe dialect HTML at the selection (or over range) through the schema's parser */
export function insertDialectHTML( ctx, html, range ) {
    let content = ctx.schema.parseFragment( html, ctx.editor.schema );
    // inline markup (link text, anchor, inline embed or custom tag) is parsed into a paragraph of its own:
    // insert only the paragraph's content so it lands inside the current paragraph
    const holder = document.createElement( 'div' );
    holder.innerHTML = html;
    const first = holder.firstElementChild;
    const inline = !first || !/^(P|DIV|PRE|H[1-6]|UL|OL|TABLE)$/.test( first.tagName ) && !( first.tagName === 'IMG' && first.getAttribute( 'inline' ) === 'false' && !/ezoeItemCustomTag/.test( first.className ) );
    if ( inline && Array.isArray( content ) && content.length === 1 && content[0].type === 'paragraph' &&
         Object.values( content[0].attrs || {} ).every( ( v ) => v === null || v === undefined || v === '' ) )
        content = content[0].content || [];
    const chain = ctx.editor.chain().focus();
    return range ? chain.insertContentAt( range, content ).run() : chain.insertContent( content ).run();
}

/** Selected text, for inline wrappers */
function selectedText( editor ) {
    const { from, to } = editor.state.selection;
    return editor.state.doc.textBetween( from, to, '\n' );
}

/** Selected content as editor HTML, for block wrappers */
function selectedHTML( editor ) {
    const { selection } = editor.state;
    if ( selection.empty )
        return '';
    const fragment = Serializer.fromSchema( editor.schema ).serializeFragment( selection.content().content );
    const holder = document.createElement( 'div' );
    holder.appendChild( fragment );
    return holder.innerHTML;
}

function classOptions( t, classes ) {
    const list = [ [ '', t( '-- Not set --' ) ] ];
    if ( Array.isArray( classes ) )
        classes.forEach( ( c ) => list.push( [ c, c ] ) );
    else
        Object.keys( classes || {} ).forEach( ( c ) => list.push( [ c, classes[c] || c ] ) );
    return list;
}

function cleanClass( value ) {
    return String( value || '' ).replace( /\b(ezoeItem\w+|ezoeAlign\w+|mceItem\w+|mceVisualAid)\b/g, '' ).replace( /\s+/g, ' ' ).trim();
}

/** Form controls for custom attribute definitions (eZOEXMLInput::getCustomAttributeDefinitions()) */
function attributeFields( t, definitions, stored ) {
    const controls = {};
    const rows = ( definitions || [] ).map( ( a ) => {
        const value = stored[a.id] !== undefined ? stored[a.id] : ( a['default'] || '' );
        let control;
        if ( a.type === 'select' ) {
            const opts = Object.keys( a.selection || {} ).map( ( k ) => [ k === '-0-' ? '' : k, a.selection[k] ] );
            control = select( opts.length ? opts : [ [ '', '' ] ], value );
        } else if ( a.type === 'checkbox' ) {
            control = h( 'input', { type: 'checkbox', checked: value !== '' && value !== 'false' && value !== undefined } );
        } else if ( a.type === 'textarea' ) {
            control = h( 'textarea', { rows: a.rows || 3 } );
            control.value = value;
        } else {
            control = h( 'input', { type: a.type === 'int' || a.type === 'number' ? 'number' : 'text', value, placeholder: a.title || null } );
        }
        control.disabled = !!a.disabled;
        controls[a.id] = { def: a, control };
        return field( a.name + ( a.required ? ' *' : '' ), control );
    } );
    const read = () => {
        const values = {};
        for ( const [ id, { def, control } ] of Object.entries( controls ) ) {
            let v = def.type === 'checkbox' ? ( control.checked ? ( String( def['default'] || '' ).trim() || '1' ) : '' ) : String( control.value ).trim();
            if ( def.required && v === '' )
                throw new Error( t( 'Please fill in: %s' ).replace( '%s', def.name ) );
            if ( v !== '' && def.type === 'int' && !/^-?\d+$/.test( v ) )
                throw new Error( t( 'Please enter a whole number: %s' ).replace( '%s', def.name ) );
            if ( v !== '' && def.type === 'number' && !/^-?\d+([.,]\d+)?$/.test( v ) )
                throw new Error( t( 'Please enter a number: %s' ).replace( '%s', def.name ) );
            if ( v !== '' && def.type === 'email' && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test( v ) )
                throw new Error( t( 'Please enter an e-mail address: %s' ).replace( '%s', def.name ) );
            values[id] = v;
        }
        return values;
    };
    return { rows, read };
}

// ---------------------------------------------------------------- content picker (search, browse, bookmarks)

/**
 * The list of ezoe's dialogs: Search, Browse and Bookmarks tabs, a table with radio, name and class,
 * PAGE_SIZE entries per page. onPick( item ) gets the ezjscAjaxContent item.
 */
function contentPicker( ctx, api, onPick ) {
    const { t, options } = ctx;
    const status = h( 'div', { class: 'exp-oe-picker-status', 'aria-live': 'polite' } );
    const list = h( 'div', { class: 'exp-oe-picker-list' } );
    const query = h( 'input', { type: 'search', placeholder: t( 'Search' ) } );
    const pathBar = h( 'div', { class: 'exp-oe-picker-path' } );
    let mode = 'search', lastQuery = '', node = options.browseRoots && options.browseRoots[0] ? options.browseRoots[0].node_id : ( options.rootNode || 2 );

    const show = ( result, reload ) => {
        clear( list );
        clear( pathBar );
        if ( result.node && Array.isArray( result.node.path ) ) {
            result.node.path.concat( [ result.node ] ).forEach( ( n, i, all ) => {
                if ( i )
                    pathBar.appendChild( document.createTextNode( ' / ' ) );
                pathBar.appendChild( i === all.length - 1 ? h( 'strong', { text: decodeHtml( n.name ) } )
                    : h( 'a', { href: '#', text: decodeHtml( n.name ), onclick: ( e ) => { e.preventDefault(); node = n.node_id; load( 0 ); } } ) );
            } );
        }
        if ( !result.items.length ) {
            list.appendChild( h( 'p', { class: 'exp-oe-empty', text: t( 'No results' ) } ) );
            return;
        }
        const name = 'exp-oe-pick-' + Math.random().toString( 36 ).slice( 2 );
        const rows = result.items.map( ( item ) => h( 'tr', {}, [
            h( 'td', {}, h( 'input', { type: 'radio', name, onchange: () => onPick( item ) } ) ),
            h( 'td', {}, mode === 'browse' && item.children_count
                ? h( 'a', { href: '#', text: decodeHtml( item.name ), onclick: ( e ) => { e.preventDefault(); node = item.node_id; load( 0 ); } } )
                : decodeHtml( item.name ) ),
            h( 'td', { class: 'exp-oe-picker-class', text: decodeHtml( item.class_name || '' ) } )
        ] ) );
        list.appendChild( h( 'table', { class: 'exp-oe-picker-table' }, h( 'tbody', {}, rows ) ) );
        if ( result.total > PAGE_SIZE ) {
            const from = result.offset + 1, to = Math.min( result.offset + PAGE_SIZE, result.total );
            list.appendChild( h( 'div', { class: 'exp-oe-picker-paging' }, [
                result.offset > 0 ? h( 'a', { href: '#', text: '<< ' + t( 'Previous' ), onclick: ( e ) => { e.preventDefault(); reload( Math.max( 0, result.offset - PAGE_SIZE ) ); } } ) : h( 'span' ),
                h( 'span', { text: t( '%1 to %2 of %3' ).replace( '%1', from ).replace( '%2', to ).replace( '%3', result.total ) } ),
                to < result.total ? h( 'a', { href: '#', text: t( 'Next' ) + ' >>', onclick: ( e ) => { e.preventDefault(); reload( result.offset + PAGE_SIZE ); } } ) : h( 'span' )
            ] ) );
        }
    };

    const load = ( offset ) => {
        status.textContent = t( 'Loading...' );
        let p;
        if ( mode === 'search' )
            p = lastQuery ? api.search( lastQuery, offset ) : Promise.resolve( { items: [], total: 0, offset: 0 } );
        else if ( mode === 'browse' )
            p = api.browse( node, offset );
        else
            p = api.bookmarks( offset );
        return p.then( ( r ) => {
            status.textContent = '';
            show( r, load );
        }, ( e ) => {
            status.textContent = e.message;
        } );
    };

    const tabs = h( 'div', { class: 'exp-oe-tabs', role: 'tablist' } );
    const searchRow = h( 'div', { class: 'exp-oe-picker-search' }, [
        query, h( 'button', { type: 'button', class: 'exp-oe-dialog-button', text: t( 'Search' ), onclick: () => { lastQuery = query.value.trim(); load( 0 ); } } )
    ] );
    query.addEventListener( 'keydown', ( e ) => {
        if ( e.key === 'Enter' ) {
            e.preventDefault();
            e.stopPropagation();
            lastQuery = query.value.trim();
            load( 0 );
        }
    } );
    const setMode = ( m ) => {
        mode = m;
        for ( const b of tabs.children )
            b.setAttribute( 'aria-selected', b.getAttribute( 'data-mode' ) === m ? 'true' : 'false' );
        searchRow.hidden = m !== 'search';
        pathBar.hidden = m !== 'browse';
        clear( list );
        if ( m !== 'search' )
            load( 0 );
    };
    for ( const [ m, label ] of [ [ 'search', 'Search' ], [ 'browse', 'Browse' ], [ 'bookmarks', 'Bookmarks' ] ] )
        tabs.appendChild( h( 'button', { type: 'button', role: 'tab', class: 'exp-oe-tab', 'data-mode': m, text: t( label ), onclick: () => setMode( m ) } ) );
    const element = h( 'div', { class: 'exp-oe-picker' }, [ tabs, searchRow, pathBar, status, list ] );
    setMode( 'search' );
    return { element };
}

// ---------------------------------------------------------------- link

function linkDialog( ctx ) {
    const { editor, t, options } = ctx;
    const mark = linkMark( editor );
    if ( !mark )
        return;
    const api = new EzoeApi( options, ctx.fetch );
    const active = editor.isActive( mark.name );
    let el = null;
    if ( active ) {
        editor.chain().extendMarkRange( mark.name ).run();
        const m = editor.state.selection.$from.marks().find( ( x ) => x.type === mark.type ) ||
                  editor.state.doc.resolve( editor.state.selection.from + 1 ).marks().find( ( x ) => x.type === mark.type );
        el = m ? dialect( ctx, m ) : null;
    }
    const get = ( a ) => ( el && el.getAttribute( a ) ) || '';
    const stored = parseCustomAttributes( get( 'customattributes' ) );
    const href = h( 'input', { type: 'text', value: get( 'href' ), placeholder: 'https://, eznode://, ezobject://, mailto:, #anchor', autofocus: true } );
    const target = select( [ [ '', t( '-- Not set --' ) ], [ '_blank', t( 'Open in new window' ) ] ], get( 'target' ) );
    const title = h( 'input', { type: 'text', value: get( 'title' ) } );
    const id = h( 'input', { type: 'text', value: get( 'id' ) } );
    const cls = select( classOptions( t, options.linkClasses ), cleanClass( get( 'class' ) ) );
    const view = select( [ [ '', t( 'Default' ) ] ].concat( ( options.linkViewModes || [] ).map( ( v ) => [ v, v ] ) ), get( 'view' ) );
    const linkDef = ( options.generalDefinitions && options.generalDefinitions.link ) || {};
    const custom = attributeFields( t, linkDef.attributes, stored );
    const picker = contentPicker( ctx, api, ( item ) => {
        href.value = 'eznode://' + item.node_id;
        if ( !title.value )
            title.value = decodeHtml( item.name );
    } );
    const pickerBox = h( 'details', { class: 'exp-oe-link-picker' }, [ h( 'summary', { text: t( 'Choose content' ) } ), picker.element ] );

    openDialog( {
        title: t( active ? 'Edit link' : 'Insert link' ), width: 560, closeText: t( 'Close' ),
        body: [ field( t( 'URL' ), href ), pickerBox, field( t( 'Target' ), target ), field( t( 'Title' ), title ),
                field( t( 'Class' ), cls ), field( t( 'View' ), view ), field( t( 'ID' ), id ) ].concat( custom.rows ),
        buttons: [
            { text: t( 'OK' ), primary: true, onClick: () => {
                const url = href.value.trim();
                if ( !url ) {
                    if ( active )
                        editor.chain().focus().extendMarkRange( mark.name ).unsetMark( mark.name ).run();
                    return true;
                }
                const a = makeElement( 'a', {
                    href: url, target: target.value, title: title.value.trim(), 'class': cls.value, view: view.value, id: id.value.trim(),
                    customattributes: serializeCustomAttributes( custom.read() )
                } );
                const attrs = attrsFromElement( mark.type, a ) || { href: url };
                const chain = editor.chain().focus();
                if ( active )
                    chain.extendMarkRange( mark.name );
                if ( editor.state.selection.empty && !active ) {
                    // nothing selected: insert the address as linked text
                    a.textContent = title.value.trim() || url;
                    return insertDialectHTML( ctx, a.outerHTML );
                }
                return chain.setMark( mark.name, attrs ).run();
            } },
            { text: t( 'Cancel' ), cancel: true }
        ]
    } );
}

// ---------------------------------------------------------------- anchor

function anchorDialog( ctx ) {
    const { editor, t } = ctx;
    const sel = editor.state.selection;
    const existing = sel instanceof NodeSelection && /anchor/i.test( sel.node.type.name ) ? sel.node : null;
    const el = existing ? dialect( ctx, existing ) : null;
    const name = h( 'input', { type: 'text', value: el ? el.getAttribute( 'name' ) || '' : '', autofocus: true } );
    openDialog( {
        title: t( 'Insert/edit anchor' ), width: 360, closeText: t( 'Close' ),
        body: [ field( t( 'Anchor name' ), name ) ],
        buttons: [
            { text: t( 'OK' ), primary: true, onClick: () => {
                const v = name.value.trim();
                if ( !/^[A-Za-z][\w\-:.]*$/.test( v ) )
                    throw new Error( t( 'Please enter a valid anchor name' ) );
                const html = makeElement( 'a', { name: v, 'class': 'mceItemAnchor' } ).outerHTML;
                return insertDialectHTML( ctx, html, existing ? { from: sel.from, to: sel.to } : null );
            } },
            { text: t( 'Cancel' ), cancel: true }
        ]
    } );
}

// ---------------------------------------------------------------- embed

function contentTypeOf( options, classIdentifier ) {
    const groups = options.relationGroups || { images: [ 'image' ], files: [ 'file' ] };
    for ( const g of Object.keys( groups ) ) {
        if ( ( groups[g] || [] ).indexOf( classIdentifier ) !== -1 )
            return g;
    }
    return options.relationDefaultGroup || 'objects';
}

function imageAlias( object, size ) {
    const attr = object.image_attributes && object.image_attributes[0];
    const content = attr && object.data_map && object.data_map[attr] && object.data_map[attr].content;
    if ( !content || typeof content !== 'object' )
        return null;
    return content[size] || content.original || null;
}

/** ezoe dialect HTML of an embed, like eZOEXMLInput writes it (see the TinyMCE 8 ezembed plugin) */
export function buildEmbedHTML( ctx, api, embedId, data ) {
    const { options } = ctx;
    const inline = !!data.inline, size = data.size || options.defaultSize || 'medium';
    const view = data.view || ( inline ? 'embed-inline' : 'embed' );
    return api.loadObject( embedId, size ).then( ( object ) => {
        if ( !object )
            throw new Error( ctx.t( 'Object not found or access denied' ) + ': ' + embedId );
        const type = contentTypeOf( options, object.class_identifier );
        let classes = cleanClass( data.cssClass );
        const attrs = {
            id: embedId, title: decodeHtml( object.name ), alt: size, view, inline: inline ? 'true' : 'false',
            customattributes: data.customAttributes || null
        };
        if ( type === 'images' && !options.compatibilityMode ) {
            const alias = imageAlias( object, size ) || {};
            let src = alias.url || options.attachmentIcon || '';
            if ( src && !/^(https?:)?\//.test( src ) )
                src = ( ( options.urls && options.urls.root ) || '/' ) + src;
            attrs.src = src;
            attrs.width = alias.width || 32;
            attrs.height = alias.height || 32;
            attrs.align = data.align === 'center' ? 'middle' : data.align;
            if ( attrs.align )
                classes = ( classes + ' ezoeAlign' + attrs.align ).trim();
            attrs['class'] = classes;
            return makeElement( 'img', attrs ).outerHTML;
        }
        attrs.align = data.align;
        attrs['class'] = ( 'ezoeItemNonEditable ' + classes + ' ezoeItemContentType' + type.charAt( 0 ).toUpperCase() + type.slice( 1 ) ).replace( /\s+/g, ' ' );
        return api.embedView( embedId, { inline: inline ? 'true' : 'false', size, view, align: data.align || 'none', 'class': data.cssClass || '' } )
            .then( ( inner ) => makeElement( inline ? 'span' : 'div', attrs, inner || escapeHtml( attrs.title ) ).outerHTML );
    } );
}

/** The selected embed node, { node, pos, el } or null */
function selectedEmbed( ctx ) {
    const found = selectedAncestor( ctx.editor, ( n ) => {
        if ( /embed/i.test( n.type.name ) )
            return true;
        return typeof n.attrs.id === 'string' && EMBED_ID.test( n.attrs.id );
    } );
    if ( !found )
        return null;
    found.el = dialect( ctx, found.node );
    return found;
}

function embedDialog( ctx, contentType ) {
    const { t, options } = ctx;
    const api = new EzoeApi( options, ctx.fetch );
    const existing = selectedEmbed( ctx );
    const el = existing && existing.el;
    const get = ( a ) => ( el && el.getAttribute( a ) ) || '';
    let embedId = get( 'id' ) && EMBED_ID.test( get( 'id' ) ) ? get( 'id' ) : '';
    const chosen = h( 'div', { class: 'exp-oe-embed-chosen', text: embedId ? get( 'title' ) + ' (' + embedId + ')' : t( 'Nothing chosen yet' ) } );
    const choose = ( id, name ) => {
        embedId = id;
        chosen.textContent = decodeHtml( name ) + ' (' + id + ')';
    };
    const picker = contentPicker( ctx, api, ( item ) => choose( 'eZObject_' + item.contentobject_id, item.name ) );

    // upload, like ezoe's upload dialog (ezoe/upload/<object>/<version>/auto/1)
    const file = h( 'input', { type: 'file' } );
    const upName = h( 'input', { type: 'text' } );
    const upDesc = h( 'input', { type: 'text' } );
    const upStatus = h( 'div', { class: 'exp-oe-hint' } );
    const uploadBox = h( 'details', { class: 'exp-oe-embed-upload' }, [
        h( 'summary', { text: t( 'Upload new file' ) } ),
        field( t( 'File' ), file ), field( t( 'Name' ), upName ), field( t( 'Description' ), upDesc ),
        h( 'button', { type: 'button', class: 'exp-oe-dialog-button', text: t( 'Upload' ), onclick: () => {
            if ( !file.files || !file.files[0] ) {
                upStatus.textContent = t( 'Please choose a file.' );
                return;
            }
            upStatus.textContent = t( 'Uploading...' );
            api.upload( file.files[0], { name: upName.value, description: upDesc.value, alternativeText: upDesc.value } ).then( ( r ) => {
                upStatus.textContent = t( 'Uploaded' ) + ': ' + r.name;
                choose( 'eZObject_' + r.objectId, r.name );
            }, ( e ) => {
                upStatus.textContent = e.message;
            } );
        } } ), upStatus
    ] );

    const inline = get( 'inline' ) === 'true';
    const defs = options.embedDefinitions || {};
    const def = defs[inline ? 'embed-inline' : 'embed'] || {};
    const sizes = ( options.imageSizes || [ 'small', 'medium', 'large', 'original' ] ).map( ( s ) => [ s, s ] );
    const size = select( sizes, get( 'alt' ) || options.defaultSize || 'medium' );
    let align0 = get( 'align' );
    if ( align0 === 'middle' )
        align0 = 'center';
    const align = select( [ [ '', t( '-- Not set --' ) ], [ 'left', t( 'Left' ) ], [ 'center', t( 'Center' ) ], [ 'right', t( 'Right' ) ] ], align0 );
    const views = ( def.views && def.views.length ? def.views : ( options.viewModes || [ 'embed', 'embed-inline' ] ) ).map( ( v ) => [ v, v ] );
    const view = select( views, get( 'view' ) || ( inline ? 'embed-inline' : 'embed' ) );
    const cls = select( classOptions( t, def.classes ), cleanClass( get( 'class' ) ) );
    const inlineBox = h( 'input', { type: 'checkbox', checked: inline } );
    const custom = attributeFields( t, def.attributes, parseCustomAttributes( get( 'customattributes' ) ) );
    const titles = { images: 'Insert/edit image', files: 'Insert/edit file', objects: 'Insert/edit object' };

    openDialog( {
        title: t( titles[contentType] || 'Insert/edit object' ), width: 620, closeText: t( 'Close' ), busyText: t( 'Loading preview...' ),
        body: [ chosen, picker.element, uploadBox,
                h( 'fieldset', { class: 'exp-oe-embed-props' }, [ h( 'legend', { text: t( 'Properties' ) } ),
                    field( t( 'Size' ), size ), field( t( 'Alignment' ), align ), field( t( 'View' ), view ),
                    field( t( 'Class' ), cls ), field( t( 'Inline' ), inlineBox ) ].concat( custom.rows ) ) ],
        buttons: [
            { text: t( 'OK' ), primary: true, onClick: () => {
                if ( !embedId )
                    throw new Error( t( 'Please choose an object first' ) );
                const data = {
                    inline: inlineBox.checked, size: size.value, align: align.value, view: view.value,
                    cssClass: cls.value, customAttributes: serializeCustomAttributes( custom.read() )
                };
                if ( data.inline && view.value === 'embed' )
                    data.view = 'embed-inline';
                if ( !data.inline && view.value === 'embed-inline' )
                    data.view = 'embed';
                return buildEmbedHTML( ctx, api, embedId, data ).then( ( html ) => {
                    const range = existing ? { from: existing.pos, to: existing.pos + existing.node.nodeSize } : null;
                    insertDialectHTML( ctx, html, range );
                } );
            } },
            { text: t( 'Cancel' ), cancel: true }
        ]
    } );
}

// ---------------------------------------------------------------- custom tag

function selectedCustomTag( ctx ) {
    const found = selectedAncestor( ctx.editor, ( n ) => /custom/i.test( n.type.name ) );
    if ( found ) {
        found.el = dialect( ctx, found.node );
        return found;
    }
    // inline custom tags may be marks
    const marks = ctx.editor.state.selection.$from.marks().filter( ( m ) => /custom/i.test( m.type.name ) );
    if ( marks.length )
        return { mark: marks[0], el: dialect( ctx, marks[0] ) };
    return null;
}

function customTagName( el ) {
    if ( !el )
        return '';
    return cleanClass( el.getAttribute( 'class' ) ).split( ' ' )[0] || '';
}

function customTagDialog( ctx ) {
    const { editor, t, options } = ctx;
    const tags = options.customTags || [];
    const existing = selectedCustomTag( ctx );
    const currentName = existing ? customTagName( existing.el ) : '';
    const stored = existing && existing.el ? parseCustomAttributes( existing.el.getAttribute( 'customattributes' ) ) : {};
    const nameSelect = select( tags.map( ( d ) => [ d.name, d.title || d.name ] ), currentName || ( tags[0] && tags[0].name ) );
    nameSelect.disabled = !!existing;
    const attrBox = h( 'div', { class: 'exp-oe-custom-attributes' } );
    let custom = null;
    const renderAttributes = () => {
        clear( attrBox );
        const def = tags.find( ( d ) => d.name === nameSelect.value ) || { attributes: [] };
        custom = attributeFields( t, def.attributes, nameSelect.value === currentName ? stored : {} );
        custom.rows.forEach( ( r ) => attrBox.appendChild( r ) );
    };
    nameSelect.addEventListener( 'change', renderAttributes );
    renderAttributes();

    const styleMap = options.customAttributeStyleMap || {};
    openDialog( {
        title: t( 'Custom tag' ), width: 480, closeText: t( 'Close' ),
        body: [ field( t( 'Name' ), nameSelect ), attrBox ],
        buttons: [
            { text: t( 'OK' ), primary: true, onClick: () => {
                const def = tags.find( ( d ) => d.name === nameSelect.value );
                if ( !def )
                    return true;
                const values = custom.read();
                let style = '';
                for ( const [ k, v ] of Object.entries( values ) ) {
                    if ( v !== '' && styleMap[k] )
                        style += styleMap[k] + ': ' + v + ( /^\d+$/.test( v ) && /width|height|margin|padding|border-width|size/.test( styleMap[k] ) ? 'px' : '' ) + '; ';
                }
                const attrs = { 'class': 'ezoeItemCustomTag ' + def.name, type: 'custom', customattributes: serializeCustomAttributes( values ), style: style.trim() };
                if ( existing ) {
                    const tag = existing.el ? existing.el.tagName.toLowerCase() : 'span';
                    const elNew = makeElement( tag, attrs );
                    const type = existing.mark ? existing.mark.type : existing.node.type;
                    const newAttrs = attrsFromElement( type, elNew );
                    if ( !newAttrs )
                        return true;
                    if ( existing.mark )
                        return editor.chain().focus().extendMarkRange( type.name ).setMark( type.name, newAttrs ).run();
                    return editor.chain().focus().command( ( { tr } ) => {
                        tr.setNodeMarkup( existing.pos, undefined, Object.assign( {}, existing.node.attrs, newAttrs ) );
                        return true;
                    } ).run();
                }
                let html;
                if ( def.inline === 'image' ) {
                    html = makeElement( 'img', Object.assign( { src: def.icon, width: 22, height: 22 }, attrs ) ).outerHTML;
                } else if ( def.inline ) {
                    const text = selectedText( editor ) || ' ';
                    html = makeElement( def.name === 'underline' ? 'u' : 'span', attrs, escapeHtml( text ) ).outerHTML;
                } else {
                    const inner = selectedHTML( editor ) || '<p>' + escapeHtml( def.name ) + '</p>';
                    html = makeElement( 'div', attrs, inner ).outerHTML;
                }
                return insertDialectHTML( ctx, html );
            } },
            { text: t( 'Cancel' ), cancel: true }
        ]
    } );
}

// ---------------------------------------------------------------- table

function tableDialog( ctx ) {
    const { editor, t, options } = ctx;
    const defs = options.tableDefinitions || {};
    const tdef = defs.table || {};
    const defaults = tdef.defaults || {};
    const existing = selectedAncestor( editor, ( n ) => n.type.spec.tableRole === 'table' );
    const el = existing ? dialect( ctx, existing.node ) : null;
    const get = ( a, d ) => ( el ? el.getAttribute( a ) || '' : ( d || '' ) );
    const rows = h( 'input', { type: 'number', min: 1, max: 100, value: 2 } );
    const cols = h( 'input', { type: 'number', min: 1, max: 30, value: 2 } );
    const header = h( 'input', { type: 'checkbox', checked: false } );
    const width = h( 'input', { type: 'text', value: get( 'width', defaults.width || '100%' ) } );
    const border = h( 'input', { type: 'text', value: get( 'border', defaults.border !== undefined ? String( defaults.border ) : '0' ) } );
    const cls = select( classOptions( t, tdef.classes ), cleanClass( get( 'class', defaults['class'] ) ) );
    const custom = attributeFields( t, tdef.attributes, parseCustomAttributes( get( 'customattributes' ) ) );
    const body = existing ? [] : [ field( t( 'Rows' ), rows ), field( t( 'Columns' ), cols ), field( t( 'Header row' ), header ) ];
    openDialog( {
        title: t( existing ? 'Table properties' : 'Insert table' ), width: 420, closeText: t( 'Close' ),
        body: body.concat( [ field( t( 'Width' ), width, t( 'Percentage with %, or a number for pixels' ) ), field( t( 'Border' ), border ), field( t( 'Class' ), cls ) ], custom.rows ),
        buttons: [
            { text: t( 'OK' ), primary: true, onClick: () => {
                const attrs = { width: width.value.trim(), border: border.value.trim(), 'class': cls.value, customattributes: serializeCustomAttributes( custom.read() ) };
                if ( existing ) {
                    const newAttrs = attrsFromElement( existing.node.type, makeElement( 'table', attrs ) );
                    return editor.chain().focus().command( ( { tr } ) => {
                        tr.setNodeMarkup( existing.pos, undefined, Object.assign( {}, existing.node.attrs, newAttrs || {} ) );
                        return true;
                    } ).run();
                }
                const r = Math.max( 1, Math.min( 100, parseInt( rows.value, 10 ) || 1 ) ), c = Math.max( 1, Math.min( 30, parseInt( cols.value, 10 ) || 1 ) );
                let inner = '';
                for ( let i = 0; i < r; i++ ) {
                    const cell = header.checked && i === 0 ? 'th' : 'td';
                    inner += '<tr>' + ( '<' + cell + '><p><br></p></' + cell + '>' ).repeat( c ) + '</tr>';
                }
                return insertDialectHTML( ctx, makeElement( 'table', attrs, '<tbody>' + inner + '</tbody>' ).outerHTML );
            } },
            { text: t( 'Cancel' ), cancel: true }
        ]
    } );
}

function cellPropertiesDialog( ctx ) {
    const { editor, t, options } = ctx;
    const existing = selectedAncestor( editor, ( n ) => n.type.spec.tableRole === 'cell' || n.type.spec.tableRole === 'header_cell' );
    if ( !existing )
        return;
    const el = dialect( ctx, existing.node );
    const tag = el ? el.tagName.toLowerCase() : 'td';
    const def = ( options.tableDefinitions || {} )[tag] || {};
    const get = ( a ) => ( el ? el.getAttribute( a ) || '' : '' );
    const width = h( 'input', { type: 'text', value: get( 'width' ) } );
    const align = select( [ [ '', t( '-- Not set --' ) ], [ 'left', t( 'Left' ) ], [ 'center', t( 'Center' ) ], [ 'right', t( 'Right' ) ], [ 'justify', t( 'Justify' ) ] ], get( 'align' ) );
    const cls = select( classOptions( t, def.classes ), cleanClass( get( 'class' ) ) );
    const custom = attributeFields( t, def.attributes, parseCustomAttributes( get( 'customattributes' ) ) );
    openDialog( {
        title: t( 'Table cell properties' ), width: 420, closeText: t( 'Close' ),
        body: [ field( t( 'Width' ), width ), field( t( 'Alignment' ), align ), field( t( 'Class' ), cls ) ].concat( custom.rows ),
        buttons: [
            { text: t( 'OK' ), primary: true, onClick: () => {
                const cell = makeElement( tag, {
                    width: width.value.trim(), align: align.value, 'class': cls.value, customattributes: serializeCustomAttributes( custom.read() ),
                    colspan: get( 'colspan' ), rowspan: get( 'rowspan' )
                } );
                const newAttrs = attrsFromElement( existing.node.type, cell ) || {};
                return editor.chain().focus().command( ( { tr } ) => {
                    tr.setNodeMarkup( existing.pos, undefined, Object.assign( {}, existing.node.attrs, newAttrs ) );
                    return true;
                } ).run();
            } },
            { text: t( 'Cancel' ), cancel: true }
        ]
    } );
}

// ---------------------------------------------------------------- special characters and help

const CHARS = '  & © ® ™ ° ± × ÷ µ ¶ § … – — ‘ ’ ‚ “ ” „ ‹ › « » • · † ‡ ‰ ′ ″ € £ ¥ ¢ ¤ ¼ ½ ¾ ¹ ² ³ ª º ¿ ¡ ← ↑ → ↓ ↔ ⇒ ⇔ ∀ ∂ ∃ ∅ ∇ ∈ ∉ ∏ ∑ − √ ∝ ∞ ∧ ∨ ∩ ∪ ∫ ≈ ≠ ≡ ≤ ≥ α β γ δ ε λ μ π σ ω Δ Σ Ω Ä Ö Ü ä ö ü ß À Á Â Ç È É Ê à á â ç è é ê ñ Ñ ø Ø å Å æ Æ œ Œ'.split( ' ' );

function charmapDialog( ctx ) {
    const { editor, t } = ctx;
    let dialog = null;
    const grid = h( 'div', { class: 'exp-oe-charmap', role: 'grid' }, CHARS.map( ( c ) => h( 'button', {
        type: 'button', class: 'exp-oe-char', title: c === ' ' ? t( 'Non-breaking space' ) : 'U+' + c.charCodeAt( 0 ).toString( 16 ).toUpperCase().padStart( 4, '0' ),
        text: c === ' ' ? '␣' : c,
        onclick: () => {
            editor.chain().focus().insertContent( c === '&' ? '&amp;' : c ).run();
            if ( dialog )
                dialog.close();
        }
    } ) ) );
    dialog = openDialog( { title: t( 'Insert special character' ), width: 460, closeText: t( 'Close' ), body: [ grid ], buttons: [ { text: t( 'Close' ), cancel: true } ] } );
}

export const SHORTCUTS = [
    [ 'Ctrl+B', 'Bold' ], [ 'Ctrl+I', 'Italic' ], [ 'Ctrl+U', 'Underline' ], [ 'Ctrl+Z', 'Undo' ], [ 'Ctrl+Y / Ctrl+Shift+Z', 'Redo' ],
    [ 'Ctrl+1 ... Ctrl+6', 'Heading 1 to 6' ], [ 'Ctrl+7', 'Paragraph' ], [ 'Ctrl+8, Ctrl+9', 'Literal text' ], [ 'Ctrl+K', 'Insert/edit link' ],
    [ 'Ctrl+S', 'Store draft' ], [ 'Shift+Enter', 'Line break' ], [ 'Tab / Shift+Tab', 'Indent / outdent list item, next / previous table cell' ],
    [ 'Alt+0', 'Help' ], [ 'Alt+F10', 'Move to the toolbar' ]
];

function helpDialog( ctx ) {
    const { t } = ctx;
    const table = h( 'table', { class: 'exp-oe-shortcuts' }, h( 'tbody', {}, SHORTCUTS.map( ( [ k, d ] ) => h( 'tr', {}, [ h( 'th', { text: k } ), h( 'td', { text: t( d ) } ) ] ) ) ) );
    openDialog( {
        title: t( 'Help' ), width: 460, closeText: t( 'Close' ),
        body: [ h( 'p', { text: t( 'Online editor based on Tiptap. Keyboard shortcuts:' ) } ), table ],
        buttons: [ { text: t( 'Close' ), primary: true } ]
    } );
}

export function createDialogs() {
    return {
        link: linkDialog,
        anchor: anchorDialog,
        embed: embedDialog,
        customTag: customTagDialog,
        table: tableDialog,
        cellProperties: cellPropertiesDialog,
        charmap: charmapDialog,
        help: helpDialog
    };
}

export { nodeForTag, markForTag };
