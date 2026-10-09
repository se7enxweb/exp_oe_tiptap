/**
 * UI tests of the Tiptap editor (node --test, happy-dom): init, textarea sync, toolbar, status bar,
 * shortcuts, dialogs, several editors per page.
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
let X, form;

before( async () => {
    GlobalRegistrator.register( { url: 'https://example.test/admin/content/edit/1/1' } );
    X = ( await import( '../../../src/js/index.js' ) ).default;
} );
after( async () => {
    for ( const i of X.instances.slice() )
        X.destroy( i.textarea );
    await GlobalRegistrator.unregister();
} );

beforeEach( () => {
    for ( const i of X.instances.slice() )
        X.destroy( i.textarea );
    document.body.innerHTML = '';
    form = document.createElement( 'form' );
    form.method = 'post';
    form.addEventListener( 'submit', ( e ) => e.preventDefault() );
    document.body.appendChild( form );
} );

function textarea( html, id ) {
    const t = document.createElement( 'textarea' );
    t.id = id || 'ContentObjectAttribute_data_text_' + Math.floor( Math.random() * 1e6 );
    t.name = t.id;
    t.value = html;
    form.appendChild( t );
    return t;
}

const OPTIONS = {
    attributeId: 42, contentObjectId: 1, version: 1, language: 'eng-GB', rows: 10,
    buttons: [ 'formatselect', 'bold', 'italic', 'underline', '|', '|', 'sub', 'sup', '|', 'bullist', 'numlist', 'outdent', 'indent',
               '|', 'undo', 'redo', '|', 'link', 'unlink', 'anchor', '|', 'nosuchbutton', 'literal', 'charmap', '|', 'table', 'delete_table', 'row_after', '|', 'help', '|' ],
    urls: { root: '/', ezoe: '/ezoe/', ezjscore: '/ezjscore/' },
    formToken: 'TOKEN', i18n: {}, locale: 'en-GB', ai: { enabled: false }
};

/** A real Ctrl+<key> keydown through ProseMirror's key handling (Tiptap's keyboardShortcut command re-applies the steps and loses the history meta) */
function press( inst, key ) {
    const event = new KeyboardEvent( 'keydown', { key, ctrlKey: true, bubbles: true, cancelable: true } );
    inst.editor.view.someProp( 'handleKeyDown', ( f ) => f( inst.editor.view, event ) );
}

const buttonNames = ( inst ) => Array.prototype.map.call( inst.toolbar.element.querySelectorAll( '[data-exp-oe-button], .exp-oe-separator' ),
    ( el ) => el.classList.contains( 'exp-oe-separator' ) ? '|' : el.getAttribute( 'data-exp-oe-button' ) );

test( 'init hides the textarea, mounts the editor after it and exposes the instance', () => {
    const t = textarea( '<p>Hello <strong>world</strong></p>' );
    const inst = X.init( t, OPTIONS );
    assert.equal( t.style.display, 'none' );
    assert.equal( t.nextSibling, inst.wrapper );
    assert.ok( inst.wrapper.querySelector( '.ProseMirror' ) );
    assert.equal( X.get( t ), inst );
    assert.equal( X.get( t.id ), inst );
    assert.equal( X.init( t, OPTIONS ), inst, 'a second init returns the same instance' );
    assert.equal( X.usesFallbackSchema, false, 'the bundle uses the ezoe dialect schema' );
} );

test( 'toolbar follows the ezoe button list: separators collapsed, unknown buttons dropped, icons of the o2k7 sprite', () => {
    const inst = X.init( textarea( '<p>x</p>' ), OPTIONS );
    const names = buttonNames( inst );
    assert.deepEqual( names, [ 'formatselect', 'bold', 'italic', 'underline', '|', 'sub', 'sup', '|', 'bullist', 'numlist', 'outdent', 'indent',
                              '|', 'undo', 'redo', '|', 'link', 'unlink', 'anchor', '|', 'literal', 'charmap', '|', 'table', 'delete_table', 'row_after', '|', 'help' ] );
    assert.ok( inst.toolbar.element.querySelector( 'button[data-exp-oe-button="bold"] .exp-oe-icon.mce_bold' ) );
    assert.match( inst.wrapper.style.getPropertyValue( '--exp-oe-icons' ), /extension\/ezoe\/design\/standard\/javascript\/themes\/ez\/img\/icons\.png/ );
    // all buttons are type=button so they never submit the form
    for ( const b of inst.toolbar.element.querySelectorAll( 'button' ) )
        assert.equal( b.type, 'button' );
} );

