/**
 * Structure-keeping AI input and output.
 *
 * The AI assistant must change wording only. Everything that is not text (embeds, inline embeds, images, custom
 * tags, anchors, tables, literals) has to come back untouched and in place, and formatting, links and the block
 * structure must survive. So the editor does not send plain text but a small markup:
 *
 *   blocks   <p>  <h1>..<h6>  <ul> <ol> <li>
 *   inline   <b> <i> <u> <sub> <sup> <br>  <a href="L1">  (L1 is a reference, never the URL)
 *   keys     k="B1" / k="M1" on an element whose original carries attributes (class, align, custom attributes ...)
 *   tokens   ⟦E1⟧ embed or image, ⟦A1⟧ anchor, ⟦C1⟧ custom tag (block, inline, image), ⟦T1⟧ table,
 *            ⟦P1⟧ literal, ⟦X1⟧ anything else
 *
 * The original nodes behind tokens, links and keys stay in a map in the browser. Node attributes, object and node
 * ids, URLs, image sources and custom attributes are never part of the markup, so they never reach the provider.
 *
 * The answer is parsed with a small tolerant parser (no DOM, nothing is ever inserted as HTML), checked against the
 * map (every token exactly once, every link kept, nothing invented, only whitelisted tags) and rebuilt into
 * ProseMirror nodes: tokens become the original nodes, link references the original link marks, keys the original
 * attributes, text becomes text nodes with marks.
 *
 * @license GPL-2.0-or-later
 */
import { Fragment, Slice } from '@tiptap/pm/model';

export const TOKEN_OPEN = '⟦';
export const TOKEN_CLOSE = '⟧';
const TOKEN_SOURCE = TOKEN_OPEN + '([A-Z])(\\d{1,4})' + TOKEN_CLOSE;
export const TOKEN_RE = new RegExp( TOKEN_SOURCE, 'g' );

const STRUCTURE_NODES = { doc: true, paragraph: true, heading: true, bulletList: true, orderedList: true, listItem: true, text: true, hardBreak: true };
const PLAIN_UNDERLINE = { tag: 'u', class: 'ezoeItemCustomTag underline', type: 'custom' };
/** markup tag of a mark, in the nesting order of the output (link outermost) */
const MARK_TAGS = [ [ 'link', 'a' ], [ 'bold', 'b' ], [ 'italic', 'i' ], [ 'ezCustomInline', 'u' ], [ 'subscript', 'sub' ], [ 'superscript', 'sup' ] ];
const MARK_ORDER = MARK_TAGS.map( ( m ) => m[0] );
const TAG_MARK = { a: 'link', b: 'bold', strong: 'bold', i: 'italic', em: 'italic', u: 'ezCustomInline', sub: 'subscript', sup: 'superscript' };
const BLOCK_TAGS = { p: true, h1: true, h2: true, h3: true, h4: true, h5: true, h6: true, ul: true, ol: true, li: true };
const TEXTBLOCK_TAGS = { p: true, h1: true, h2: true, h3: true, h4: true, h5: true, h6: true };
const VOID_TAGS = { br: true };

// ------------------------------------------------------------------ helpers

function escapeText( s ) {
    return s.replace( /&/g, '&amp;' ).replace( /</g, '&lt;' ).replace( />/g, '&gt;' )
        .replace( /⟦/g, '&#10214;' ).replace( /⟧/g, '&#10215;' );
}

const NAMED_ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

export function decodeEntities( s ) {
    return s.replace( /&(#x[0-9a-f]{1,6}|#\d{1,7}|[a-z]{2,6});/gi, ( all, e ) => {
        if ( e[0] === '#' ) {
            const code = e[1] === 'x' || e[1] === 'X' ? parseInt( e.slice( 2 ), 16 ) : parseInt( e.slice( 1 ), 10 );
            return code > 0 && code <= 0x10ffff ? String.fromCodePoint( code ) : all;
        }
        const v = NAMED_ENTITIES[e.toLowerCase()];
        return v === undefined ? all : v;
    } );
}

