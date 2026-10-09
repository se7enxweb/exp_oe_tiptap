/**
 * AI hooks in the browser (node --test, happy-dom, fetch mocked; no network, no provider):
 * the client's request, the word diff, the suggestion panel with accept, insert below and reject.
 *
 * @license GPL-2.0-or-later
 */
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { GlobalRegistrator } from '@happy-dom/global-registrator';

let M, AI, D, form;

before( async () => {
    GlobalRegistrator.register( { url: 'https://example.test/admin/content/edit/1/1' } );
    M = await import( '../../../src/js/index.js' );
    AI = await import( '../../../src/js/ai/client.js' );
    D = await import( '../../../src/js/ai/diff.js' );
} );
after( async () => {
    await GlobalRegistrator.unregister();
} );
beforeEach( () => {
    document.body.innerHTML = '';
    form = document.createElement( 'form' );
    document.body.appendChild( form );
} );

/** fetch mock answering like ezjscore; records the requests */
function fakeFetch( answer, calls ) {
    return ( url, init ) => {
        const body = new URLSearchParams( init.body.toString() );
        calls.push( { url, init, body } );
        const content = typeof answer === 'function' ? answer( body ) : answer;
        return Promise.resolve( { ok: true, status: 200, json: () => Promise.resolve( content ) } );
    };
}

const tick = () => new Promise( ( r ) => setTimeout( r, 0 ) );

function editorWith( html, fetchImpl, ai ) {
    const t = document.createElement( 'textarea' );
    t.name = 'ContentObjectAttribute_data_text_7';
    t.value = html;
    form.appendChild( t );
    return { t, inst: new M.ExpOETiptapInstance( t, {
        buttons: [ 'bold' ], formToken: 'TOKEN', locale: 'en-GB', urls: { ezjscore: '/site/ezjscore/' },
        ai: Object.assign( { enabled: true, commands: [ 'improve', 'shorten', 'translate', 'continue', 'summarise' ] }, ai || {} )
    }, { fetch: fetchImpl } ) };
}

test( 'client posts command, text, token and locale to expoetiptap::ai', async () => {
    const calls = [];
    const c = new AI.AIClient( { ezjscoreUrl: '/site/ezjscore', formToken: 'T0K', locale: 'de-DE' },
        fakeFetch( { error_text: '', content: { text: 'Better.', command: 'improve', model: 'm1' } }, calls ) );
    const r = await c.run( { command: 'improve', text: 'Good.' } );
    assert.deepEqual( r, { text: 'Better.', command: 'improve', model: 'm1' } );
    assert.equal( calls[0].url, '/site/ezjscore/call' );
    assert.equal( calls[0].init.method, 'POST' );
    assert.equal( calls[0].body.get( 'ezjscServer_function_arguments' ), 'expoetiptap::ai' );
    assert.equal( calls[0].body.get( 'ezxform_token' ), 'T0K' );
    assert.equal( calls[0].init.headers['X-CSRF-Token'], 'T0K' );
    assert.equal( calls[0].body.get( 'command' ), 'improve' );
    assert.equal( calls[0].body.get( 'text' ), 'Good.' );
    assert.equal( calls[0].body.get( 'locale' ), 'de-DE' );
} );

test( 'client reports server errors, empty input and too long input', async () => {
    const calls = [];
    const c = new AI.AIClient( { maxInputLength: 10 }, fakeFetch( { error_text: 'AI is disabled', content: null }, calls ) );
    await assert.rejects( c.run( { command: 'improve', text: 'abc' } ), /AI is disabled/ );
    await assert.rejects( c.run( { command: 'improve', text: '   ' } ), /no text/ );
    await assert.rejects( c.run( { command: 'improve', text: 'x'.repeat( 11 ) } ), /too long/ );
    assert.equal( calls.length, 1, 'nothing sent for invalid input' );
} );

test( 'textToParagraphs escapes and splits paragraphs', () => {
    assert.equal( AI.textToParagraphs( 'a <b>\n\nline1\nline2' ), '<p>a &lt;b&gt;</p><p>line1<br>line2</p>' );
} );

test( 'word diff marks removed and added words', () => {
    const d = D.diffWords( 'The quick brown fox', 'The slow brown fox jumps' );
    assert.deepEqual( d, [
        { type: 'same', text: 'The ' }, { type: 'del', text: 'quick' }, { type: 'add', text: 'slow' },
        { type: 'same', text: ' brown fox' }, { type: 'add', text: ' jumps' }
    ] );
    assert.equal( D.diffWords( 'a', 'a' ).length, 1 );
    const big = D.diffWords( 'w '.repeat( 3000 ), 'v '.repeat( 3000 ) );
    assert.deepEqual( big.map( ( p ) => p.type ), [ 'del', 'add' ], 'large input falls back to replace' );
} );

test( 'AI button appears only when enabled, the menu lists the commands', () => {
    const off = editorWith( '<p>x</p>', fakeFetch( {}, [] ), { enabled: false } );
    assert.equal( off.inst.toolbar.controls.ai, undefined );
    const { inst } = editorWith( '<p>x</p>', fakeFetch( {}, [] ) );
    inst.toolbar.controls.ai.click();
    const items = Array.prototype.map.call( inst.wrapper.querySelectorAll( '.exp-oe-menu-item' ), ( b ) => b.getAttribute( 'data-command' ) );
    assert.deepEqual( items, [ 'improve', 'shorten', 'translate', 'continue', 'summarise' ] );
} );

