/**
 * The AI assistant of the editor: a menu of commands on the toolbar button and a suggestion panel
 * under the toolbar. The input is the selection, or the whole document when nothing is selected.
 * The answer is shown as a suggestion (word diff for rewriting commands, the new text for summarise
 * and continue); the editor stays read-only until it is accepted or rejected, so the range the
 * suggestion replaces cannot move.
 */
import { h, clear } from './dom.js';
import { AIClient, BUILTIN_COMMANDS, COMMAND_LABELS, textToParagraphs } from '../ai/client.js';
import { diffWords } from '../ai/diff.js';

const INSERT_COMMANDS = { summarise: true, continue: true };
const CONTINUE_CONTEXT = 4000;

const LANGUAGES = [
    [ 'en', 'English' ], [ 'de', 'German' ], [ 'fr', 'French' ], [ 'es', 'Spanish' ], [ 'it', 'Italian' ],
    [ 'nl', 'Dutch' ], [ 'pl', 'Polish' ], [ 'pt', 'Portuguese' ], [ 'sv', 'Swedish' ], [ 'da', 'Danish' ],
    [ 'no', 'Norwegian' ], [ 'fi', 'Finnish' ], [ 'cs', 'Czech' ], [ 'ru', 'Russian' ], [ 'uk', 'Ukrainian' ],
    [ 'tr', 'Turkish' ], [ 'el', 'Greek' ], [ 'ja', 'Japanese' ], [ 'zh', 'Chinese' ]
];

export class AIPanel {
    /**
     * @param {Object} ctx editor context ({ editor, options, t, instance, schema })
     * @param {Function} fetchImpl optional fetch for tests
     */
    constructor( ctx, fetchImpl ) {
        this.ctx = ctx;
        const ai = ctx.options.ai || {};
        this.commands = ( ai.commands && ai.commands.length ? ai.commands : BUILTIN_COMMANDS ).slice();
        this.labels = Object.assign( {}, COMMAND_LABELS, ai.labels || {} );
        this.languages = ai.languages && ai.languages.length ? ai.languages : LANGUAGES;
        this.client = new AIClient( {
            ezjscoreUrl: ( ctx.options.urls && ctx.options.urls.ezjscore ) || '/ezjscore/',
            formToken: ctx.options.formToken,
            call: ai.call || 'expoetiptap::ai',
            locale: ctx.options.locale,
            maxInputLength: ai.maxInputLength || 20000
        }, fetchImpl );
        this.menu = null;
        this.pending = null;
        this.element = h( 'div', { class: 'exp-oe-ai-panel', hidden: true, role: 'region', 'aria-label': ctx.t( 'AI suggestion' ) } );
        this.onDocClick = ( e ) => {
            if ( this.menu && !this.menu.contains( e.target ) && !( this.anchor && this.anchor.contains( e.target ) ) )
                this.closeMenu();
        };
    }

    // ------------------------------------------------------------ menu

    openMenu( anchor ) {
        if ( this.menu ) {
            this.closeMenu();
            return;
        }
        const { t } = this.ctx;
        this.anchor = anchor;
        this.menu = h( 'div', { class: 'exp-oe-menu', role: 'menu' }, this.commands.map( ( c ) => h( 'button', {
            type: 'button', role: 'menuitem', class: 'exp-oe-menu-item', 'data-command': c, text: t( this.labels[c] || c ),
            onclick: () => {
                this.closeMenu();
                this.start( c );
            }
        } ) ) );
        const host = this.ctx.instance.wrapper;
        host.appendChild( this.menu );
        if ( anchor && anchor.offsetLeft !== undefined ) {
            this.menu.style.left = anchor.offsetLeft + 'px';
            this.menu.style.top = ( anchor.offsetTop + anchor.offsetHeight ) + 'px';
        }
        const first = this.menu.querySelector( 'button' );
        if ( first )
            first.focus();
        this.menu.addEventListener( 'keydown', ( e ) => {
            const items = Array.prototype.slice.call( this.menu.querySelectorAll( 'button' ) ), i = items.indexOf( document.activeElement );
            if ( e.key === 'Escape' ) {
                e.preventDefault();
                this.closeMenu();
                this.ctx.editor.commands.focus();
            } else if ( e.key === 'ArrowDown' || e.key === 'ArrowUp' ) {
                e.preventDefault();
                items[( i + ( e.key === 'ArrowDown' ? 1 : items.length - 1 ) ) % items.length].focus();
            }
        } );
        document.addEventListener( 'mousedown', this.onDocClick, true );
    }

