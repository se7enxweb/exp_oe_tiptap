/**
 * Unit tests of the ezoe dialect schema (node --test). The full round trip through ezoe's parser is
 * tests/php/roundtrip/run.sh.
 *
 * @license GPL-2.0-or-later
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GlobalRegistrator } from '@happy-dom/global-registrator';

const root = resolve( dirname( fileURLToPath( import.meta.url ) ), '../../..' );
const fixtures = resolve( root, 'tests/fixtures' );
let S;

before( async () => {
    GlobalRegistrator.register();
    S = await import( '../../../src/js/schema/index.js' );
} );
after( async () => {
    await GlobalRegistrator.unregister();
} );

const roundtrip = ( html, options ) => S.toEditorHTML( S.fromEditorHTML( html, options ), options );

/** The HTML with the attributes of every element sorted by name: the order of attributes means nothing to the parser. */
function canonical( html ) {
    const container = document.createElement( 'div' );
    container.innerHTML = html;
    container.querySelectorAll( '*' ).forEach( element => {
        const attributes = Array.from( element.attributes ).map( a => [ a.name, a.value ] ).sort( ( a, b ) => ( a[ 0 ] < b[ 0 ] ? -1 : 1 ) );
        attributes.forEach( ( [ name ] ) => element.removeAttribute( name ) );
        attributes.forEach( ( [ name, value ] ) => element.setAttribute( name, value ) );
    } );
    return container.innerHTML;
}

function assertSameHTML( actual, expected, message ) {
    assert.equal( canonical( actual ), canonical( expected ), message );
}

test( 'every fixture is stable: a second pass through Tiptap changes nothing', () => {
    const files = readdirSync( fixtures ).filter( name => name.endsWith( '.html' ) );
    assert.ok( files.length >= 60, 'fixtures present' );
    for ( const file of files ) {
        const once = roundtrip( readFileSync( resolve( fixtures, file ), 'utf8' ) );
        assert.equal( roundtrip( once ), once, file );
    }
} );

test( 'plain content comes out exactly as ezoe wrote it', () => {
    const html = '<p align="center">Centered <strong>bold</strong> <em>it</em></p><h2 class="x">Head</h2>' +
                 '<p>first line<br><strong>second</strong> line<br>third line<br></p><p><br></p>';
    assertSameHTML( roundtrip( html ), html );
} );

test( 'unknown attributes and classes are kept verbatim', () => {
    const html = '<p data-future="1" class="lead unknown" customattributes="a|1attribute_separationb|2" style="margin: 4px;">x</p>';
    const out = roundtrip( html );
    for ( const part of [ 'data-future="1"', 'class="lead unknown"', 'customattributes="a|1attribute_separationb|2"', 'style="margin: 4px;"' ] )
        assert.ok( out.includes( part ), part + ' in ' + out );
} );

test( 'links keep href, target, title, id, view, class; data-mce-href is dropped', () => {
    const out = roundtrip( '<p><a view="full" href="eznode://74#part" data-mce-href="eznode://74#part" target="_blank" title="T &quot;q&quot;" id="l1" class="c">x</a></p>' );
    assertSameHTML( out, '<p><a view="full" href="eznode://74#part" target="_blank" title="T &quot;q&quot;" id="l1" class="c">x</a></p>' );
} );

test( 'anchors: ezoe form, TinyMCE 8 form, inside headings', () => {
    assert.equal( roundtrip( '<p><a name="top" class="mceItemAnchor"></a>Text</p>' ), '<p><a name="top" class="mceItemAnchor"></a>Text</p>' );
    assert.equal( roundtrip( '<p><a id="top"></a>Text</p>' ), '<p><a name="top" class="mceItemAnchor"></a>Text</p>' );
    assert.equal( roundtrip( '<h2><a name="p2" class="mceItemAnchor"></a>Part</h2>' ), '<h2><a name="p2" class="mceItemAnchor"></a>Part</h2>' );
} );

