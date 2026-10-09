/**
 * Step 1 of the round trip test: every fixture's ezoe editor HTML -> Tiptap document -> ezoe editor HTML.
 * Writes <outdir>/<name>.html for tests/php/roundtrip/run.php, which feeds it to eZOEInputParser.
 *
 *   node tests/js/schema/roundtrip.mjs <outdir>
 *
 * @license GPL-2.0-or-later
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Window } from 'happy-dom';
import { fromEditorHTML, toEditorHTML, cleanupForEzoe } from '../../../src/js/schema/index.js';

const root = resolve( dirname( fileURLToPath( import.meta.url ) ), '../../..' );
const fixtures = resolve( root, 'tests/fixtures' );
const outdir = process.argv[ 2 ];
if ( !outdir ) {
    console.log( 'FAIL usage: node tests/js/schema/roundtrip.mjs <outdir>' );
    process.exit( 1 );
}
mkdirSync( outdir, { recursive: true } );

const window = new Window();
const options = { document: window.document };

/**
 * The baseline: what ezoe's TinyMCE would post for the same content without Tiptap, approximated as the HTML after
 * the browser parsed it, TinyMCE's bogus elements removed (their children kept) and the ezoe save clean-ups made.
 */
function ezoeBaseline( html ) {
    const container = window.document.createElement( 'div' );
    container.innerHTML = html;
    container.querySelectorAll( '[data-mce-bogus]' ).forEach( node => {
        while ( node.firstChild )
            node.parentNode.insertBefore( node.firstChild, node );
        node.parentNode.removeChild( node );
    } );
    container.querySelectorAll( '[data-mce-href]' ).forEach( node => node.removeAttribute( 'data-mce-href' ) );
    cleanupForEzoe( container );
    return container.innerHTML;
}
let count = 0;
let unstable = 0;
for ( const file of readdirSync( fixtures ).filter( name => name.endsWith( '.html' ) ).sort() ) {
    const html = readFileSync( resolve( fixtures, file ), 'utf8' );
    const out = toEditorHTML( fromEditorHTML( html, options ), options );
    const again = toEditorHTML( fromEditorHTML( out, options ), options );
    if ( again !== out ) {
        unstable++;
        console.log( 'UNSTABLE ' + file );
    }
    writeFileSync( resolve( outdir, file ), out );
    writeFileSync( resolve( outdir, file.replace( /\.html$/, '.ezoe.html' ) ), ezoeBaseline( html ) );
    count++;
}
await window.happyDOM.close();
console.log( ( unstable ? 'FAIL' : 'PASS' ) + ` ${count} fixtures through Tiptap, ${unstable} not stable on a second pass, written to ${outdir}` );
process.exit( unstable ? 1 : 0 );
