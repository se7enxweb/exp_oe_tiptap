/**
 * The AI assistant keeps every non-text item (node --test, happy-dom, no network, no provider).
 *
 * Every fixture of tests/fixtures is serialized to the markup the provider gets, answered by fake assistants and
 * rebuilt into the document that toEditorHTML() posts:
 * - an assistant that answers the markup unchanged: the posted HTML is byte-identical to the original;
 * - an assistant that rewrites words but keeps tokens and tags: every embed, image, custom tag, anchor, table,
 *   literal and link is byte-identical in the posted HTML, the element skeleton is the same, only text changed;
 * - assistants that drop, duplicate or invent tokens: the check fails, and the repaired result still holds
 *   every item exactly once.
 * The markup never carries ids, URLs, image sources or custom attributes.
 *
 * @license GPL-2.0-or-later
 */
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GlobalRegistrator } from '@happy-dom/global-registrator';

const root = resolve( dirname( fileURLToPath( import.meta.url ) ), '../../..' );
const fixtureDir = resolve( root, 'tests/fixtures' );
const fixtures = readdirSync( fixtureDir ).filter( ( f ) => f.endsWith( '.html' ) ).sort();
const TOKEN = /⟦[A-Z]\d+⟧/g;

let S, schema, M, UI, Transform, getSchema, form;

before( async () => {
    GlobalRegistrator.register( { url: 'https://example.test/admin/content/edit/1/1' } );
    S = await import( '../../../src/js/ai/structure.js' );
    M = await import( '../../../src/js/schema/index.js' );
    UI = await import( '../../../src/js/index.js' );
    ( { Transform } = await import( '@tiptap/pm/transform' ) );
    ( { getSchema } = await import( '@tiptap/core' ) );
    schema = getSchema( M.ezoeExtensions() );
} );
after( async () => {
    await GlobalRegistrator.unregister();
} );
beforeEach( () => {
    document.body.innerHTML = '';
    form = document.createElement( 'form' );
    document.body.appendChild( form );
} );

const load = ( name ) => readFileSync( resolve( fixtureDir, name ), 'utf8' );
const docOf = ( html ) => schema.nodeFromJSON( M.fromEditorHTML( html, { schema, document } ) );
const post = ( doc ) => M.toEditorHTML( doc, { schema, document } );

/** the whole document through a fake assistant, as the panel does it for "no selection" */
function roundTrip( doc, assistant, repair ) {
    const { markup, map } = S.serialize( { mode: 'blocks', content: doc.content } );
    const answer = assistant( markup );
    const check = S.validate( answer, map );
    const frag = S.rebuild( answer, map, schema, { mode: 'blocks', repair: repair === undefined ? !check.ok : repair } );
    const out = new Transform( doc ).replaceWith( 0, doc.content.size, frag ).doc;
    out.check();
    return { markup, map, answer, check, doc: out };
}