test( 'literal keeps its text, line breaks as <br>', () => {
    const html = '<pre>&lt;div&gt;<br>    a &amp; b<br><br>end</pre>';
    assertSameHTML( roundtrip( html ), html );
    const json = S.fromEditorHTML( html );
    assert.equal( json.content[ 0 ].type, 'literal' );
    assert.equal( json.content[ 0 ].content[ 0 ].text, '<div>\n    a & b\n\nend' );
} );

test( 'tables keep ezoe attributes and write no Tiptap extras', () => {
    const html = '<table customattributes="summary|S" width="80%" border="1" align="center" class="list"><tbody>' +
                 '<tr><th customattributes="scope|col" width="30%"><p>H</p></th><th><p>H2</p></th></tr>' +
                 '<tr><td colspan="2" align="right"><p>x</p></td></tr></tbody></table>';
    const out = roundtrip( html );
    assertSameHTML( out, html );
    assert.ok( !/colgroup|min-width|text-align|colspan="1"/.test( out ) );
} );

test( 'empty table cells and paragraphs are written as ezoe expects', () => {
    const out = roundtrip( '<table><tbody><tr><td><p><br data-mce-bogus="1"></p></td></tr></tbody></table>' );
    assert.equal( out, '<table><tbody><tr><td><p><br></p></td></tr></tbody></table>' );
} );

test( 'block embeds: attributes kept, preview shown in the editor, "ezembed" on save', () => {
    const html = '<div id="eZObject_72" title="Privacy" alt="medium" view="embed" inline="false" ' +
                 'class="ezoeItemNonEditable highlighted_object ezoeItemContentTypeObjects" ' +
                 'customattributes="offset|0attribute_separationlimit|3"><div class="x"><a href="/p">Privacy</a></div></div>';
    const json = S.fromEditorHTML( html );
    assert.equal( json.content[ 0 ].type, 'ezEmbed' );
    assert.equal( json.content[ 0 ].attrs.id, 'eZObject_72' );
    assert.equal( json.content[ 0 ].attrs.preview, '<div class="x"><a href="/p">Privacy</a></div>' );
    const saved = S.toEditorHTML( json );
    assert.ok( saved.startsWith( '<div id="eZObject_72" title="Privacy" alt="medium" view="embed" inline="false"' ), saved );
    assert.ok( saved.endsWith( '>ezembed</div>' ), saved );
    assert.ok( saved.includes( 'customattributes="offset|0attribute_separationlimit|3"' ) );
    assert.ok( S.toEditorHTML( json, { save: false } ).includes( '<a href="/p">Privacy</a>' ) );
} );

test( 'inline embeds and image embeds stay inside the paragraph', () => {
    const html = '<p>Text <span id="eZNode_74" title="P" alt="medium" view="embed-inline" inline="true" html_id="e1" ' +
                 'class="ezoeItemNonEditable ezoeItemContentTypeObjects">preview</span> and ' +
                 '<img id="eZObject_108" title="img" src="/i.jpg" width="100" height="56" alt="small" view="embed" ' +
                 'inline="false" align="middle" class=" ezoeAlignmiddle"> end</p>';
    const json = S.fromEditorHTML( html );
    const types = json.content[ 0 ].content.map( node => node.type );
    assert.deepEqual( types, [ 'text', 'ezEmbedInline', 'text', 'ezEmbedImage', 'text' ] );
    const saved = S.toEditorHTML( json );
    assert.ok( saved.includes( 'html_id="e1"' ) && saved.includes( '>ezembed</span>' ), saved );
    // ezoeAlign helper class removed on save, as ezoe's embed plugin does
    assert.ok( saved.includes( '<img id="eZObject_108" title="img" alt="small" view="embed" inline="false" align="middle" src="/i.jpg" width="100" height="56">' ), saved );
} );

