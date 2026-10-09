/**
 * Builds the exp_oe_tiptap browser bundle with esbuild.
 *
 *   node build.mjs          minified bundle + stylesheet (committed files)
 *   node build.mjs --dev    readable bundle with inline source map, not for committing
 *
 * Output:
 *   design/standard/javascript/exp_oe_tiptap/exp_oe_tiptap.js    one classic script (IIFE), window.ExpOETiptap
 *   design/standard/stylesheets/exp_oe_tiptap/exp_oe_tiptap.css  toolbar, status bar, dialogs, content
 *
 * The schema of the ezoe HTML dialect lives in src/js/schema/index.js. While that file does not
 * exist yet, '#ezoe-schema' resolves to the small fallback in src/js/editor/fallback-schema.js so the
 * editor can still be built and tried.
 */
import { build } from 'esbuild';
import { existsSync, statSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname( fileURLToPath( import.meta.url ) );
const dev = process.argv.includes( '--dev' );
const schemaFile = resolve( root, 'src/js/schema/index.js' );
const fallbackFile = resolve( root, 'src/js/editor/fallback-schema.js' );

const schemaPlugin = {
    name: 'exp-oe-schema',
    setup( b ) {
        b.onResolve( { filter: /^#ezoe-schema$/ }, () => {
            const usable = existsSync( schemaFile );
            if ( !usable )
                console.warn( 'NOTE  src/js/schema/index.js missing, building with the fallback schema' );
            return { path: usable ? schemaFile : fallbackFile };
        } );
    }
};

const banner = '/*! exp_oe_tiptap - Tiptap online editor for Exponential. GPL-2.0-or-later.\n' +
               ' *  Bundles Tiptap and ProseMirror (MIT), see https://tiptap.dev and https://prosemirror.net */';

await build( {
    entryPoints: [ resolve( root, 'src/js/index.js' ) ],
    outfile: resolve( root, 'design/standard/javascript/exp_oe_tiptap/exp_oe_tiptap.js' ),
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: [ 'chrome100', 'firefox100', 'safari15.4', 'edge100' ],
    minify: !dev,
    sourcemap: dev ? 'inline' : false,
    legalComments: 'eof',
    banner: { js: banner },
    define: { 'process.env.NODE_ENV': dev ? '"development"' : '"production"' },
    plugins: [ schemaPlugin ],
    logLevel: 'info'
} );

await build( {
    entryPoints: [ resolve( root, 'src/css/exp_oe_tiptap.css' ) ],
    outfile: resolve( root, 'design/standard/stylesheets/exp_oe_tiptap/exp_oe_tiptap.css' ),
    bundle: true,
    minify: !dev,
    banner: { css: '/* exp_oe_tiptap editor skin. GPL-2.0-or-later. */' },
    logLevel: 'info'
} );

// strings.json: every text the UI passes through t(), for the translation file (context extension/exp_oe_tiptap)
const strings = new Set();
const patterns = [
    /\bt\(\s*'((?:[^'\\]|\\.)+)'/g,                    // t( 'text' )
    /\btitle:\s*'((?:[^'\\]|\\.)+)'/g,                 // button titles
    /\[\s*'[\w.+\/ ,-]*',\s*'((?:[^'\\]|\\.)+)'\s*\]/g, // [ value, 'label' ] lists (formats, languages, shortcuts)
    /\[\s*'((?:[^'\\]|\\.)+)',\s*\(\)\s*=>/g,          // [ 'label', () => ... ] action buttons
    /^\s{4}\w+:\s*'((?:[^'\\]|\\.)+)',?$/gm            // COMMAND_LABELS entries
];
for ( const dir of [ 'src/js/editor', 'src/js/ui', 'src/js/ai' ] ) {
    for ( const file of readdirSync( resolve( root, dir ) ).filter( ( f ) => f.endsWith( '.js' ) && f !== 'fallback-schema.js' ) ) {
        const source = readFileSync( resolve( root, dir, file ), 'utf8' );
        for ( const re of patterns ) {
            for ( const m of source.matchAll( re ) ) {
                const s = m[1].replace( /\\'/g, "'" );
                if ( /[A-Za-z]/.test( s ) && !/^(mce_|exp-oe|expoetiptap::|https?:|\/)/.test( s ) && !/^[a-z_-]+$/.test( s ) )
                    strings.add( s );
            }
        }
    }
}
writeFileSync( resolve( root, 'design/standard/javascript/exp_oe_tiptap/strings.json' ), JSON.stringify( [ ...strings ].sort(), null, 1 ) + '\n' );
console.log( 'STRINGS  ' + strings.size + ' texts in design/standard/javascript/exp_oe_tiptap/strings.json' );

for ( const f of [ 'design/standard/javascript/exp_oe_tiptap/exp_oe_tiptap.js', 'design/standard/stylesheets/exp_oe_tiptap/exp_oe_tiptap.css' ] )
    console.log( 'SIZE  ' + f + '  ' + statSync( resolve( root, f ) ).size + ' bytes' );