test( 'unchanged content keeps the textarea value byte for byte, also on submit', () => {
    const html = '<p>Some&nbsp;text with <em>emphasis</em>  and spaces</p>';
    const t = textarea( html );
    X.init( t, OPTIONS );
    form.dispatchEvent( new Event( 'submit', { cancelable: true } ) );
    assert.equal( t.value, html );
} );

test( 'every change writes the ezoe HTML into the textarea', () => {
    const t = textarea( '<p>Hello</p>' );
    const inst = X.init( t, OPTIONS );
    inst.editor.commands.setTextSelection( { from: 1, to: 6 } );
    inst.toolbar.controls.bold.click();
    assert.equal( t.value, '<p><strong>Hello</strong></p>' );
    inst.editor.commands.insertContentAt( inst.editor.state.doc.content.size, '<p>Second</p>' );
    assert.match( t.value, /<p>Second<\/p>$/ );
} );

test( 'underline is ezoe\'s underline custom tag', () => {
    const t = textarea( '<p>under</p>' );
    const inst = X.init( t, OPTIONS );
    inst.editor.commands.setTextSelection( { from: 1, to: 6 } );
    inst.toolbar.controls.underline.click();
    assert.match( t.value, /<u[^>]*class="ezoeItemCustomTag underline"[^>]*>under<\/u>/ );
    assert.match( t.value, /type="custom"/ );
    assert.equal( inst.toolbar.controls.underline.getAttribute( 'aria-pressed' ), 'true' );
} );

test( 'format list box sets headings and literal, and shows the current block', () => {
    const t = textarea( '<p>Title</p>' );
    const inst = X.init( t, OPTIONS );
    inst.editor.commands.setTextSelection( 2 );
    const sel = inst.toolbar.controls.formatselect;
    sel.value = 'h2';
    sel.dispatchEvent( new Event( 'change' ) );
    assert.equal( t.value, '<h2>Title</h2>' );
    assert.equal( sel.value, 'h2' );
    sel.value = 'pre';
    sel.dispatchEvent( new Event( 'change' ) );
    assert.match( t.value, /^<pre[^>]*>Title<\/pre>$/ );
} );

test( 'TinyMCE keyboard shortcuts: Ctrl+1..6 headings, Ctrl+7 paragraph', () => {
    const t = textarea( '<p>Key</p>' );
    const inst = X.init( t, OPTIONS );
    inst.editor.commands.setTextSelection( 2 );
    press( inst, '3' );
    assert.equal( t.value, '<h3>Key</h3>' );
    press( inst, 'z' );
    assert.equal( t.value, '<p>Key</p>', 'undo' );
    press( inst, 'y' );
    assert.equal( t.value, '<h3>Key</h3>', 'redo' );
    press( inst, '7' );
    assert.equal( t.value, '<p>Key</p>' );
    press( inst, '8' );
    assert.match( t.value, /^<pre[^>]*>Key<\/pre>$/ );
} );

test( 'lists, indent and undo/redo state', () => {
    const t = textarea( '<p>one</p><p>two</p>' );
    const inst = X.init( t, OPTIONS );
    inst.editor.commands.setTextSelection( { from: 1, to: 9 } );
    inst.toolbar.controls.bullist.click();
    assert.equal( t.value, '<ul><li>one</li><li>two</li></ul>' );
    assert.equal( inst.toolbar.controls.bullist.getAttribute( 'aria-pressed' ), 'true' );
    assert.equal( inst.toolbar.controls.undo.disabled, false );
    inst.toolbar.controls.undo.click();
    assert.equal( t.value, '<p>one</p><p>two</p>' );
} );