    closeMenu() {
        if ( this.menu )
            this.menu.remove();
        this.menu = null;
        document.removeEventListener( 'mousedown', this.onDocClick, true );
    }

    // ------------------------------------------------------------ input

    /** { text, from, to, whole, inline, insertAt } of what the command works on */
    input( command ) {
        const { editor } = this.ctx, { state } = editor, sel = state.selection;
        if ( command === 'continue' ) {
            const at = sel.empty ? sel.from : sel.to;
            const before = state.doc.textBetween( 0, at, '\n\n', ' ' );
            return { text: before.slice( -CONTINUE_CONTEXT ), from: at, to: at, whole: false, inline: true, insertAt: at };
        }
        if ( !sel.empty ) {
            const inline = sel.$from.sameParent( sel.$to ) && sel.$from.parent.isTextblock;
            return { text: state.doc.textBetween( sel.from, sel.to, '\n\n', ' ' ), from: sel.from, to: sel.to, whole: false, inline };
        }
        let rich = false;
        state.doc.descendants( ( node ) => {
            if ( node.isAtom || node.type.spec.tableRole || /custom|embed|list/i.test( node.type.name ) )
                rich = true;
            return !rich;
        } );
        return { text: state.doc.textBetween( 0, state.doc.content.size, '\n\n', ' ' ), from: 0, to: state.doc.content.size, whole: true, inline: false, rich };
    }

    // ------------------------------------------------------------ run and preview

    start( command, language ) {
        if ( command === 'translate' && !language )
            return this.askLanguage();
        const input = this.input( command );
        this.lock( true );
        this.pending = { command, language, input, result: null };
        this.render( 'loading' );
        return this.client.run( { command, text: input.text, language } ).then( ( result ) => {
            if ( !this.pending || this.pending.command !== command )
                return;
            this.pending.result = result;
            this.render( 'ready' );
        }, ( e ) => {
            if ( e && e.name === 'AbortError' )
                return;
            if ( !this.pending )
                return;
            this.pending.error = e && e.message ? e.message : String( e );
            this.render( 'error' );
        } );
    }

    askLanguage() {
        const { t } = this.ctx;
        const choice = h( 'select', { class: 'exp-oe-ai-language', 'aria-label': t( 'Target language' ) },
            this.languages.map( ( [ v, label ] ) => h( 'option', { value: v, text: t( label ) } ) ) );
        const prefer = String( this.ctx.options.locale || '' ).slice( 0, 2 ).toLowerCase() === 'en' ? 'de' : 'en';
        choice.value = prefer;
        this.show( [
            h( 'div', { class: 'exp-oe-ai-head', text: t( 'Translate' ) } ),
            h( 'div', { class: 'exp-oe-ai-body' }, [ h( 'label', { text: t( 'Target language' ) + ' ' } ), choice ] ),
            this.buttons( [
                [ 'Translate', () => this.start( 'translate', choice.value ), true ],
                [ 'Cancel', () => this.reject() ]
            ] )
        ] );
        choice.focus();
    }