/** true when every attribute of attrs equals the default of the type (names in skip are ignored) */
function hasDefaultAttrs( type, attrs, skip ) {
    for ( const name of Object.keys( type.attrs || {} ) ) {
        if ( skip && skip.indexOf( name ) !== -1 )
            continue;
        const spec = type.attrs[name];
        const def = spec && spec.hasDefault !== false ? spec.default : undefined;
        if ( JSON.stringify( attrs[name] === undefined ? null : attrs[name] ) !== JSON.stringify( def === undefined ? null : def ) )
            return false;
    }
    return true;
}

function isPlainUnderline( mark ) {
    if ( mark.type.name !== 'ezCustomInline' )
        return false;
    for ( const name of Object.keys( mark.type.attrs ) ) {
        const want = Object.prototype.hasOwnProperty.call( PLAIN_UNDERLINE, name ) ? PLAIN_UNDERLINE[name] : mark.type.attrs[name].default;
        if ( JSON.stringify( mark.attrs[name] === undefined ? null : mark.attrs[name] ) !== JSON.stringify( want === undefined ? null : want ) )
            return false;
    }
    return true;
}

/** a mark the markup can express (otherwise the text carrying it becomes part of a custom tag token) */
function isSimpleMark( mark ) {
    const n = mark.type.name;
    if ( n === 'ezCustomInline' )
        return isPlainUnderline( mark );
    return MARK_ORDER.indexOf( n ) !== -1;
}

function tokenLetter( node ) {
    const n = node.type.name;
    if ( /^ezEmbed/.test( n ) )
        return 'E';
    if ( n === 'ezAnchor' )
        return 'A';
    if ( /^ezCustom/.test( n ) )
        return 'C';
    if ( node.type.spec.tableRole === 'table' || n === 'table' )
        return 'T';
    if ( n === 'literal' || node.type.spec.code )
        return 'P';
    return 'X';
}

function customName( attrs ) {
    const m = /(?:^|\s)ezoeItemCustomTag\s+([\w-]+)/.exec( ( attrs && attrs.class ) || '' );
    return m ? m[1] : '';
}

/** a short, local label for a chip in the preview (never sent anywhere) */
function tokenLabel( letter, node, run ) {
    if ( run ) {
        for ( const m of run[0].marks ) {
            if ( m.type.name === 'ezCustomInline' && !isPlainUnderline( m ) )
                return 'Custom tag' + ( customName( m.attrs ) ? ': ' + customName( m.attrs ) : '' );
        }
        return 'Custom tag';
    }
    const n = node.type.name;
    switch ( letter ) {
        case 'E': return n === 'ezEmbedImage' ? 'Image' : ( n === 'ezEmbedInline' ? 'Inline object' : 'Object' );
        case 'A': return 'Anchor';
        case 'C': return 'Custom tag' + ( customName( node.attrs ) ? ': ' + customName( node.attrs ) : '' );
        case 'T': return 'Table';
        case 'P': return 'Literal';
        default: return n;
    }
}

// ------------------------------------------------------------------ serialize

/**
 * The map of one serialization: what stands behind each token, link reference and key.
 */
export class StructureMap {
    constructor() {
        this.tokens = new Map();   // 'E1' -> { key, kind: 'block'|'inline', content: Node|Fragment, label }
        this.links = new Map();    // 'L1' -> link mark
        this.marks = new Map();    // 'M1' -> mark with attributes
        this.blocks = new Map();   // 'B1' -> { type, attrs }
        this.counters = {};
    }

    next( letter ) {
        this.counters[letter] = ( this.counters[letter] || 0 ) + 1;
        return letter + this.counters[letter];
    }

    addToken( letter, kind, content, label ) {
        const key = this.next( letter );
        this.tokens.set( key, { key, kind, content, label } );
        return TOKEN_OPEN + key + TOKEN_CLOSE;
    }

    linkKey( mark ) {
        for ( const [ key, m ] of this.links ) {
            if ( m.eq( mark ) )
                return key;
        }
        const key = this.next( 'L' );
        this.links.set( key, mark );
        return key;
    }

    markKey( mark ) {
        for ( const [ key, m ] of this.marks ) {
            if ( m.eq( mark ) )
                return key;
        }
        const key = this.next( 'M' );
        this.marks.set( key, mark );
        return key;
    }

    blockKey( node ) {
        const key = this.next( 'B' );
        this.blocks.set( key, { type: node.type.name, attrs: node.attrs } );
        return key;
    }
}