test( 'suggestion for the selection: diff preview, editor locked, accept replaces the selection', async () => {
    const calls = [];
    const { t, inst } = editorWith( '<p>Hello wonderful world</p><p>Rest</p>', fakeFetch( { content: { text: 'Hello world', command: 'shorten', model: 'fake' } }, calls ) );
    inst.editor.commands.setTextSelection( { from: 1, to: 22 } );
    const p = inst.ai.start( 'shorten' );
    assert.equal( inst.editor.isEditable, false, 'locked while the suggestion is pending' );
    await p;
    await tick();
    assert.equal( calls[0].body.get( 'text' ), 'Hello wonderful world' );
    const preview = inst.wrapper.querySelector( '.exp-oe-ai-preview' );
    assert.equal( preview.querySelector( 'del' ).textContent, 'wonderful ' );
    assert.equal( t.value, '<p>Hello wonderful world</p><p>Rest</p>', 'nothing changes before accepting' );
    inst.wrapper.querySelector( '[data-action="Accept"]' ).click();
    assert.equal( t.value, '<p>Hello world</p><p>Rest</p>' );
    assert.equal( inst.editor.isEditable, true );
    assert.equal( inst.ai.element.hidden, true );
} );

test( 'reject keeps the document, insert below adds paragraphs after the block', async () => {
    const { t, inst } = editorWith( '<p>One two</p><p>Three</p>', fakeFetch( { content: { text: 'Summary line', command: 'summarise' } }, [] ) );
    inst.editor.commands.setTextSelection( { from: 1, to: 8 } );
    await inst.ai.start( 'improve' );
    await tick();
    inst.wrapper.querySelector( '[data-action="Reject"]' ).click();
    assert.equal( t.value, '<p>One two</p><p>Three</p>' );
    inst.editor.commands.setTextSelection( { from: 1, to: 8 } );
    await inst.ai.start( 'summarise' );
    await tick();
    inst.wrapper.querySelector( '[data-action="Insert below"]' ).click();
    assert.equal( t.value, '<p>One two</p><p>Summary line</p><p>Three</p>' );
} );

test( 'continue writing inserts at the cursor with the text before it as context', async () => {
    const calls = [];
    const { t, inst } = editorWith( '<p>Once upon a time</p>', fakeFetch( { content: { text: 'there was a CMS.' } }, calls ) );
    inst.editor.commands.setTextSelection( 17 );
    await inst.ai.start( 'continue' );
    await tick();
    assert.equal( calls[0].body.get( 'command' ), 'continue' );
    assert.equal( calls[0].body.get( 'text' ), '<p>Once upon a time</p>', 'the context is sent as markup' );
    assert.equal( calls[0].body.get( 'format' ), 'markup' );
    inst.wrapper.querySelector( '[data-action="Insert"]' ).click();
    assert.equal( t.value, '<p>Once upon a time there was a CMS.</p>' );
} );

test( 'translate asks for the target language and sends it', async () => {
    const calls = [];
    const { inst } = editorWith( '<p>Hello</p>', fakeFetch( { content: { text: 'Hallo' } }, calls ) );
    inst.editor.commands.setTextSelection( { from: 1, to: 6 } );
    inst.ai.start( 'translate' );
    const select = inst.wrapper.querySelector( '.exp-oe-ai-language' );
    assert.ok( select );
    select.value = 'fr';
    inst.wrapper.querySelector( '[data-action="Translate"]' ).click();
    await tick();
    await tick();
    assert.equal( calls[0].body.get( 'language' ), 'fr' );
} );

test( 'whole document with a table: the table is kept as a placeholder, Accept is the default', async () => {
    const calls = [];
    const { t, inst } = editorWith( '<p>Text</p><table><tbody><tr><td><p>c</p></td></tr></tbody></table>',
        fakeFetch( ( body ) => ( { content: { text: body.get( 'text' ).replace( 'Text', 'New text' ) } } ), calls ) );
    inst.editor.commands.setTextSelection( 2 );
    await inst.ai.start( 'improve' );
    await tick();
    assert.equal( calls[0].body.get( 'text' ), '<p>Text</p>\n\u27E6T1\u27E7' );
    assert.ok( !inst.wrapper.querySelector( '.exp-oe-ai-warning' ) );
    assert.ok( inst.wrapper.querySelector( '.exp-oe-ai-chip[data-token="T1"]' ), 'the table is a chip in the preview' );
    assert.ok( inst.wrapper.querySelector( '[data-action="Accept"]' ).classList.contains( 'exp-oe-primary' ) );
    inst.wrapper.querySelector( '[data-action="Accept"]' ).click();
    assert.equal( t.value, '<p>New text</p><table><tbody><tr><td><p>c</p></td></tr></tbody></table>' );
} );

test( 'server error is shown with try again', async () => {
    const { inst } = editorWith( '<p>Hello</p>', fakeFetch( { error_text: 'You are not allowed to use the AI assistant' }, [] ) );
    inst.editor.commands.setTextSelection( { from: 1, to: 6 } );
    await inst.ai.start( 'improve' );
    await tick();
    assert.match( inst.wrapper.querySelector( '.exp-oe-ai-error' ).textContent, /not allowed/ );
    assert.ok( inst.wrapper.querySelector( '[data-action="Try again"]' ) );
    inst.wrapper.querySelector( '[data-action="Close"]' ).click();
    assert.equal( inst.editor.isEditable, true );
} );
