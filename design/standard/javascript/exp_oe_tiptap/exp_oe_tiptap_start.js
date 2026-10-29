/**
 * Starts the Tiptap editor of every ezxmltext attribute on the page (ezxmltext_exp_oe_tiptap_editor.tpl) from a file,
 * so the edit page carries no inline script and runs under a Content Security Policy without 'unsafe-inline'.
 *
 * The template writes each editor's options as JSON, <script type="application/json"
 * data-exp-oe-options-for="<textarea id>">, after the textarea. This file is loaded once per page with defer and
 * calls window.ExpOETiptap.init( textarea, options ) (the built bundle) for each of them, once the bundle is there:
 * at once when it is or the page is no longer loading (document.readyState is not 'loading'), else when the page is
 * parsed (the bundle may be loaded at the end of the page with ezjscore). Without the bundle once the page is parsed,
 * it waits for DOMContentLoaded or load, whichever comes first, so an editor added between the two still starts.
 * expOETiptapStart( id, options ) stays global as before; expOETiptapStartAll() starts the editors added later.
 * Included more than once on a page (the template may include it once per editor), the file defines nothing again
 * and only starts the editors that have not started yet.
 *
 * @copyright Copyright (C) 1998 - 2026 Exponential Foundation and 7x. All rights reserved.
 * @license GNU General Public License v2.0 (or any later version)
 */
( function( window, document )
{
    'use strict';

    // already loaded on this page: start what is new, define nothing twice
    if ( typeof window.expOETiptapStartAll === 'function' && window.expOETiptapStartAll.expOETiptapStart === true )
    {
        window.expOETiptapStartAll();
        return;
    }

    function error( message, detail )
    {
        if ( window.console )
            window.console.error( 'exp_oe_tiptap: ' + message, detail === undefined ? '' : detail );
    }

    // Starts Tiptap on one textarea, now when the bundle is there or the page is parsed, else when it is
    function expOETiptapStart( id, options )
    {
        var started = false;
        var start = function()
        {
            if ( started )
                return;
            started = true;
            document.removeEventListener( 'DOMContentLoaded', start );
            window.removeEventListener( 'load', start );
            var textarea = document.getElementById( id );
            if ( !textarea )
                return;
            if ( !window.ExpOETiptap || typeof window.ExpOETiptap.init !== 'function' )
            {
                // The plain textarea stays usable: it holds the editor HTML and is posted as it is
                error( 'the editor bundle is not loaded, editing ' + id + ' as plain text' );
                return;
            }
            window.ExpOETiptap.init( textarea, options );
        };
        if ( window.ExpOETiptap || document.readyState === 'complete' )
            start();
        else if ( document.readyState !== 'loading' )
        {
            // parsed, bundle not there yet: DOMContentLoaded may have fired already, so load counts as well
            document.addEventListener( 'DOMContentLoaded', start );
            window.addEventListener( 'load', start );
        }
        else
            document.addEventListener( 'DOMContentLoaded', start );
    }

    // Every options block that has not started its editor yet
    function expOETiptapStartAll()
    {
        var blocks = document.querySelectorAll( 'script[data-exp-oe-options-for]' );
        for ( var i = 0; i < blocks.length; i++ )
        {
            var block = blocks[i], id = block.getAttribute( 'data-exp-oe-options-for' ), options;
            if ( !id || block.getAttribute( 'data-exp-oe-started' ) === '1' )
                continue;
            block.setAttribute( 'data-exp-oe-started', '1' );
            try
            {
                options = JSON.parse( block.textContent );
            }
            catch ( e )
            {
                error( 'the options of ' + id + ' are not valid JSON, editing it as plain text', e );
                continue;
            }
            expOETiptapStart( id, options );
        }
    }

    window.expOETiptapStart = expOETiptapStart;
    expOETiptapStartAll.expOETiptapStart = true;
    window.expOETiptapStartAll = expOETiptapStartAll;
    expOETiptapStartAll();
} )( window, document );