test( 'status bar shows the ezxml path with the tag alias names', () => {
    const t = textarea( '<table><tbody><tr><td><p>cell <strong>bold</strong></p></td></tr></tbody></table>' );
    const inst = X.init( t, Object.assign( {}, OPTIONS, { xmlTagAlias: { td: 'table cell', tr: 'table row' } } ) );
    let pos = null;
    inst.editor.state.doc.descendants( ( node, p ) => {
        if ( node.isText && node.text === 'bold' )
            pos = p + 2;
    } );
    inst.editor.commands.setTextSelection( pos );
    const path = inst.wrapper.querySelector( '.exp-oe-path' ).textContent;
    assert.equal( path, 'table » table row » table cell » paragraph » strong' );
    assert.equal( inst.toolbar.controls.delete_table.disabled, false, 'table buttons enabled in a table' );
} );

test( 'table buttons are disabled outside a table', () => {
    const inst = X.init( textarea( '<p>no table</p>' ), OPTIONS );
    assert.equal( inst.toolbar.controls.delete_table.disabled, true );
    assert.equal( inst.toolbar.controls.row_after.disabled, true );
} );

test( 'several editors on one page stay independent', () => {
    const a = textarea( '<p>A</p>', 'ta_a' ), b = textarea( '<p>B</p>', 'ta_b' );
    const ia = X.init( a, OPTIONS ), ib = X.init( b, OPTIONS );
    assert.notEqual( ia, ib );
    ib.editor.commands.insertContentAt( 2, 'b' );
    assert.equal( a.value, '<p>A</p>' );
    assert.equal( b.value, '<p>Bb</p>' );
    assert.equal( document.querySelectorAll( '.exp-oe-tiptap' ).length, 2 );
} );

test( 'toolbar disable button submits through the form button after syncing', () => {
    const t = textarea( '<p>x</p>' );
    const disable = document.createElement( 'input' );
    disable.type = 'submit';
    disable.name = 'CustomActionButton[42_disable_editor]';
    form.appendChild( disable );
    let seen = null;
    disable.addEventListener( 'click', () => { seen = t.value; } );
    const inst = X.init( t, Object.assign( {}, OPTIONS, { buttons: [ 'bold', '|', 'disable' ], disableButtonName: disable.name } ) );
    inst.editor.commands.insertContentAt( 2, 'y' );
    inst.toolbar.controls.disable.click();
    assert.equal( seen, '<p>xy</p>' );
} );

test( 'destroy restores the textarea with the edited value', () => {
    const t = textarea( '<p>d</p>' );
    const inst = X.init( t, OPTIONS );
    inst.editor.commands.insertContentAt( 2, 'e' );
    X.destroy( t );
    assert.equal( t.style.display, '' );
    assert.equal( t.value, '<p>de</p>' );
    assert.equal( document.querySelector( '.exp-oe-tiptap' ), null );
} );

test( 'link dialog writes an ezoe link with its attributes', () => {
    const t = textarea( '<p>Go there</p>' );
    const inst = X.init( t, Object.assign( {}, OPTIONS, { linkClasses: { important: 'Important' } } ) );
    inst.editor.commands.setTextSelection( { from: 4, to: 9 } );
    inst.toolbar.controls.link.click();
    const dlg = document.querySelector( '.exp-oe-dialog' );
    assert.ok( dlg );
    const inputs = dlg.querySelectorAll( '.exp-oe-field input[type="text"]' );
    inputs[0].value = 'eznode://12';
    dlg.querySelectorAll( '.exp-oe-field select' )[0].value = '_blank';
    dlg.querySelectorAll( '.exp-oe-field select' )[1].value = 'important';
    dlg.querySelector( '.exp-oe-dialog-footer .exp-oe-primary' ).click();
    assert.equal( document.querySelector( '.exp-oe-dialog' ), null );
    assert.match( t.value, /^<p>Go <a [^>]*href="eznode:\/\/12"[^>]*>there<\/a><\/p>$/ );
    assert.match( t.value, /target="_blank"/ );
    assert.match( t.value, /class="important"/ );
    // editing it again shows the stored values
    inst.editor.commands.setTextSelection( 6 );
    inst.toolbar.controls.link.click();
    const again = document.querySelector( '.exp-oe-dialog' );
    assert.equal( again.querySelector( '.exp-oe-field input[type="text"]' ).value, 'eznode://12' );
    again.querySelector( '.exp-oe-dialog-close' ).click();
} );