function openTag( mark, map ) {
    const n = mark.type.name;
    if ( n === 'link' )
        return '<a href="' + map.linkKey( mark ) + '">';
    const tag = MARK_TAGS.find( ( m ) => m[0] === n )[1];
    const plain = n === 'ezCustomInline' ? isPlainUnderline( mark ) && mark.attrs.customattributes == null : hasDefaultAttrs( mark.type, mark.attrs );
    return '<' + tag + ( plain ? '' : ' k="' + map.markKey( mark ) + '"' ) + '>';
}

function closeTag( mark ) {
    return '</' + MARK_TAGS.find( ( m ) => m[0] === mark.type.name )[1] + '>';
}

function sortedSimpleMarks( marks ) {
    return marks.filter( isSimpleMark ).sort( ( a, b ) => MARK_ORDER.indexOf( a.type.name ) - MARK_ORDER.indexOf( b.type.name ) );
}

/**
 * Inline content -> markup. Atoms become tokens, a run of text under a custom inline tag becomes one token that
 * keeps the run (text and marks) as it is.
 *
 * @param {Fragment} content
 * @param {StructureMap} map
 * @param {boolean} code the parent is a literal: line feeds are written as <br>
 */
export function serializeInline( content, map, code ) {
    const items = [];
    let run = null;
    content.forEach( ( node ) => {
        const custom = node.marks.some( ( m ) => !isSimpleMark( m ) );
        if ( custom ) {
            if ( !run ) {
                run = [];
                items.push( { run } );
            }
            run.push( node );
            return;
        }
        run = null;
        items.push( { node } );
    } );
    let out = '';
    let open = [];
    const reopen = ( marks ) => {
        let i = 0;
        while ( i < open.length && i < marks.length && open[i].eq( marks[i] ) )
            i++;
        for ( let j = open.length - 1; j >= i; j-- )
            out += closeTag( open[j] );
        open = open.slice( 0, i );
        for ( let j = i; j < marks.length; j++ ) {
            out += openTag( marks[j], map );
            open.push( marks[j] );
        }
    };
    for ( const item of items ) {
        if ( item.run ) {
            reopen( sortedSimpleMarks( item.run[0].marks ) );
            out += map.addToken( 'C', 'inline', Fragment.fromArray( item.run ), tokenLabel( 'C', null, item.run ) );
            continue;
        }
        const node = item.node;
        reopen( sortedSimpleMarks( node.marks ) );
        if ( node.isText ) {
            const text = escapeText( node.text );
            // a line feed in the text is written as an entity: line feeds of the markup itself are layout
            out += text.replace( /\n/g, code ? '<br>' : '&#10;' );
        } else if ( node.type.name === 'hardBreak' ) {
            out += '<br>';
        } else {
            const letter = tokenLetter( node );
            out += map.addToken( letter, 'inline', node, tokenLabel( letter, node ) );
        }
    }
    reopen( [] );
    return out;
}

function blockOpen( node, tag, map, skip ) {
    return '<' + tag + ( hasDefaultAttrs( node.type, node.attrs, skip ) ? '' : ' k="' + map.blockKey( node ) + '"' ) + '>';
}

/**
 * Block content -> markup, one block per line.
 *
 * @param {Fragment} content
 * @param {StructureMap} map
 */
export function serializeBlocks( content, map ) {
    const lines = [];
    content.forEach( ( node ) => {
        lines.push( serializeBlock( node, map ) );
    } );
    return lines.join( '\n' );
}

