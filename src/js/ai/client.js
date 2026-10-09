/**
 * Provider agnostic AI client: the browser only ever talks to the ezjscore server function
 * expoetiptap::ai of this installation. Which provider answers (OpenAI compatible, Anthropic, a
 * custom class) and with which key is decided on the server; the key never reaches the browser.
 *
 * Request (POST <ezjscore>/call, form encoded):
 *   ezjscServer_function_arguments = expoetiptap::ai
 *   ezxform_token  the form token
 *   command        improve | shorten | extend | fix_spelling | translate | summarise | continue | <custom>
 *   text           the input (selection or whole document): plain text, or with format=markup the structure
 *                  keeping markup of src/js/ai/structure.js (text, simple tags and placeholder tokens)
 *   format         text (default) | markup
 *   strict         1 for the second, stricter try after an answer that lost placeholders
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

/** texts of the client's errors: English in the message, translated by the panel through error.text (listed for strings.json) */
export const CLIENT_TEXTS = {
    noText: 'There is no text to work on',
    tooLong: 'The text is too long for the AI assistant (at most %max characters).',
    unavailable: 'The AI assistant is not available (HTTP %status).',
    empty: 'Empty answer from the server',
    unexpected: 'Unexpected answer from the server'
};

/** an Error whose English message is filled in, with text and replacements kept for the translation */
function failure( text, replacements ) {
    let message = text;
    for ( const [ k, v ] of Object.entries( replacements || {} ) )
        message = message.split( k ).join( String( v ) );
    const e = new Error( message );
    e.text = text;
    e.replacements = replacements || null;
    return e;
}

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
            return Promise.reject( failure( CLIENT_TEXTS.noText ) );
        if ( text.length > o.maxInputLength )
            return Promise.reject( failure( CLIENT_TEXTS.tooLong, { '%max': o.maxInputLength } ) );
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
        if ( request.format )
            body.append( 'format', request.format );
        if ( request.strict )
            body.append( 'strict', '1' );
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
                throw failure( CLIENT_TEXTS.unavailable, { '%status': r.status } );
            return r.json();
        } ).then( ( data ) => {
            if ( this.controller === controller )
                this.controller = null;
            if ( !data )
                throw failure( CLIENT_TEXTS.empty );
            if ( data.error_text )
                throw new Error( data.error_text );
            const c = data.content || {};
            if ( typeof c.text !== 'string' )
                throw failure( CLIENT_TEXTS.unexpected );
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
