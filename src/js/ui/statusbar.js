/**
 * Status bar like ezoe's: "Path: paragraph » strong" with the ezxml tag names (and the friendly
 * names of ezoe.ini [EditorSettings] XmlTagNameAlias), a click on a path item selects it, and the
 * resize handle at the right that changes the editor height.
 */
import { h, clear } from './dom.js';
import { NodeSelection, TextSelection } from '@tiptap/pm/state';

const TAG_TO_XML = {
    p: 'paragraph', i: 'emphasize', em: 'emphasize', b: 'strong', strong: 'strong', pre: 'literal',
    u: 'custom', sub: 'custom', sup: 'custom', h1: 'header', h2: 'header', h3: 'header', h4: 'header',
    h5: 'header', h6: 'header', table: 'table', th: 'th', td: 'td', tr: 'tr', ul: 'ul', ol: 'ol', li: 'li',
    a: 'link'
};

function firstTag( type ) {
    const rules = ( type.spec && type.spec.parseDOM ) || [];
    for ( const rule of rules ) {
        if ( rule.tag )
            return String( rule.tag ).split( /[\[.#\s]/ )[0].toLowerCase();
    }
    return '';
}

/** ezxml tag name of a node or mark */
export function xmlName( item ) {
    const type = item.type, name = type.name.toLowerCase(), attrs = item.attrs || {};
    if ( /embed/.test( name ) )
        return /inline/.test( name ) || ( type.isInline && type.isInline ) || attrs.inline === 'true' || attrs.inline === true ? 'embed-inline' : 'embed';
    if ( /custom/.test( name ) )
        return 'custom';
    if ( /anchor/.test( name ) )
        return 'anchor';
    if ( /literal/.test( name ) )
        return 'literal';
    const tag = firstTag( type );
    if ( tag === 'a' && attrs && !attrs.href && attrs.name )
        return 'anchor';
    return TAG_TO_XML[tag] || tag || name;
}

export class StatusBar {
    constructor( ctx ) {
        this.ctx = ctx;
        this.path = h( 'span', { class: 'exp-oe-path', 'aria-live': 'off' } );
        this.info = h( 'span', { class: 'exp-oe-info' } );
        this.resize = h( 'span', { class: 'exp-oe-resize', title: ctx.t( 'Drag to resize' ), 'aria-hidden': 'true' } );
        this.element = h( 'div', { class: 'exp-oe-statusbar' }, [
            h( 'span', { class: 'exp-oe-path-label', text: ctx.t( 'Path' ) + ': ' } ), this.path, this.resize, this.info
        ] );
        this.resize.addEventListener( 'mousedown', ( e ) => this.startResize( e ) );
    }

    update() {
        const { editor, options } = this.ctx, alias = options.xmlTagAlias || {};
        const $from = editor.state.selection.$from, items = [];
        for ( let d = 1; d <= $from.depth; d++ ) {
            const node = $from.node( d );
            items.push( { node, pos: $from.before( d ) } );
        }
        if ( editor.state.selection instanceof NodeSelection )
            items.push( { node: editor.state.selection.node, pos: editor.state.selection.from } );
        const sel = editor.state.selection;
        const marks = sel.empty ? ( editor.state.storedMarks || $from.marks() ) : ( $from.marksAcross( sel.$to ) || [] );
        for ( const mark of marks )
            items.push( { mark } );

        clear( this.path );
        items.forEach( ( item, i ) => {
            const thing = item.node || item.mark, xml = xmlName( thing );
            let label = alias[xml] !== undefined ? alias[xml] : xml;
            const attrs = thing.attrs || {};
            if ( xml === 'custom' && attrs.name )
                label += ' ' + attrs.name;
            if ( attrs.class )
                label += '.' + String( attrs.class ).split( /\s+/ ).filter( ( c ) => c && !/^ezoeItem|^mceItem/.test( c ) ).join( '.' );
            label = label.replace( /\.$/, '' );
            const link = h( 'a', {
                href: '#', class: 'exp-oe-path-item', text: label,
                title: attrs.href ? 'href: ' + attrs.href : ( attrs.title ? attrs.title : '' ),
                onmousedown: ( e ) => e.preventDefault(),
                onclick: ( e ) => {
                    e.preventDefault();
                    this.select( item );
                }
            } );
            if ( i )
                this.path.appendChild( document.createTextNode( ' » ' ) );
            this.path.appendChild( link );
        } );
        if ( !items.length )
            this.path.appendChild( document.createTextNode( ' ' ) );
        this.info.textContent = this.ctx.instance.statusInfo ? this.ctx.instance.statusInfo() : '';
    }

    select( item ) {
        const { editor } = this.ctx;
        if ( item.mark ) {
            editor.chain().focus().extendMarkRange( item.mark.type.name ).run();
            return;
        }
        const { node, pos } = item;
        const tr = editor.state.tr;
        if ( node.isTextblock && node.content.size )
            tr.setSelection( TextSelection.create( tr.doc, pos + 1, pos + 1 + node.content.size ) );
        else
            tr.setSelection( NodeSelection.create( tr.doc, pos ) );
        editor.view.dispatch( tr );
        editor.view.focus();
    }

    startResize( e ) {
        e.preventDefault();
        const area = this.ctx.instance.contentArea, startY = e.clientY, startH = area.offsetHeight;
        const move = ( ev ) => {
            area.style.height = Math.max( 100, startH + ev.clientY - startY ) + 'px';
        };
        const up = () => {
            document.removeEventListener( 'mousemove', move );
            document.removeEventListener( 'mouseup', up );
        };
        document.addEventListener( 'mousemove', move );
        document.addEventListener( 'mouseup', up );
    }
}