function serializeBlock( node, map ) {
    const n = node.type.name;
    if ( n === 'paragraph' )
        return blockOpen( node, 'p', map ) + serializeInline( node.content, map, false ) + '</p>';
    if ( n === 'heading' ) {
        const level = Math.min( 6, Math.max( 1, node.attrs.level || 1 ) );
        return blockOpen( node, 'h' + level, map, [ 'level' ] ) + serializeInline( node.content, map, false ) + '</h' + level + '>';
    }
    if ( n === 'bulletList' || n === 'orderedList' ) {
        const tag = n === 'bulletList' ? 'ul' : 'ol';
        const items = [];
        node.forEach( ( li ) => items.push( serializeBlock( li, map ) ) );
        return blockOpen( node, tag, map ) + '\n' + items.join( '\n' ) + '\n</' + tag + '>';
    }
    if ( n === 'listItem' ) {
        const only = node.childCount === 1 ? node.firstChild : null;
        if ( only && only.type.name === 'paragraph' && hasDefaultAttrs( only.type, only.attrs ) )
            return blockOpen( node, 'li', map ) + serializeInline( only.content, map, false ) + '</li>';
        return blockOpen( node, 'li', map ) + serializeBlocks( node.content, map ).replace( /\n/g, '' ) + '</li>';
    }
    const letter = tokenLetter( node );
    return map.addToken( letter, 'block', node, tokenLabel( letter, node ) );
}

/**
 * What a command works on, as markup.
 *
 * @param {Object} what { mode: 'inline', parent (textblock node), content (Fragment) } or { mode: 'blocks', content (Fragment) }
 * @return {{ markup: string, map: StructureMap }}
 */
export function serialize( what ) {
    const map = new StructureMap();
    const markup = what.mode === 'inline'
        ? serializeInline( what.content, map, !!( what.parent && what.parent.type.spec.code ) )
        : serializeBlocks( what.content, map );
    return { markup, map };
}

// ------------------------------------------------------------------ parse

/**
 * Tolerant parser of the answer: elements, text and tokens. Unknown tags are dropped (their content kept) and
 * reported, unbalanced tags are closed where it makes sense, a stray "<" is text.
 *
 * @return {{ root: Object, badTags: string[] }}
 */
