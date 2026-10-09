/**
 * The AI assistant of the editor: a menu of commands on the toolbar button and a suggestion panel
 * under the toolbar. The input is the selection, or the whole document when nothing is selected.
 *
 * The input is sent as structure keeping markup (src/js/ai/structure.js): text with simple tags and
 * placeholder tokens for everything that is not text. The answer is checked (every token back exactly
 * once, every link kept), rebuilt with the original nodes and shown as a word diff with the items as
 * chips. The editor stays read-only until the suggestion is accepted or rejected, so the range the
 * suggestion replaces cannot move.
 *
 * Commands that rewrite (improve, shorten, extend, fix spelling, translate, custom commands) replace
 * the input and must keep every item. Summarise and continue add new text next to the input, which
 * stays as it is; their answer holds no items.
 */
import { Fragment } from '@tiptap/pm/model';
import { h, clear } from './dom.js';
import { AIClient, BUILTIN_COMMANDS, COMMAND_LABELS } from '../ai/client.js';
import { diffWords } from '../ai/diff.js';
import { serialize, validate, rebuild, sliceLike, displayText, stripTokens, TOKEN_RE } from '../ai/structure.js';

const INSERT_COMMANDS = { summarise: true, continue: true };
const CONTINUE_CONTEXT = 4000;
const CHIP_SPLIT = /(⟦[A-Z]\d+⟧)/;