/** rewrites words of the text, never tags, tokens or entities */
function rewriteWords( markup ) {
    return markup.split( /(<[^>]*>|⟦[A-Z]\d+⟧|&#?\w+;)/ ).map( ( part, i ) => i % 2
        ? part
        : part.replace( /\b([a-z])([a-z]{3,})\b/g, ( all, a, b ) => a.toUpperCase() + b.split( '' ).reverse().join( '' ) ) ).join( '' );
}

// sub, sup and the plain underline are formatting of editable text (checked by the skeleton), not items
const ITEMS = 'img, [type="custom"]:not(u), div[id^="eZ"], span[id^="eZ"], a.mceItemAnchor, a[name], table, pre';

/** the non-text items of posted HTML: embeds, images, custom tags, anchors, tables, literals byte for byte, links by their attributes */
function items( html ) {
    const box = document.createElement( 'div' );
    box.innerHTML = html;
    const list = Array.prototype.map.call( box.querySelectorAll( ITEMS ), ( el ) => el.outerHTML );
    const links = Array.prototype.filter.call( box.querySelectorAll( 'a[href]' ), ( a ) => !a.closest( ITEMS ) )
        .map( ( a ) => a.cloneNode( false ).outerHTML );
    return { list, links: [ ...new Set( links ) ].sort() };
}

/** the element structure without any text */
function skeleton( html ) {
    const box = document.createElement( 'div' );
    box.innerHTML = html;
    const strip = ( n ) => {
        for ( const c of Array.from( n.childNodes ) ) {
            if ( c.nodeType === 3 )
                c.remove();
            else
                strip( c );
        }
    };
    strip( box );
    return box.innerHTML;
}

/** every href, src, id value and custom attribute of the document's nodes and marks */
function secrets( doc ) {
    const values = new Set();
    const add = ( attrs ) => {
        for ( const [ k, v ] of Object.entries( attrs || {} ) ) {
            if ( [ 'href', 'src', 'id', 'customattributes', 'html_id', 'name', 'title' ].includes( k ) && typeof v === 'string' && v.length > 3 )
                values.add( v );
        }
    };
    doc.descendants( ( n ) => {
        add( n.attrs );
        n.marks.forEach( ( m ) => add( m.attrs ) );
    } );
    return values;
}

test( 'fixtures: an assistant that changes nothing gives back the identical posted HTML', () => {
    let withTokens = 0;
    for ( const f of fixtures ) {
        const doc = docOf( load( f ) );
        const r = roundTrip( doc, ( m ) => m );
        assert.ok( r.check.ok, f + ': ' + JSON.stringify( r.check ) );
        assert.equal( post( r.doc ), post( doc ), f );
        if ( r.map.tokens.size )
            withTokens++;
    }
    assert.ok( fixtures.length >= 60, 'all fixtures are used' );
    assert.ok( withTokens >= 12, 'fixtures with items: ' + withTokens );
} );

test( 'fixtures: the markup never carries ids, URLs, image sources, custom attributes or titles of items', () => {
    for ( const f of fixtures ) {
        const doc = docOf( load( f ) );
        const { markup } = S.serialize( { mode: 'blocks', content: doc.content } );
        const text = doc.textBetween( 0, doc.content.size, '\n', ' ' );
        for ( const v of secrets( doc ) ) {
            if ( !text.includes( v ) )
                assert.ok( !markup.includes( v ), f + ' leaks ' + v );
        }
        assert.doesNotMatch( markup, /eZObject_|eZNode_|ezobject:\/\/|eznode:\/\/|customattributes|class=|src=|style=/, f );
        assert.doesNotMatch( markup.replace( /<a href="L\d+">/g, '' ).replace( /<\w+ k="[BM]\d+">/g, '' ), /<\w+ [^>]*>/, f + ': only known attributes' );
    }
} );

test( 'fixtures: an assistant that rewrites words keeps every item byte-identical and changes only text', () => {
    let changed = 0;
    for ( const f of fixtures ) {
        const doc = docOf( load( f ) );
        const before = post( doc );
        const r = roundTrip( doc, rewriteWords );
        assert.ok( r.check.ok, f + ': ' + JSON.stringify( r.check ) );
        const after = post( r.doc );
        assert.deepEqual( items( after ), items( before ), f + ': items' );
        assert.equal( skeleton( after ), skeleton( before ), f + ': structure' );
        if ( after !== before )
            changed++;
    }
    // the fixtures that hold only items (tables, embeds) have no text outside them
    assert.ok( changed >= 50, 'text changed in ' + changed + ' fixtures' );
} );

test( 'embeds, custom tags, tables and anchors become numbered tokens; links and keyed attributes references', () => {
    const doc = docOf( load( 's058-embeds.html' ) );
    const { markup, map } = S.serialize( { mode: 'blocks', content: doc.content } );
    assert.equal( markup.match( TOKEN ).join( ' ' ), '⟦E1⟧ ⟦E2⟧ ⟦E3⟧ ⟦E4⟧ ⟦E5⟧ ⟦E6⟧' );
    assert.match( markup, /<p>Text ⟦E3⟧ after the inline embed\.<\/p>/ );
    assert.deepEqual( [ ...map.tokens.values() ].map( ( t ) => t.kind + ':' + t.label ),
        [ 'inline:Image', 'block:Object', 'inline:Inline object', 'block:Object', 'inline:Image', 'inline:Image' ] );

    const custom = S.serialize( { mode: 'blocks', content: docOf( load( 's059-custom-tags.html' ) ).content } );
    assert.match( custom.markup, /^⟦C1⟧\n⟦C2⟧\n<p>H<sub>2<\/sub>O, x<sup>2<\/sup>, ⟦C3⟧, <u>under<\/u>, ⟦C4⟧\.<\/p>/ );
    assert.equal( custom.map.tokens.get( 'C4' ).label, 'Custom tag: taglink' );

    const links = S.serialize( { mode: 'blocks', content: docOf( load( 's056-links-all.html' ) ).content } );
    assert.match( links.markup, /<a href="L1">/ );
    assert.ok( links.map.links.size >= 3 );

    const table = S.serialize( { mode: 'blocks', content: docOf( load( 's057-table-attributes.html' ) ).content } );
    assert.match( table.markup, /⟦T1⟧/ );
    assert.doesNotMatch( table.markup, /<t[dhr]/ );

    const anchors = S.serialize( { mode: 'blocks', content: docOf( load( 's053-anchor-inline.html' ) ).content } );
    assert.match( anchors.markup, /^<p>⟦A1⟧Text after an anchor\.<\/p>\n<p>Before ⟦A2⟧after\.<\/p>/ );

    const aligned = S.serialize( { mode: 'blocks', content: docOf( load( 's051-paragraph-align.html' ) ).content } );
    assert.match( aligned.markup, /<p k="B1">/ );
} );

test( 'an assistant that drops, duplicates or invents tokens fails the check; the repair keeps every item once', () => {
    for ( const f of [ 's058-embeds.html', 's059-custom-tags.html', 's053-anchor-inline.html', 's057-table-attributes.html', 's056-links-all.html' ] ) {
        const doc = docOf( load( f ) );
        const before = post( doc );
        const { markup, map } = S.serialize( { mode: 'blocks', content: doc.content } );
        const keys = [ ...map.tokens.keys() ];
        const bad = [
            [ 'drop', ( m ) => m.replace( TOKEN, ( t, i ) => ( t === '⟦' + keys[0] + '⟧' ? '' : t ) ) ],
            [ 'duplicate', ( m ) => m + '\n<p>⟦' + keys[keys.length - 1] + '⟧ again</p>' ],
            [ 'invent', ( m ) => m.replace( /<\/p>/, ' ⟦E99⟧</p>' ) ],
            [ 'drop all', ( m ) => m.replace( TOKEN, '' ) ]
        ];
        for ( const [ what, fake ] of bad ) {
            if ( !keys.length )
                continue;
            const r = roundTrip( doc, fake );
            assert.equal( r.check.ok, false, f + ' ' + what );
            assert.ok( r.check.problems > 0, f + ' ' + what );
            const after = post( r.doc );
            const a = items( after ).list.slice().sort(), b = items( before ).list.slice().sort();
            assert.deepEqual( a, b, f + ' ' + what + ': every item exactly once' );
        }
    }
    const doc = docOf( load( 's058-embeds.html' ) );
    const { markup, map } = S.serialize( { mode: 'blocks', content: doc.content } );
    const c = S.validate( markup.replace( '⟦E1⟧', '' ).replace( '⟦E2⟧', '⟦E2⟧⟦E2⟧' ) + '⟦Q7⟧', map );
    assert.deepEqual( [ c.missing, c.duplicated, c.unknown ], [ [ 'E1' ], [ 'E2' ], [ 'Q7' ] ] );
    assert.equal( c.problems, 3 );
} );

test( 'a lost or invented link and unknown tags fail the check', () => {
    const doc = docOf( '<p>See <a href="eznode://74" target="_blank">the page</a> and <strong>more</strong>.</p>' );
    const { markup, map } = S.serialize( { mode: 'blocks', content: doc.content } );
    assert.equal( markup, '<p>See <a href="L1">the page</a> and <b>more</b>.</p>' );
    assert.ok( S.validate( '<p>Read <a href="L1">this page</a>.</p>', map ).ok );
    assert.deepEqual( S.validate( '<p>Read this page.</p>', map ).missingLinks, [ 'L1' ] );
    assert.deepEqual( S.validate( '<p><a href="L1">x</a> <a href="https://evil.example/">y</a></p>', map ).unknownLinks, [ 'https://evil.example/' ] );
    const div = S.validate( '<div><p>See <a href="L1">it</a></p></div><script>x</script>', map );
    assert.deepEqual( div.badTags, [ 'div', 'script' ] );
    assert.equal( div.ok, false );
    assert.ok( S.validate( '<p>no tokens, no links</p>', map, { allowDrop: true } ).ok, 'summarise and continue may leave them out' );
    // the rebuilt link is the original mark with all its attributes; an invented URL never becomes a link
    const frag = S.rebuild( '<p>Read <a href="L1">this</a> <a href="https://evil.example/">not a link</a>.</p>', map, schema );
    const html = post( new Transform( doc ).replaceWith( 0, doc.content.size, frag ).doc );
    assert.equal( html, '<p>Read <a href="eznode://74" target="_blank">this</a> not a link.</p>' );
} );

test( 'the parser is tolerant: plain text, Markdown-free paragraphs, entities, unclosed tags, strong/em', () => {
    const doc = docOf( '<p>a</p>' );
    const { map } = S.serialize( { mode: 'blocks', content: doc.content } );
    const html = ( answer ) => post( new Transform( doc ).replaceWith( 0, doc.content.size, S.rebuild( answer, map, schema ) ).doc );
    assert.equal( html( 'One\n\nTwo\nlines' ), '<p>One</p><p>Two<br>lines</p>' );
    assert.equal( html( '<p>x &amp; y &lt;z&gt; &#10214;</p>' ), '<p>x &amp; y &lt;z&gt; ⟦</p>' );
    assert.equal( html( '<p><strong>bold <em>both</p><p>next' ), '<p><strong>bold </strong><em><strong>both</strong></em></p><p>next</p>' );
    assert.equal( html( '<ul>\n<li>one</li>\n<li><p>two</p><ul><li>deep</li></ul></li>\n</ul>' ), '<ul><li>one</li><li>two<ul><li>deep</li></ul></li></ul>' );
    assert.equal( html( '<h2>Title</h2>\n<p>a <i>b</i> <u>c</u> H<sub>2</sub>O</p>' ),
        '<h2>Title</h2><p>a <em>b</em> <u class="ezoeItemCustomTag underline" type="custom">c</u> H<sub>2</sub>O</p>' );
} );

test( 'attributes come back through keys: aligned paragraphs, headings, lists and formatted marks', () => {
    for ( const f of [ 's051-paragraph-align.html', 's052-headers-anchor-align.html', 's060-lists.html', 's055-nested-marks.html' ] ) {
        const doc = docOf( load( f ) );
        const r = roundTrip( doc, rewriteWords );
        assert.ok( r.check.ok, f );
        assert.equal( skeleton( post( r.doc ) ), skeleton( post( doc ) ), f );
    }
} );

test( 'a block token the assistant moved into a paragraph splits it; an inline token on its own line gets a paragraph', () => {
    const doc = docOf( load( 's058-embeds.html' ) );
    const { markup, map } = S.serialize( { mode: 'blocks', content: doc.content } );
    const moved = markup.replace( '\n⟦E2⟧', '' ).replace( 'Text ⟦E3⟧', 'Text ⟦E2⟧ ⟦E3⟧' ).replace( /<p>(⟦E1⟧)<\/p>/, '$1' );
    const check = S.validate( moved, map );
    assert.ok( check.ok, JSON.stringify( check ) );
    const out = new Transform( doc ).replaceWith( 0, doc.content.size, S.rebuild( moved, map, schema ) ).doc;
    out.check();
    assert.deepEqual( items( post( out ) ).list.slice().sort(), items( post( doc ) ).list.slice().sort() );
    assert.equal( out.child( 0 ).type.name, 'paragraph' );
} );

// ------------------------------------------------------------------ the panel with a fake assistant

function fakeFetch( answer, calls ) {
    return ( url, init ) => {
        const body = new URLSearchParams( init.body.toString() );
        calls.push( body );
        return Promise.resolve( { ok: true, status: 200, json: () => Promise.resolve( { content: { text: answer( body, calls.length ), model: 'fake' } } ) } );
    };
}

const tick = () => new Promise( ( r ) => setTimeout( r, 0 ) );
const settle = async () => {
    for ( let i = 0; i < 5; i++ )
        await tick();
};

function editorWith( html, fetchImpl ) {
    const t = document.createElement( 'textarea' );
    t.name = 'ContentObjectAttribute_data_text_9';
    t.value = html;
    form.appendChild( t );
    return { t, inst: new UI.ExpOETiptapInstance( t, {
        buttons: [ 'bold' ], formToken: 'TOKEN', locale: 'en-GB', urls: { ezjscore: '/ezjscore/' },
        ai: { enabled: true, commands: [ 'improve', 'translate', 'summarise', 'continue' ] }
    }, { fetch: fetchImpl } ) };
}

test( 'panel: a whole document with embeds is rewritten in place, the preview shows the items as chips', async () => {
    const html = load( 's058-embeds.html' );
    const calls = [];
    const { t, inst } = editorWith( html, fakeFetch( ( body ) => rewriteWords( body.get( 'text' ) ), calls ) );
    const before = M.toEditorHTML( inst.editor, { document } );
    inst.editor.commands.setTextSelection( 1 );
    await inst.ai.start( 'improve' );
    await settle();
    assert.equal( calls.length, 1 );
    assert.equal( calls[0].get( 'format' ), 'markup' );
    assert.doesNotMatch( calls[0].get( 'text' ), /eZObject|eZNode|\/var\/|privacy-policy/ );
    const chips = Array.prototype.map.call( inst.wrapper.querySelectorAll( '.exp-oe-ai-preview .exp-oe-ai-chip' ), ( c ) => c.textContent );
    assert.deepEqual( chips, [ 'Image', 'Object', 'Inline object', 'Object', 'Image', 'Image' ] );
    assert.ok( inst.wrapper.querySelector( '.exp-oe-ai-preview ins' ), 'changed words are marked' );
    assert.ok( !inst.wrapper.querySelector( '.exp-oe-ai-warning' ) );
    inst.wrapper.querySelector( '[data-action="Accept"]' ).click();
    assert.deepEqual( items( t.value ), items( before ) );
    assert.equal( skeleton( t.value ), skeleton( before ) );
    assert.notEqual( t.value, before );
} );

test( 'panel: an answer that loses items is asked for once more (strict), then warns; Keep original changes nothing', async () => {
    const html = load( 's059-custom-tags.html' );
    const calls = [];
    const { t, inst } = editorWith( html, fakeFetch( ( body ) => body.get( 'text' ).replace( '⟦C1⟧', '' ).replace( '⟦C3⟧', '⟦C3⟧⟦C3⟧' ), calls ) );
    const before = M.toEditorHTML( inst.editor, { document } );
    inst.editor.commands.setTextSelection( 1 );
    await inst.ai.start( 'improve' );
    await settle();
    assert.equal( calls.length, 2, 'one automatic retry' );
    assert.equal( calls[0].get( 'strict' ), null );
    assert.equal( calls[1].get( 'strict' ), '1' );
    const warning = inst.wrapper.querySelector( '.exp-oe-ai-warning' );
    assert.match( warning.textContent, /changed or removed 2 items/ );
    assert.ok( inst.wrapper.querySelector( '[data-action="Insert below"]' ).classList.contains( 'exp-oe-primary' ) );
    assert.ok( inst.wrapper.querySelector( '.exp-oe-ai-preview del .exp-oe-ai-chip[data-token="C1"]' ), 'the lost item is shown as removed' );
    inst.wrapper.querySelector( '[data-action="Keep original"]' ).click();
    // happy-dom rewrites an invalid style value (width: 640) once the editable state of the view changes; browsers keep it
    const noStyle = ( s ) => s.replace( / style="[^"]*"/g, '' );
    assert.equal( noStyle( M.toEditorHTML( inst.editor, { document } ) ), noStyle( before ) );
    assert.equal( noStyle( t.value ), noStyle( html ) );
    assert.equal( inst.editor.isEditable, true );
} );

test( 'panel: Accept after a failed check puts every item back exactly once; Insert below keeps the original', async () => {
    const html = load( 's058-embeds.html' );
    const { t, inst } = editorWith( html, fakeFetch( ( body ) => body.get( 'text' ).replace( /⟦E[12]⟧/g, '' ).replace( 'Text', 'Words' ), [] ) );
    const before = M.toEditorHTML( inst.editor, { document } );
    inst.editor.commands.setTextSelection( 1 );
    await inst.ai.start( 'improve' );
    await settle();
    inst.wrapper.querySelector( '[data-action="Accept"]' ).click();
    assert.deepEqual( items( t.value ).list.slice().sort(), items( before ).list.slice().sort() );
    assert.match( t.value, /Words/ );

    const second = editorWith( html, fakeFetch( ( body ) => body.get( 'text' ).replace( /⟦E[12]⟧/g, '' ).replace( 'Text', 'Words' ), [] ) );
    second.inst.editor.commands.setTextSelection( 1 );
    await second.inst.ai.start( 'improve' );
    await settle();
    second.inst.wrapper.querySelector( '[data-action="Insert below"]' ).click();
    const out = second.t.value;
    assert.ok( out.startsWith( before.replace( /<p><br><\/p>$/, '' ) ), 'the original is untouched' );
    assert.equal( items( out ).list.length, items( before ).list.length, 'no item is copied into the new text' );
    assert.match( out, /Words/ );
} );

test( 'panel: a selection across blocks keeps the partial paragraphs, the link and the inline embed', async () => {
    const html = '<p>Alpha one <a href="eznode://2" title="t">linked text</a> here</p><p>Beta <img id="eZObject_5" src="/a.jpg" alt="small" view="embed-inline" inline="true" /> two three</p><p>Gamma</p>';
    const calls = [];
    const { t, inst } = editorWith( html, fakeFetch( ( body ) => body.get( 'text' ).replace( 'linked', 'LINKED' ).replace( 'two', 'TWO' ), calls ) );
    const doc = inst.editor.state.doc;
    let from = 0, to = 0;
    doc.descendants( ( n, pos ) => {
        if ( n.isText && n.text.includes( 'one' ) && !from )
            from = pos + n.text.indexOf( 'one' );
        if ( n.isText && n.text.includes( 'three' ) )
            to = pos + n.text.indexOf( 'three' );
    } );
    inst.editor.commands.setTextSelection( { from, to } );
    await inst.ai.start( 'improve' );
    await settle();
    assert.equal( calls[0].get( 'text' ), '<p>one <a href="L1">linked text</a> here</p>\n<p>Beta ⟦E1⟧ two </p>' );
    inst.wrapper.querySelector( '[data-action="Accept"]' ).click();
    assert.equal( t.value, '<p>Alpha one <a href="eznode://2" title="t">LINKED text</a> here</p><p>Beta <img id="eZObject_5" alt="small" view="embed-inline" inline="true" src="/a.jpg"> TWO three</p><p>Gamma</p>' );
} );

test( 'panel: a selection inside one paragraph is sent inline and keeps bold, the link and an anchor', async () => {
    const html = '<p>Start <strong>bold words</strong> and <a name="here" class="mceItemAnchor"></a><a href="/x">a link</a> end</p>';
    const calls = [];
    const { t, inst } = editorWith( html, fakeFetch( ( body ) => body.get( 'text' ).replace( 'words', 'phrase' ).replace( 'a link', 'the link' ), calls ) );
    inst.editor.commands.setTextSelection( { from: 7, to: inst.editor.state.doc.content.size - 5 } );
    await inst.ai.start( 'improve' );
    await settle();
    assert.equal( calls[0].get( 'text' ), '<b>bold words</b> and ⟦A1⟧<a href="L1">a link</a>' );
    inst.wrapper.querySelector( '[data-action="Accept"]' ).click();
    assert.equal( t.value, '<p>Start <strong>bold phrase</strong> and <a name="here" class="mceItemAnchor"></a><a href="/x">the link</a> end</p>' );
} );

test( 'panel: summarise inserts text only and says so; tokens in its answer are left out', async () => {
    const html = load( 's058-embeds.html' );
    const { t, inst } = editorWith( html, fakeFetch( () => '<p>Short ⟦E1⟧ summary.</p>', [] ) );
    const before = M.toEditorHTML( inst.editor, { document } );
    inst.editor.commands.setTextSelection( 1 );
    await inst.ai.start( 'summarise' );
    await settle();
    assert.match( inst.wrapper.querySelector( '.exp-oe-ai-note' ).textContent, /summary is text only/ );
    inst.wrapper.querySelector( '[data-action="Insert below"]' ).click();
    assert.equal( items( t.value ).list.length, items( before ).list.length );
    assert.match( t.value, /<p>Short summary\.<\/p>$/ );
} );

test( 'panel: translate keeps the tokens of a fixture with a table, a link and custom tags', async () => {
    const html = '<p>Before the <a href="eznode://74">first table</a> some words.</p>' + load( 's057-table-attributes.html' ) + load( 's059-custom-tags.html' );
    const calls = [];
    const { t, inst } = editorWith( html, fakeFetch( ( body ) => rewriteWords( body.get( 'text' ) ), calls ) );
    const before = M.toEditorHTML( inst.editor, { document } );
    inst.editor.commands.setTextSelection( 1 );
    inst.ai.start( 'translate' );
    inst.wrapper.querySelector( '.exp-oe-ai-language' ).value = 'de';
    inst.wrapper.querySelector( '[data-action="Translate"]' ).click();
    await settle();
    assert.equal( calls[0].get( 'language' ), 'de' );
    inst.wrapper.querySelector( '[data-action="Accept"]' ).click();
    assert.deepEqual( items( t.value ), items( before ) );
} );

test( 'panel: a cell selection is refused with a message, nothing is sent', async () => {
    const calls = [];
    const { inst } = editorWith( '<table><tbody><tr><td><p>a</p></td><td><p>b</p></td></tr></tbody></table>', fakeFetch( () => 'x', calls ) );
    const { CellSelection } = await import( '@tiptap/pm/tables' );
    const doc = inst.editor.state.doc;
    const cells = [];
    doc.descendants( ( n, pos ) => {
        if ( n.type.name === 'tableCell' )
            cells.push( pos );
    } );
    inst.editor.view.dispatch( inst.editor.state.tr.setSelection( CellSelection.create( doc, cells[0], cells[1] ) ) );
    await inst.ai.start( 'improve' );
    assert.equal( calls.length, 0 );
    assert.match( inst.wrapper.querySelector( '.exp-oe-ai-error' ).textContent, /table cell/ );
} );