    render( state ) {
        const { t } = this.ctx, p = this.pending;
        const head = h( 'div', { class: 'exp-oe-ai-head' }, [
            h( 'strong', { text: t( this.labels[p.command] || p.command ) + ( p.language ? ' (' + p.language + ')' : '' ) } ),
            h( 'span', { class: 'exp-oe-ai-scope', text: ' – ' + t( p.input.whole ? 'whole document' : ( p.command === 'continue' ? 'at the cursor' : 'selection' ) ) } )
        ] );
        if ( state === 'loading' ) {
            this.show( [ head, h( 'div', { class: 'exp-oe-ai-body exp-oe-ai-loading', text: t( 'Asking the AI assistant...' ) } ),
                         this.buttons( [ [ 'Cancel', () => this.reject() ] ] ) ] );
            return;
        }
        if ( state === 'error' ) {
            this.show( [ head, h( 'div', { class: 'exp-oe-ai-body exp-oe-ai-error', role: 'alert', text: p.error } ),
                         this.buttons( [ [ 'Try again', () => this.start( p.command, p.language ) ], [ 'Close', () => this.reject() ] ] ) ] );
            return;
        }
        const suggestion = p.result.text;
        const preview = h( 'div', { class: 'exp-oe-ai-preview', 'aria-live': 'polite' } );
        if ( INSERT_COMMANDS[p.command] ) {
            preview.appendChild( h( 'ins', { text: suggestion } ) );
        } else {
            for ( const part of diffWords( p.input.text, suggestion ) )
                preview.appendChild( part.type === 'same' ? document.createTextNode( part.text ) : h( part.type === 'add' ? 'ins' : 'del', { text: part.text } ) );
        }
        const body = [ head, preview ];
        if ( p.input.whole && p.input.rich && !INSERT_COMMANDS[p.command] )
            body.push( h( 'div', { class: 'exp-oe-ai-warning', text: t( 'Replacing the whole document keeps only plain paragraphs: embedded objects, tables, lists and custom tags would be lost. Insert below keeps them.' ) } ) );
        const actions = INSERT_COMMANDS[p.command]
            ? [ [ p.command === 'continue' ? 'Insert' : 'Insert below', () => this.accept( p.command === 'continue' ? 'at' : 'below' ), true ] ]
            : [ [ 'Accept', () => this.accept( 'replace' ), !( p.input.whole && p.input.rich ) ], [ 'Insert below', () => this.accept( 'below' ) ] ];
        actions.push( [ 'Try again', () => this.start( p.command, p.language ) ], [ 'Reject', () => this.reject() ] );
        body.push( this.buttons( actions ) );
        if ( p.result.model )
            body.push( h( 'div', { class: 'exp-oe-ai-model', text: t( 'Model' ) + ': ' + p.result.model } ) );
        this.show( body );
    }

    buttons( list ) {
        const { t } = this.ctx;
        return h( 'div', { class: 'exp-oe-ai-actions' }, list.map( ( [ label, fn, primary ] ) => h( 'button', {
            type: 'button', class: 'exp-oe-dialog-button' + ( primary ? ' exp-oe-primary' : '' ), 'data-action': label, text: t( label ), onclick: fn
        } ) ) );
    }

    show( children ) {
        clear( this.element );
        children.forEach( ( c ) => this.element.appendChild( c ) );
        this.element.hidden = false;
        const primary = this.element.querySelector( '.exp-oe-primary' );
        if ( primary )
            primary.focus();
    }

    lock( on ) {
        this.ctx.instance.setLocked( on );
    }

    /** mode: replace | below | at */
    accept( mode ) {
        const p = this.pending;
        if ( !p || !p.result )
            return;
        const { editor } = this.ctx, text = p.result.text, input = p.input;
        this.close();
        const chain = editor.chain().focus();
        if ( mode === 'at' ) {
            const lead = /\s$/.test( input.text ) || !input.text ? '' : ' ';
            chain.insertContentAt( input.insertAt, ( lead + text ).replace( /\n{2,}/g, '\n' ).split( '\n' ).map( escapeText ).join( '<br>' ) ).run();
        } else if ( mode === 'below' ) {
            const $to = editor.state.doc.resolve( input.to );
            const after = input.whole ? editor.state.doc.content.size : ( $to.depth ? $to.after( 1 ) : input.to );
            chain.insertContentAt( after, textToParagraphs( text ) ).run();
        } else if ( input.inline ) {
            chain.insertContentAt( { from: input.from, to: input.to }, text.replace( /\n{2,}/g, '\n' ).split( '\n' ).map( escapeText ).join( '<br>' ) ).run();
        } else {
            chain.insertContentAt( { from: input.from, to: input.to }, textToParagraphs( text ) ).run();
        }
        this.ctx.instance.sync();
    }

    reject() {
        this.client.abort();
        this.close();
        this.ctx.editor.commands.focus();
    }

    close() {
        this.pending = null;
        this.element.hidden = true;
        clear( this.element );
        this.lock( false );
    }

    destroy() {
        this.client.abort();
        this.closeMenu();
    }
}

function escapeText( s ) {
    return s.replace( /&/g, '&amp;' ).replace( /</g, '&lt;' ).replace( />/g, '&gt;' );
}