/** texts translated at run time (chip labels of the items, input errors); listed here for strings.json */
const TEXTS = {
    image: 'Image',
    object: 'Object',
    inlineObject: 'Inline object',
    customTag: 'Custom tag',
    anchor: 'Anchor',
    table: 'Table',
    literal: 'Literal',
    noText: 'There is no text to work on',
    cellSelection: 'Select text inside one table cell, or text outside the table.'
};

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

    /**
     * What the command works on: { text (markup), map, from, to, whole, inline, parent, slice, insertAt }
     * or { error }.
     */
    input( command ) {
        const { editor } = this.ctx, { state } = editor, sel = state.selection;
        if ( command === 'continue' ) {
            const at = sel.empty ? sel.from : sel.to;
            const { markup, map } = serialize( { mode: 'blocks', content: state.doc.slice( 0, at ).content } );
            return { text: tail( markup, CONTINUE_CONTEXT ), map, from: at, to: at, whole: false, inline: true, insertAt: at };
        }
        if ( !sel.empty ) {
            if ( sel.$anchorCell )
                return { error: TEXTS.cellSelection };
            if ( sel.$from.sameParent( sel.$to ) && sel.$from.parent.isTextblock ) {
                const parent = sel.$from.parent;
                const { markup, map } = serialize( { mode: 'inline', parent, content: parent.content.cut( sel.$from.parentOffset, sel.$to.parentOffset ) } );
                return { text: markup, map, from: sel.from, to: sel.to, whole: false, inline: true, parent };
            }
            const slice = state.doc.slice( sel.from, sel.to );
            const { markup, map } = serialize( { mode: 'blocks', content: slice.content } );
            return { text: markup, map, from: sel.from, to: sel.to, whole: false, inline: false, slice };
        }
        const slice = state.doc.slice( 0, state.doc.content.size );
        const { markup, map } = serialize( { mode: 'blocks', content: slice.content } );
        return { text: markup, map, from: 0, to: state.doc.content.size, whole: true, inline: false, slice };
    }

    // ------------------------------------------------------------ run and preview

    start( command, language ) {
        if ( command === 'translate' && !language )
            return this.askLanguage();
        const input = this.input( command );
        this.lock( true );
        this.pending = { command, language, input, result: null, retried: false };
        if ( !input.error && command !== 'continue' && !displayText( stripTokens( input.text ) ).trim() )
            input.error = TEXTS.noText;
        if ( input.error ) {
            this.pending.error = this.ctx.t( input.error );
            this.render( 'error' );
            return Promise.resolve();
        }
        this.render( 'loading' );
        return this.ask( false );
    }

    /** one request; an answer that lost or invented items is asked for once more, with a stricter instruction */
    ask( strict ) {
        const p = this.pending, { command, language, input } = p;
        return this.client.run( { command, text: input.text, language, format: 'markup', strict } ).then( ( result ) => {
            if ( this.pending !== p )
                return undefined;
            const check = validate( result.text, input.map, { allowDrop: !!INSERT_COMMANDS[command] } );
            if ( !check.ok && !p.retried ) {
                p.retried = true;
                return this.ask( true );
            }
            p.result = result;
            p.check = check;
            this.render( 'ready' );
            return undefined;
        }, ( e ) => {
            if ( e && e.name === 'AbortError' )
                return;
            if ( this.pending !== p )
                return;
            p.error = e && e.message ? e.message : String( e );
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

    /** text with the tokens as chips */
    chips( parent, text, map ) {
        for ( const piece of text.split( CHIP_SPLIT ) ) {
            if ( !piece )
                continue;
            const m = /^⟦([A-Z]\d+)⟧$/.exec( piece );
            if ( !m ) {
                parent.appendChild( document.createTextNode( piece ) );
                continue;
            }
            const token = map.tokens.get( m[1] );
            const label = token ? this.ctx.t( token.label.replace( /:.*$/, '' ) ) + token.label.replace( /^[^:]*/, '' ) : '?';
            parent.appendChild( h( 'span', { class: 'exp-oe-ai-chip' + ( token ? '' : ' exp-oe-ai-chip-unknown' ), 'data-token': m[1], title: label, text: label } ) );
        }
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
            const actions = p.input.error ? [] : [ [ 'Try again', () => this.start( p.command, p.language ) ] ];
            actions.push( [ 'Close', () => this.reject() ] );
            this.show( [ head, h( 'div', { class: 'exp-oe-ai-body exp-oe-ai-error', role: 'alert', text: p.error } ), this.buttons( actions ) ] );
            return;
        }
        const insert = !!INSERT_COMMANDS[p.command], check = p.check, map = p.input.map;
        const preview = h( 'div', { class: 'exp-oe-ai-preview', 'aria-live': 'polite' } );
        if ( insert ) {
            const ins = h( 'ins' );
            this.chips( ins, displayText( stripTokens( p.result.text ) ), map );
            preview.appendChild( ins );
        } else {
            for ( const part of diffWords( displayText( p.input.text ), displayText( p.result.text ) ) ) {
                const holder = part.type === 'same' ? preview : preview.appendChild( h( part.type === 'add' ? 'ins' : 'del' ) );
                this.chips( holder, part.text, map );
            }
        }
        const body = [ head, preview ];
        const lost = check.problems;
        if ( insert && p.command === 'summarise' && map.tokens.size )
            body.push( h( 'div', { class: 'exp-oe-ai-note', text: t( 'A summary is text only: images, embedded objects, tables and custom tags stay in the original text.' ) } ) );
        let actions;
        if ( insert ) {
            actions = [ [ p.command === 'continue' ? 'Insert' : 'Insert below', () => this.accept( p.command === 'continue' ? 'at' : 'below' ), true ] ];
            actions.push( [ 'Try again', () => this.start( p.command, p.language ) ], [ 'Reject', () => this.reject() ] );
        } else if ( check.ok ) {
            if ( map.tokens.size || map.links.size )
                body.push( h( 'div', { class: 'exp-oe-ai-note', text: t( 'All %n items (images, objects, custom tags, anchors, tables, links) are kept in place.' ).replace( '%n', String( map.tokens.size + map.links.size ) ) } ) );
            actions = [ [ 'Accept', () => this.accept( 'replace' ), true ], [ 'Insert below', () => this.accept( 'below' ) ],
                        [ 'Try again', () => this.start( p.command, p.language ) ], [ 'Reject', () => this.reject() ] ];
        } else {
            body.push( h( 'div', { class: 'exp-oe-ai-warning', role: 'alert', text: lost
                ? t( 'The assistant changed or removed %n items (images, objects, custom tags, anchors, tables or links). Accept keeps every item: those it moved stay where it put them, missing ones are put back at the end of the new text. Insert below adds the new text without them and keeps the original.' ).replace( '%n', String( lost ) )
                : t( 'The answer contained formatting the editor does not use; it is left out.' ) } ) );
            actions = [ [ 'Insert below', () => this.accept( 'below' ), true ], [ 'Accept', () => this.accept( 'replace' ) ],
                        [ 'Try again', () => this.start( p.command, p.language ) ], [ 'Keep original', () => this.reject() ] ];
        }
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

    /**
     * The transaction that applies the suggestion. mode: replace | below | at
     * Rewrites are rebuilt with the original items; an answer that failed the check is repaired (each item
     * exactly once). Text inserted next to the input (below, at) holds no items and no links.
     */
    transaction( mode ) {
        const p = this.pending, { state } = this.ctx.editor, schema = state.schema, input = p.input, answer = p.result.text;
        const tr = state.tr;
        if ( mode === 'at' ) {
            const frag = rebuild( stripTokens( answer ), input.map, schema, { mode: 'blocks', tokens: false } );
            const at = input.insertAt, $at = state.doc.resolve( at );
            if ( frag.childCount === 1 && frag.firstChild.isTextblock && $at.parent.isTextblock ) {
                let content = frag.firstChild.content;
                const before = $at.parent.textBetween( 0, $at.parentOffset, '\n', ' ' );
                const first = content.firstChild;
                if ( before && !/\s$/.test( before ) && first && first.isText && !/^[\s.,;:!?)]/.test( first.text ) )
                    content = Fragment.from( schema.text( ' ', first.marks ) ).append( content );
                tr.insert( at, content );
            } else {
                tr.replaceRange( at, at, sliceLike( frag, { openStart: 1, openEnd: 1 } ) );
            }
            return tr;
        }
        if ( mode === 'below' ) {
            const frag = rebuild( stripTokens( answer ), input.map, schema, { mode: 'blocks', tokens: false } );
            const $to = state.doc.resolve( input.to );
            const after = input.whole ? state.doc.content.size : ( $to.depth ? $to.after( 1 ) : input.to );
            return tr.insert( after, frag );
        }
        const repair = !p.check.ok;
        if ( input.inline ) {
            const frag = rebuild( answer, input.map, schema, { mode: 'inline', parent: input.parent, repair } );
            return frag.size ? tr.replaceWith( input.from, input.to, frag ) : tr.delete( input.from, input.to );
        }
        const frag = rebuild( answer, input.map, schema, { mode: 'blocks', repair } );
        if ( !frag.childCount )
            throw new Error( 'empty answer' );
        if ( input.whole )
            return tr.replaceWith( 0, state.doc.content.size, frag );
        return tr.replaceRange( input.from, input.to, sliceLike( frag, input.slice ) );
    }

    /** mode: replace | below | at */
    accept( mode ) {
        const p = this.pending;
        if ( !p || !p.result )
            return;
        let tr = null, error = null;
        try {
            tr = this.transaction( mode );
            tr.doc.check();
        } catch ( e ) {
            error = e;
        }
        if ( error ) {
            p.error = this.ctx.t( 'The suggestion could not be applied to the document. Nothing was changed.' );
            this.render( 'error' );
            return;
        }
        this.close();
        this.ctx.editor.view.dispatch( tr.scrollIntoView() );
        this.ctx.editor.commands.focus();
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

/** the end of the markup, cut at a block boundary (a line) when it is too long */
function tail( markup, max ) {
    if ( markup.length <= max )
        return markup;
    const cut = markup.slice( -max );
    const nl = cut.indexOf( '\n' );
    return nl !== -1 && nl < cut.length - 1 ? cut.slice( nl + 1 ) : cut.replace( TOKEN_RE, '' );
}
