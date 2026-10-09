/**
 * Schema agnostic lookups: the toolbar finds node and mark types by the HTML tag they parse, so it
 * works with whatever names the ezoe dialect schema (Agent B) gives its nodes and marks.
 */

const ruleTag = ( rule ) => String( rule.tag || '' ).split( /[\[.#\s]/ )[0].toLowerCase();

function ruleAttrs( rule, tag ) {
    if ( rule.attrs )
        return rule.attrs;
    if ( typeof rule.getAttrs === 'function' && typeof document !== 'undefined' ) {
        try {
            const attrs = rule.getAttrs( document.createElement( tag ) );
            return attrs && typeof attrs === 'object' ? attrs : {};
        } catch ( e ) {
            return {};
        }
    }
    return {};
}

function find( types, tag, accept ) {
    tag = tag.toLowerCase();
    for ( const name of Object.keys( types ) ) {
        const type = types[name], rules = ( type.spec && type.spec.parseDOM ) || [];
        for ( const rule of rules ) {
            if ( rule.tag && ruleTag( rule ) === tag && ( !accept || accept( rule, type ) ) )
                return { name, type, attrs: ruleAttrs( rule, tag ) };
        }
    }
    return null;
}

/** { name, type, attrs } of the node type that parses <tag>, or null */
export function nodeForTag( editor, tag, accept ) {
    return find( editor.schema.nodes, tag, accept );
}

/** { name, type, attrs } of the mark type that parses <tag>, or null */
export function markForTag( editor, tag, accept ) {
    return find( editor.schema.marks, tag, accept );
}

/** The link mark: parses a[href], never the anchor (a[name]) */
export function linkMark( editor ) {
    if ( editor.schema.marks.link )
        return { name: 'link', type: editor.schema.marks.link, attrs: {} };
    return markForTag( editor, 'a', ( rule ) => !/name/.test( rule.tag || '' ) );
}

/** True when the schema has a command of that name (registered by any extension) */
export function hasCommand( editor, name ) {
    return typeof editor.commands[name] === 'function';
}

/** Only the attributes the type declares, so an unknown attribute never breaks a command */
export function knownAttrs( type, attrs ) {
    const declared = ( type && type.spec && type.spec.attrs ) || {}, result = {};
    for ( const key of Object.keys( attrs || {} ) ) {
        if ( Object.prototype.hasOwnProperty.call( declared, key ) )
            result[key] = attrs[key];
    }
    return result;
}

/** The nearest ancestor node of the selection (including the node selection itself) matching test */
export function selectedAncestor( editor, test ) {
    const { selection } = editor.state;
    if ( selection.node && test( selection.node ) )
        return { node: selection.node, pos: selection.from, depth: null };
    const $from = selection.$from;
    for ( let d = $from.depth; d > 0; d-- ) {
        const node = $from.node( d );
        if ( test( node ) )
            return { node, pos: $from.before( d ), depth: d };
    }
    return null;
}

/** The textblock the cursor is in */
export function currentBlock( editor ) {
    return editor.state.selection.$from.parent;
}

export function escapeHtml( value ) {
    return String( value === undefined || value === null ? '' : value )
        .replace( /&/g, '&amp;' ).replace( /"/g, '&quot;' ).replace( /</g, '&lt;' ).replace( />/g, '&gt;' );
}

/**
 * The attributes the schema gives an element of the ezoe dialect: runs the parse rules of the type
 * (the same code that parses the textarea), so the dialogs never need to know the attribute names
 * the schema uses. Returns null when no rule of the type accepts the element.
 */
export function attrsFromElement( type, el ) {
    const rules = ( type.spec && type.spec.parseDOM ) || [];
    for ( const rule of rules ) {
        if ( !rule.tag )
            continue;
        let matches = false;
        try {
            matches = el.matches( rule.tag );
        } catch ( e ) {
            matches = false;
        }
        if ( !matches )
            continue;
        if ( typeof rule.getAttrs === 'function' ) {
            const attrs = rule.getAttrs( el );
            if ( attrs === false )
                continue;
            return Object.assign( {}, rule.attrs || {}, attrs || {} );
        }
        return Object.assign( {}, rule.attrs || {} );
    }
    return null;
}

/**
 * The ezoe dialect element of a node or mark, as it would be posted: rendered by the schema
 * (DOMSerializer) and cleaned up like the posted HTML (cleanup). null when that gives no element.
 */
export function dialectElement( editor, nodeOrMark, cleanup, DOMSerializer ) {
    const serializer = DOMSerializer.fromSchema( editor.schema );
    let dom;
    if ( nodeOrMark.isText === undefined && nodeOrMark.type && editor.schema.marks[nodeOrMark.type.name] === nodeOrMark.type ) {
        const out = serializer.serializeMark( nodeOrMark, true );
        dom = out && ( out.dom || out );
    } else {
        dom = serializer.serializeNode( nodeOrMark );
    }
    if ( !dom )
        return null;
    const holder = document.createElement( 'div' );
    holder.appendChild( dom );
    if ( cleanup )
        cleanup( holder );
    return holder.firstElementChild;
}

/** Element of the ezoe dialect from a tag name and attributes (empty values left out) */
export function makeElement( tag, attrs, innerHTML ) {
    const el = document.createElement( tag );
    for ( const [ k, v ] of Object.entries( attrs || {} ) ) {
        if ( v !== null && v !== undefined && v !== '' )
            el.setAttribute( k, String( v ) );
    }
    if ( innerHTML )
        el.innerHTML = innerHTML;
    return el;
}
