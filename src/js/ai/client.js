/**
 * Provider agnostic AI client: the browser only ever talks to the ezjscore server function
 * expoetiptap::ai of this installation. Which provider answers (OpenAI compatible, Anthropic, a
 * custom class) and with which key is decided on the server; the key never reaches the browser.
 *
 * Request (POST <ezjscore>/call, form encoded):
 *   ezjscServer_function_arguments = expoetiptap::ai
 *   ezxform_token  the form token
 *   command        improve | shorten | extend | fix_spelling | translate | summarise | continue | <custom>
 *   text           the input (selection or whole document) as plain text
 *   language       target language for translate (e.g. "de" or "German")
 *   locale         the editor's locale, the language to answer in for the other commands
 * Response (ezjscore JSON): { error_text, content: { text, command, model } }
 */

export const BUILTIN_COMMANDS = [ 'improve', 'shorten', 'extend', 'fix_spelling', 'translate', 'summarise', 'continue' ];

export const COMMAND_LABELS = {
    improve: 'Improve writing',
    shorten: 'Make shorter',
    extend: 'Make longer',
    fix_spelling: 'Fix spelling and grammar',
    translate: 'Translate',
    summarise: 'Summarise',
    continue: 'Continue writing'
};

export class AIClient {
    /**
     * @param {Object} options { ezjscoreUrl, formToken, call ('expoetiptap::ai'), locale, maxInputLength }
     * @param {Function} fetchImpl injectable fetch for tests
     */
    constructor( options, fetchImpl ) {
        this.options = Object.assign( { call: 'expoetiptap::ai', maxInputLength: 20000 }, options || {} );
        this.fetch = fetchImpl || ( ( ...a ) => window.fetch( ...a ) );
        this.controller = null;
    }

    /** Cancels the running request, if any */
    abort() {
        if ( this.controller )
            this.controller.abort();
        this.controller = null;
    }

    /**
     * @param {Object} request { command, text, language }
     * @return Promise of { text, command, model }
     */
    run( request ) {
        const o = this.options;
        const text = String( request.text || '' );
        if ( !text.trim() && request.command !== 'continue' )
            return Promise.reject( new Error( 'There is no text to work on' ) );
        if ( text.length > o.maxInputLength )
            return Promise.reject( new Error( 'The text is too long for the AI assistant (' + text.length + ' > ' + o.maxInputLength + ' characters)' ) );
        this.abort();
        const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
        this.controller = controller;
        const body = new URLSearchParams();
        body.append( 'ezjscServer_function_arguments', o.call );
        body.append( 'ezxform_token', o.formToken || '' );
        body.append( 'command', request.command );
        body.append( 'text', text );
        if ( request.language )
            body.append( 'language', request.language );
        if ( o.locale )
            body.append( 'locale', o.locale );
        const url = String( o.ezjscoreUrl || '/ezjscore/' ).replace( /\/?$/, '/' ) + 'call';
        return this.fetch( url, {
            method: 'POST',
            body,
            credentials: 'same-origin',
            headers: { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest', 'X-CSRF-Token': o.formToken || '' },
            signal: controller ? controller.signal : undefined
        } ).then( ( r ) => {
            if ( !r.ok )
                throw new Error( 'The AI assistant is not available (HTTP ' + r.status + ')' );
            return r.json();
        } ).then( ( data ) => {
            if ( this.controller === controller )
                this.controller = null;
            if ( !data )
                throw new Error( 'Empty answer from the server' );
            if ( data.error_text )
                throw new Error( data.error_text );
            const c = data.content || {};
            if ( typeof c.text !== 'string' )
                throw new Error( 'Unexpected answer from the server' );
            return { text: c.text, command: c.command || request.command, model: c.model || '' };
        } );
    }
}

/** Plain text -> HTML paragraphs (blank line separates paragraphs, single newline becomes <br>) */
export function textToParagraphs( text ) {
    const esc = ( s ) => s.replace( /&/g, '&amp;' ).replace( /</g, '&lt;' ).replace( />/g, '&gt;' );
    return String( text ).replace( /\r\n?/g, '\n' ).trim().split( /\n{2,}/ )
        .map( ( p ) => '<p>' + esc( p.trim() ).replace( /\n/g, '<br>' ) + '</p>' ).join( '' );
}