test( 'custom tags: block with content, empty block, inline span/u, sub/sup, image', () => {
    const html = '<div class="ezoeItemCustomTag factbox" type="custom" customattributes="title|Factattribute_separationalign|left"><p>In <strong>box</strong></p></div>' +
                 '<div class="ezoeItemCustomTag separator" type="custom"><p>separator</p></div>' +
                 '<p>H<sub>2</sub>O x<sup>2</sup> <span class="ezoeItemCustomTag strike" type="custom">old</span> ' +
                 '<u class="ezoeItemCustomTag underline" type="custom">under</u> ' +
                 '<img src="/icon.png" class="ezoeItemCustomTag icon" type="custom" customattributes="a|b" width="22" height="22"></p>' +
                 '<div class="ezoeItemCustomTag video" type="custom" customattributes="width|640"><p>video</p></div>';
    assertSameHTML( roundtrip( html ), html );
    const json = S.fromEditorHTML( html );
    assert.equal( json.content[ 0 ].type, 'ezCustomBlock' );
    assert.equal( S.customTagName( json.content[ 0 ].attrs ), 'factbox' );
    assert.deepEqual( S.parseCustomAttributes( json.content[ 0 ].attrs.customattributes ), { title: 'Fact', align: 'left' } );
} );

test( 'lists: single paragraph items without <p>, several paragraphs with <p>', () => {
    const html = '<ul><li>one</li><li><p>a</p><p>b</p></li><li>two<ol><li>nested</li></ol></li></ul>';
    assertSameHTML( roundtrip( html ), html );
} );

test( 'whitespace: no-break spaces and a space at the end of a paragraph are kept', () => {
    const html = '<p>a&nbsp; b <strong>x</strong> </p>';
    assertSameHTML( roundtrip( html ), html );
} );

test( 'pasted formatting maps like ezoe\'s parser: b, i, plain u', () => {
    assert.equal( roundtrip( '<p><b>b</b><i>i</i><u>u</u></p>' ),
        '<p><strong>b</strong><em>i</em><u class="ezoeItemCustomTag underline" type="custom">u</u></p>' );
} );

test( 'formatting is not split around a link inside it', () => {
    const html = '<p><em>Credit: <a href="https://example.com/">name</a> / <a href="https://example.org/">CC</a></em></p>';
    assertSameHTML( roundtrip( html ), html );
} );

test( 'customattributes helpers', () => {
    assert.deepEqual( S.parseCustomAttributes( 'a|1attribute_separationb|x|y' ), { a: '1', b: 'x|y' } );
    assert.equal( S.serializeCustomAttributes( { a: '1', b: 'x|y' } ), 'a|1attribute_separationb|x|y' );
    assert.equal( S.serializeCustomAttributes( {} ), null );
    assert.equal( S.cleanClass( 'ezoeItemNonEditable highlighted_object ezoeItemContentTypeObjects' ), 'highlighted_object' );
} );

test( 'a headless editor with the extensions edits and saves the dialect', async () => {
    const { Editor } = await import( '@tiptap/core' );
    const element = document.createElement( 'div' );
    document.body.appendChild( element );
    const editor = new Editor( {
        element,
        extensions: S.ezoeExtensions(),
        content: S.fromEditorHTML( '<p>hello world</p>' )
    } );
    editor.commands.setTextSelection( { from: 1, to: 6 } );
    editor.commands.toggleBold();
    editor.commands.setTextSelection( { from: 7, to: 12 } );
    editor.commands.setCustomInline( 'taglink', 'tag|news' );
    editor.commands.setTextSelection( 13 );
    editor.commands.insertEmbedInline( { id: 'eZObject_72', alt: 'medium', view: 'embed-inline', inline: 'true',
        class: 'ezoeItemNonEditable ezoeItemContentTypeObjects' } );
    editor.commands.insertTable( { rows: 2, cols: 2, withHeaderRow: true } );
    const saved = S.toEditorHTML( editor );
    assert.ok( saved.startsWith( '<p><strong>hello</strong> <span class="ezoeItemCustomTag taglink" type="custom" customattributes="tag|news">world</span>' +
                                 '<span id="eZObject_72" alt="medium" view="embed-inline" inline="true" class="ezoeItemNonEditable ezoeItemContentTypeObjects">ezembed</span></p>' ), saved );
    assert.ok( saved.includes( '<table><tbody><tr><th><p><br></p></th><th><p><br></p></th></tr>' ), saved );
    editor.destroy();
} );