export function parseMarkup( markup ) {
    const root = { type: 'el', tag: '#root', attrs: {}, children: [] };
    const stack = [ root ];
    const badTags = [];
    const top = () => stack[stack.length - 1];
    const re = /<!--[\s\S]*?-->|<\/?([a-zA-Z][a-zA-Z0-9]*)((?:\s+[a-zA-Z_:][-a-zA-Z0-9_:]*(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'>]+))?)*)\s*\/?>/g;
    const pushText = ( text ) => {
        if ( !text )
            return;
        const parts = text.split( new RegExp( '(' + TOKEN_SOURCE + ')' ) );
        // split with groups yields [text, whole, letter, number, text, ...]
        for ( let i = 0; i < parts.length; i += 4 ) {
            if ( parts[i] )
                top().children.push( { type: 'text', text: decodeEntities( parts[i] ) } );
            if ( i + 1 < parts.length )
                top().children.push( { type: 'token', key: parts[i + 2] + parts[i + 3] } );
        }
    };
    const closeTo = ( pred ) => {
        for ( let i = stack.length - 1; i > 0; i-- ) {
            if ( pred( stack[i] ) ) {
                stack.length = i;
                return true;
            }
        }
        return false;
    };
    let last = 0, m;
    while ( ( m = re.exec( markup ) ) ) {
        pushText( markup.slice( last, m.index ) );
        last = re.lastIndex;
        if ( !m[1] )
            continue; // comment
        const tag = m[1].toLowerCase();
        const closing = m[0][1] === '/';
        if ( !BLOCK_TAGS[tag] && !TAG_MARK[tag] && !VOID_TAGS[tag] ) {
            if ( !closing )
                badTags.push( tag );
            continue;
        }
        if ( closing ) {
            if ( !VOID_TAGS[tag] )
                closeTo( ( el ) => el.tag === tag || ( TAG_MARK[tag] && TAG_MARK[el.tag] === TAG_MARK[tag] && tag !== 'a' && el.tag !== 'a' ) );
            continue;
        }
        const attrs = {};
        const ar = /([a-zA-Z_:][-a-zA-Z0-9_:]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
        let a;
        while ( ( a = ar.exec( m[2] || '' ) ) )
            attrs[a[1].toLowerCase()] = decodeEntities( a[2] !== undefined ? a[2] : ( a[3] !== undefined ? a[3] : ( a[4] || '' ) ) );
        if ( VOID_TAGS[tag] ) {
            top().children.push( { type: 'el', tag, attrs, children: [] } );
            continue;
        }
        if ( TEXTBLOCK_TAGS[tag] ) {
            // a block never sits inside a paragraph or heading: close it (as HTML does)
            closeTo( ( el ) => !!TEXTBLOCK_TAGS[el.tag] );
        } else if ( tag === 'li' ) {
            const li = stack.map( ( el ) => el.tag ).lastIndexOf( 'li' );
            const list = Math.max( stack.map( ( el ) => el.tag ).lastIndexOf( 'ul' ), stack.map( ( el ) => el.tag ).lastIndexOf( 'ol' ) );
            if ( li > list && li > 0 )
                stack.length = li;
        } else if ( tag === 'ul' || tag === 'ol' ) {
            closeTo( ( el ) => !!TEXTBLOCK_TAGS[el.tag] );
        }
        const el = { type: 'el', tag, attrs, children: [] };
        top().children.push( el );
        stack.push( el );
    }
    pushText( markup.slice( last ) );
    return { root, badTags };
}

// ------------------------------------------------------------------ validate

/**
 * Checks the answer against the map.
 *
 * @param {string} markup the answer
 * @param {StructureMap} map
 * @param {Object} [options] { allowDrop: tokens and links may be missing (summarise, continue) }
 * @return {{ ok, missing, duplicated, unknown, missingLinks, unknownLinks, badTags, problems }}
 */
export function validate( markup, map, options = {} ) {
    const { root, badTags } = parseMarkup( markup );
    const seen = new Map(), links = new Set(), unknownLinks = [];
    const walk = ( el ) => {
        for ( const c of el.children ) {
            if ( c.type === 'token' )
                seen.set( c.key, ( seen.get( c.key ) || 0 ) + 1 );
            else if ( c.type === 'el' ) {
                if ( c.tag === 'a' ) {
                    if ( map.links.has( c.attrs.href ) )
                        links.add( c.attrs.href );
                    else
                        unknownLinks.push( c.attrs.href || '' );
                }
                walk( c );
            }
        }
    };
    walk( root );
    const missing = [], duplicated = [], unknown = [];
    for ( const key of map.tokens.keys() ) {
        const n = seen.get( key ) || 0;
        if ( n === 0 )
            missing.push( key );
        else if ( n > 1 )
            duplicated.push( key );
    }
    for ( const key of seen.keys() ) {
        if ( !map.tokens.has( key ) )
            unknown.push( key );
    }
    const missingLinks = [ ...map.links.keys() ].filter( ( k ) => !links.has( k ) );
    const allowDrop = !!options.allowDrop;
    const problems = allowDrop ? 0 : missing.length + duplicated.length + unknown.length + missingLinks.length + unknownLinks.length;
    return {
        ok: allowDrop || ( problems === 0 && badTags.length === 0 ),
        missing, duplicated, unknown, missingLinks, unknownLinks, badTags, problems
    };
}

// ------------------------------------------------------------------ rebuild

/**
 * Answer markup -> ProseMirror content.
 *
 * @param {string} markup
 * @param {StructureMap} map
 * @param {Schema} schema
 * @param {Object} options
 *   mode     'blocks' (a Fragment of blocks) or 'inline' (a Fragment of inline nodes for options.parent)
 *   parent   the textblock (inline mode)
 *   tokens   true: tokens become the original nodes; false: tokens and links are left out (inserted text)
 *   repair   true: duplicated tokens are kept once, unknown ones dropped, missing ones appended at the end
 * @return {Fragment}
 */
export function rebuild( markup, map, schema, options = {} ) {
    const opts = Object.assign( { mode: 'blocks', tokens: true, repair: false }, options );
    let source = String( markup || '' ).replace( /\r\n?/g, '\n' ).trim();
    if ( opts.mode === 'blocks' && !/<\s*(p|h[1-6]|ul|ol|li)\b/i.test( source ) ) {
        // plain text answer: blank lines separate paragraphs, a line feed is a line break
        source = source.split( /\n{2,}/ ).map( ( p ) => '<p>' + p.trim().replace( /\n/g, '<br>' ) + '</p>' ).join( '\n' );
    }
    const { root } = parseMarkup( source );
    const b = new Builder( map, schema, opts );
    if ( opts.mode === 'inline' ) {
        let nodes = b.inlineOfAll( root );
        if ( opts.repair )
            nodes = nodes.concat( b.missingInline() );
        return Fragment.fromArray( b.finishInline( nodes, opts.parent ? opts.parent.type : schema.nodes.paragraph ) );
    }
    let blocks = b.blocks( root.children, 'root' );
    if ( opts.repair )
        blocks = b.appendMissing( blocks );
    return Fragment.fromArray( blocks );
}

class Builder {
    constructor( map, schema, opts ) {
        this.map = map;
        this.schema = schema;
        this.opts = opts;
        this.used = new Set();
    }

    /** the original content of a token, or null (unknown, already used in repair mode, or tokens off) */
    take( key ) {
        if ( !this.opts.tokens )
            return null;
        const t = this.map.tokens.get( key );
        if ( !t )
            return null;
        if ( this.used.has( key ) && this.opts.repair )
            return null;
        this.used.add( key );
        return t;
    }

    blockAttrs( el, typeName ) {
        const k = el.attrs.k;
        if ( k && this.map.blocks.has( k ) ) {
            const b = this.map.blocks.get( k );
            if ( b.type === typeName || ( TEXTBLOCK_TYPE[b.type] && TEXTBLOCK_TYPE[typeName] ) )
                return Object.assign( {}, b.attrs );
        }
        return {};
    }

    /** children of a block container -> block nodes */
    blocks( children, context ) {
        const out = [];
        let pending = [];
        const flush = () => {
            if ( pending.length ) {
                const holder = { type: 'el', tag: 'p', attrs: {}, children: pending };
                if ( pending.some( ( c ) => c.type !== 'text' || c.text.trim() !== '' ) )
                    out.push( ...this.textblock( holder ) );
            }
            pending = [];
        };
        for ( const c of children ) {
            if ( c.type === 'token' ) {
                const t = this.map.tokens.get( c.key );
                if ( t && t.kind === 'block' ) {
                    flush();
                    const got = this.take( c.key );
                    if ( got )
                        out.push( context === 'list' ? this.schema.nodes.listItem.create( null, got.content ) : got.content );
                    continue;
                }
                pending.push( c );
                continue;
            }
            if ( c.type === 'el' && ( TEXTBLOCK_TAGS[c.tag] || c.tag === 'ul' || c.tag === 'ol' || c.tag === 'li' ) ) {
                flush();
                if ( TEXTBLOCK_TAGS[c.tag] ) {
                    const made = this.textblock( c );
                    out.push( ...( context === 'list' ? made.map( ( n ) => this.listItemOf( [ n ] ) ) : made ) );
                } else if ( c.tag === 'li' ) {
                    const item = this.listItem( c );
                    if ( context === 'list' )
                        out.push( item );
                    else
                        out.push( ...item.content.content );
                } else {
                    const list = this.list( c );
                    if ( list )
                        out.push( context === 'list' ? this.listItemOf( [ list ] ) : list );
                }
                continue;
            }
            pending.push( c );
        }
        flush();
        if ( context === 'list' )
            return out.map( ( n ) => n.type.name === 'listItem' ? n : this.listItemOf( [ n ] ) );
        return out;
    }

    listItemOf( blocks ) {
        return this.schema.nodes.listItem.create( null, blocks );
    }

    list( el ) {
        const type = this.schema.nodes[el.tag === 'ol' ? 'orderedList' : 'bulletList'];
        if ( !type )
            return null;
        const items = this.blocks( el.children, 'list' );
        if ( !items.length )
            return null;
        return type.create( this.blockAttrs( el, type.name ), items );
    }

    listItem( el ) {
        let content = this.blocks( el.children, 'item' );
        if ( !content.length )
            content = [ this.schema.nodes.paragraph.create() ];
        return this.schema.nodes.listItem.create( this.blockAttrs( el, 'listItem' ), content );
    }

    /** <p> or <hN> -> one textblock, or several when a block token sits inside it */
    textblock( el ) {
        let type = this.schema.nodes.paragraph, attrs;
        const h = /^h([1-6])$/.exec( el.tag );
        if ( h && this.schema.nodes.heading ) {
            type = this.schema.nodes.heading;
            attrs = Object.assign( this.blockAttrs( el, 'heading' ), { level: parseInt( h[1], 10 ) } );
        } else {
            attrs = this.blockAttrs( el, 'paragraph' );
            delete attrs.level;
        }
        const segments = [ [] ];
        this.inline( el.children, [], segments );
        const out = [];
        let hadInline = false;
        for ( const seg of segments ) {
            if ( seg.block ) {
                out.push( seg.block );
                continue;
            }
            const nodes = this.finishInline( seg, type );
            if ( nodes.length || ( !hadInline && segments.length === 1 ) ) {
                out.push( type.create( attrs, nodes ) );
                hadInline = true;
            }
        }
        return out;
    }

    /** inline children -> segments (arrays of { text, marks } / nodes, separated by { block }) */
    inline( children, marks, segments ) {
        const cur = () => segments[segments.length - 1];
        for ( const c of children ) {
            if ( c.type === 'text' ) {
                cur().push( { text: c.text, marks } );
            } else if ( c.type === 'token' ) {
                const t = this.map.tokens.get( c.key );
                if ( t && t.kind === 'block' ) {
                    const got = this.take( c.key );
                    if ( got ) {
                        segments.push( { block: got.content } );
                        segments.push( [] );
                    }
                    continue;
                }
                const got = this.take( c.key );
                if ( !got )
                    continue;
                if ( got.content instanceof Fragment )
                    got.content.forEach( ( n ) => cur().push( { node: n } ) );
                else
                    cur().push( { node: got.content } );
            } else if ( c.tag === 'br' ) {
                cur().push( { br: true, marks } );
            } else if ( TAG_MARK[c.tag] ) {
                const mark = this.markFor( c );
                this.inline( c.children, mark ? mark.addToSet( marks ) : marks, segments );
            } else {
                // a block element inside inline content: its content, after a line break
                if ( cur().length )
                    cur().push( { br: true, marks: [] } );
                this.inline( c.children, marks, segments );
            }
        }
    }

    markFor( el ) {
        const name = TAG_MARK[el.tag];
        const type = this.schema.marks[name];
        if ( !type )
            return null;
        if ( name === 'link' ) {
            if ( !this.opts.tokens )
                return null;
            return this.map.links.get( el.attrs.href ) || null;
        }
        const k = el.attrs.k;
        if ( k && this.map.marks.has( k ) && this.map.marks.get( k ).type === type )
            return this.map.marks.get( k );
        return type.create( name === 'ezCustomInline' ? PLAIN_UNDERLINE : null );
    }

    /** pieces of a textblock -> inline nodes; layout white space (line feeds) at the edges is dropped */
    finishInline( pieces, parentType ) {
        const code = !!parentType.spec.code;
        const items = pieces.map( ( p ) => Object.assign( {}, p ) );
        const firstText = items.findIndex( ( p ) => p.text !== undefined );
        let lastText = -1;
        for ( let i = items.length - 1; i >= 0; i-- ) {
            if ( items[i].text !== undefined ) {
                lastText = i;
                break;
            }
        }
        items.forEach( ( p, i ) => {
            if ( p.text === undefined )
                return;
            let s = p.text;
            if ( i === firstText && i === 0 )
                s = s.replace( /^\s*\n\s*/, '' );
            if ( i === lastText && i === items.length - 1 )
                s = s.replace( /\s*\n\s*$/, '' );
            p.text = s.replace( /\s*\n\s*/g, ' ' );
        } );
        const nodes = [];
        for ( const p of items ) {
            if ( p.node ) {
                if ( parentType.contentMatch.matchType( p.node.type ) || !code )
                    nodes.push( p.node );
                continue;
            }
            const marks = code ? [] : ( p.marks || [] ).filter( ( m ) => parentType.allowsMarkType( m.type ) );
            if ( p.br ) {
                if ( code || !this.schema.nodes.hardBreak )
                    nodes.push( this.schema.text( code ? '\n' : ' ', marks ) );
                else
                    nodes.push( this.schema.nodes.hardBreak.create() );
                continue;
            }
            if ( p.text )
                nodes.push( this.schema.text( p.text, marks ) );
        }
        return nodes;
    }

    /** inline mode: everything as one run of inline content; blocks are joined with line breaks */
    inlineOfAll( root ) {
        const segments = [ [] ];
        const flat = [];
        const visit = ( children, marks ) => {
            children.forEach( ( c ) => {
                if ( c.type === 'el' && ( BLOCK_TAGS[c.tag] ) ) {
                    if ( flat.length && TEXTBLOCK_TAGS[c.tag] )
                        flat.push( { type: 'el', tag: 'br', attrs: {}, children: [] } );
                    visit( c.children, marks );
                } else {
                    flat.push( c );
                }
            } );
        };
        visit( root.children, [] );
        this.inline( flat, [], segments );
        // a block token cannot be inline: it was not in an inline input, so it is unknown here and dropped
        return [].concat( ...segments.filter( ( s ) => Array.isArray( s ) ) );
    }

    /** repair: inline nodes of tokens that never came back */
    missingInline() {
        const out = [];
        for ( const [ key, t ] of this.map.tokens ) {
            if ( this.used.has( key ) || t.kind !== 'inline' )
                continue;
            this.used.add( key );
            if ( t.content instanceof Fragment )
                t.content.forEach( ( n ) => out.push( { node: n } ) );
            else
                out.push( { node: t.content } );
        }
        return out;
    }

    /** repair: block tokens that never came back go to the end, inline ones into the last textblock */
    appendMissing( blocks ) {
        const inline = this.missingInlineNodes();
        const extra = [];
        for ( const [ key, t ] of this.map.tokens ) {
            if ( this.used.has( key ) || t.kind !== 'block' )
                continue;
            this.used.add( key );
            extra.push( t.content );
        }
        let out = blocks.slice();
        if ( inline.length ) {
            const last = out.length ? out[out.length - 1] : null;
            const appended = last ? appendInline( last, inline ) : null;
            if ( appended )
                out[out.length - 1] = appended;
            else
                out.push( this.schema.nodes.paragraph.create( null, inline ) );
        }
        out = out.concat( extra );
        return out;
    }

    missingInlineNodes() {
        return this.missingInline().map( ( p ) => p.node );
    }
}

const TEXTBLOCK_TYPE = { paragraph: true, heading: true };

/** the node with inline nodes added to its last textblock, or null */
function appendInline( node, inline ) {
    if ( node.isTextblock && !node.type.spec.code )
        return node.copy( node.content.append( Fragment.fromArray( inline ) ) );
    if ( !node.childCount || node.isAtom || node.type.spec.tableRole )
        return null;
    const changed = appendInline( node.lastChild, inline );
    return changed ? node.copy( node.content.replaceChild( node.childCount - 1, changed ) ) : null;
}

// ------------------------------------------------------------------ apply

/** how deep the fragment can be "open" at its start or end (descending into non-leaf children) */
export function openDepth( fragment, side ) {
    let depth = 0, node = side === 'start' ? fragment.firstChild : fragment.lastChild;
    while ( node && !node.isLeaf && !node.isAtom ) {
        depth++;
        if ( node.isTextblock )
            break;
        node = side === 'start' ? node.firstChild : node.lastChild;
    }
    return depth;
}

/**
 * A slice for replacing an original slice: the same openness, as far as the new content allows it.
 */
export function sliceLike( fragment, original ) {
    const os = Math.min( original ? original.openStart : 0, openDepth( fragment, 'start' ) );
    const oe = Math.min( original ? original.openEnd : 0, openDepth( fragment, 'end' ) );
    return new Slice( fragment, os, oe );
}

// ------------------------------------------------------------------ display

/** markup -> text for the preview: tags removed, blocks separated by blank lines, tokens kept */
export function displayText( markup ) {
    return decodeEntities( String( markup || '' )
        .replace( /<br\s*\/?>/gi, '\n' )
        .replace( /<\/(p|h[1-6]|li)>/gi, '\n' )
        .replace( /<li\b[^>]*>/gi, '• ' )
        .replace( /<\/?(p|h[1-6]|ul|ol|a|b|strong|i|em|u|sub|sup|span)\b[^>]*>/gi, '' )
        .replace( /\n[ \t]+/g, '\n' )
        .replace( /\n{2,}/g, '\n' )
        .trim() );
}

/** the answer without tokens (for text inserted next to the original) */
export function stripTokens( markup ) {
    return String( markup || '' ).replace( new RegExp( '[ \\t]*' + TOKEN_SOURCE, 'g' ), '' );
}