test( 'table dialog inserts an ezoe table with class, border and width', () => {
    const t = textarea( '<p>before</p>' );
    const inst = X.init( t, Object.assign( {}, OPTIONS, { tableDefinitions: { table: { classes: { list: 'List' }, attributes: [], defaults: { width: '100%', border: '1' } } } } ) );
    inst.editor.commands.setTextSelection( 7 );
    inst.toolbar.controls.table.click();
    const dlg = document.querySelector( '.exp-oe-dialog' );
    const nums = dlg.querySelectorAll( 'input[type="number"]' );
    nums[0].value = '2';
    nums[1].value = '3';
    dlg.querySelector( 'select' ).value = 'list';
    dlg.querySelector( '.exp-oe-primary' ).click();
    assert.match( t.value, /<table[^>]*class="list"/ );
    assert.match( t.value, /<table[^>]*border="1"/ );
    assert.match( t.value, /<table[^>]*width="100%"/ );
    assert.equal( ( t.value.match( /<td/g ) || [] ).length, 6 );
} );

test( 'anchor dialog inserts an ezoe anchor', () => {
    const t = textarea( '<p>here</p>' );
    const inst = X.init( t, OPTIONS );
    inst.editor.commands.setTextSelection( 1 );
    inst.toolbar.controls.anchor.click();
    const dlg = document.querySelector( '.exp-oe-dialog' );
    dlg.querySelector( 'input' ).value = 'top';
    dlg.querySelector( '.exp-oe-primary' ).click();
    assert.match( t.value, /<a[^>]*name="top"[^>]*><\/a>here/ );
} );

test( 'custom tag dialog wraps blocks in an ezoe block custom tag', () => {
    const t = textarea( '<p>box text</p>' );
    const inst = X.init( t, Object.assign( {}, OPTIONS, {
        buttons: [ 'custom' ],
        customTags: [ { name: 'factbox', title: 'Fact box', inline: false, icon: '', attributes: [ { id: 'title', name: 'Title', type: 'text', required: false, default: '' } ] } ]
    } ) );
    inst.editor.commands.setTextSelection( { from: 0, to: inst.editor.state.doc.content.size } );
    inst.toolbar.controls.custom.click();
    const dlg = document.querySelector( '.exp-oe-dialog' );
    dlg.querySelector( '.exp-oe-custom-attributes input' ).value = 'Facts';
    dlg.querySelector( '.exp-oe-primary' ).click();
    assert.match( t.value, /^<div[^>]*class="ezoeItemCustomTag factbox"[^>]*>/ );
    assert.match( t.value, /customattributes="title\|Facts"/ );
    assert.match( t.value, /<p>box text<\/p><\/div>/ );
} );

test( 'real fixtures load and stay untouched until edited', () => {
    const dir = resolve( root, 'tests/fixtures' );
    const files = readdirSync( dir ).filter( ( f ) => f.endsWith( '.html' ) ).slice( 0, 12 );
    assert.ok( files.length > 0 );
    for ( const f of files ) {
        const html = readFileSync( resolve( dir, f ), 'utf8' );
        const t = textarea( html );
        const inst = X.init( t, OPTIONS );
        form.dispatchEvent( new Event( 'submit', { cancelable: true } ) );
        assert.equal( t.value, html, f + ' unchanged' );
        assert.equal( typeof inst.getHTML(), 'string' );
        X.destroy( t );
    }
} );

test( 'every fixture posts exactly what the schema round trip expects (toEditorHTML( fromEditorHTML( html ) ))', async () => {
    const S = await import( '../../../src/js/schema/index.js' );
    const dir = resolve( root, 'tests/fixtures' );
    const files = readdirSync( dir ).filter( ( f ) => f.endsWith( '.html' ) );
    let checked = 0;
    for ( const f of files ) {
        const html = readFileSync( resolve( dir, f ), 'utf8' );
        const t = textarea( html );
        const inst = X.init( t, OPTIONS );
        inst.dirty = true; // as after an edit that changed nothing
        form.dispatchEvent( new Event( 'submit', { cancelable: true } ) );
        const expected = S.normalizeEditorHTML( html );
        assert.equal( t.value, inst.editor.isEmpty ? '' : expected, f );
        X.destroy( t );
        checked++;
    }
    assert.equal( checked, files.length );
} );
