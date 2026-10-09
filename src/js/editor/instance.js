/**
 * One Tiptap editor on one ezxmltext textarea.
 *
 * The textarea stays in the form (hidden) and remains the field that is posted: every change of the
 * document writes the ezoe HTML dialect back into it, and so does every submit of the form, so
 * content/edit receives exactly the field ezoe's TinyMCE posts and eZOEInputParser parses it.
 * As long as nothing is changed the textarea keeps its original value byte for byte.
 */
import { Editor, Extension, getSchema } from '@tiptap/core';
import { UndoRedo, Dropcursor, Gapcursor } from '@tiptap/extensions';
import { schema as defaultSchema } from './schema-bridge.js';
import { createCommands, resolveButtons, setBlockFormat } from './commands.js';
import { selectedAncestor } from './schema-utils.js';
import { Toolbar } from '../ui/toolbar.js';
import { StatusBar } from '../ui/statusbar.js';
import { AIPanel } from '../ui/ai-panel.js';
import { createDialogs } from '../ui/dialogs.js';
import { h, translator } from '../ui/dom.js';

/** ezoe.ini [EditorLayout] Buttons[] defaults, used when the template gives no list */
export const DEFAULT_BUTTONS = [
    'formatselect', 'bold', 'italic', 'underline', '|', 'sub', 'sup', '|',
    'justifyleft', 'justifycenter', 'justifyright', 'justifyfull', '|',
    'bullist', 'numlist', 'outdent', 'indent', '|', 'undo', 'redo', '|',
    'link', 'unlink', 'anchor', '|', 'image', 'object', 'custom', 'literal', 'charmap', 'pagebreak', '|',
    'table', 'delete_table', 'delete_col', 'col_after', 'delete_row', 'row_after', 'split_cells', 'merge_cells', '|',
    'fullscreen', 'help', '|', 'disable'
];

/** Every key of the options contract (doc/plan.md section 5) with its default */
export function normalizeOptions( options ) {
    const o = Object.assign( {
        attributeId: 0, contentObjectId: 0, version: 0, language: '', rows: 10,
        buttons: null, pathLocation: 'bottom', toolbarLocation: 'top', skin: 'o2k7', skinVariant: '', contentCss: [],
        xmlTagAlias: {}, customTags: [], literal: {}, tableDefinitions: {}, generalDefinitions: {}, embedDefinitions: {},
        linkClasses: {}, linkViewModes: [], customAttributeStyleMap: {}, imageSizes: [], viewModes: [], defaultSize: 'medium',
        urls: {}, formToken: '', switchButtonName: '', disableButtonName: '', ai: { enabled: false, commands: [] },
        i18n: {}, locale: '', height: 0
    }, options || {} );
    o.urls = Object.assign( { root: '/', ezoe: '/ezoe/', ezjscore: '/ezjscore/', contentEdit: '/content/edit', switch: '' }, o.urls || {} );
    // ezoe's own images (toolbar sprite, button background), referenced by URL and never copied
    if ( !o.urls.ezoeDesign )
        o.urls.ezoeDesign = String( o.urls.root ).replace( /\/?$/, '/' ) + 'extension/ezoe/design/standard/';
    if ( !Array.isArray( o.buttons ) || !o.buttons.length )
        o.buttons = DEFAULT_BUTTONS.slice();
    o.ai = Object.assign( { enabled: false, commands: [], call: 'expoetiptap::ai' }, o.ai || {} );
    return o;
}

/** TinyMCE 3 keyboard shortcuts on top of Tiptap's own (Mod-b/i/u/z, Shift-Mod-z, Mod-y) */
function tinyMCEKeys( instance ) {
    return Extension.create( {
        name: 'expOETinyMCEKeys',
        priority: 50,
        addKeyboardShortcuts() {
            const keys = {};
            for ( let i = 1; i <= 6; i++ )
                keys['Mod-' + i] = () => setBlockFormat( this.editor, 'h' + i );
            keys['Mod-7'] = () => setBlockFormat( this.editor, 'p' );
            keys['Mod-8'] = () => setBlockFormat( this.editor, 'pre' );
            keys['Mod-9'] = () => setBlockFormat( this.editor, 'pre' );
            keys['Mod-k'] = () => {
                instance.runButton( 'link' );
                return true;
            };
            keys['Mod-s'] = () => {
                if ( instance.findFormButton( 'StoreButton' ) )
                    instance.clickFormButton( 'StoreButton' );
                return true;
            };
            keys['Alt-0'] = () => {
                instance.runButton( 'help' );
                return true;
            };
            keys['Alt-F10'] = () => {
                const first = instance.toolbar && instance.toolbar.element.querySelector( 'button:not([disabled]), select' );
                if ( first )
                    first.focus();
                return true;
            };
            return keys;
        }
    } );
}

export class ExpOETiptapInstance {
    /**
     * @param {HTMLTextAreaElement} textarea
     * @param {Object} options see normalizeOptions()
     * @param {Object} hooks   internal: { schema, fetch } (tests)
     */
    constructor( textarea, options, hooks ) {
        hooks = hooks || {};
        this.textarea = textarea;
        this.options = normalizeOptions( options );
        this.schema = hooks.schema || defaultSchema;
        this.t = translator( this.options.i18n );
        this.dirty = false;
        this.locked = false;
        this.fullscreen = false;
        this.listeners = [];

        const o = this.options, t = this.t;
        this.contentArea = h( 'div', { class: 'exp-oe-content-area' } );
        this.wrapper = h( 'div', {
            class: 'exp-oe-tiptap exp-oe-skin-' + ( o.skin || 'o2k7' ) + ( o.skinVariant ? ' exp-oe-skin-' + o.skin + '-' + o.skinVariant : '' ),
            'data-attribute-id': o.attributeId || null
        } );
        this.wrapper.style.setProperty( '--exp-oe-icons', 'url("' + o.urls.ezoeDesign + 'javascript/themes/ez/img/icons.png")' );
        this.wrapper.style.setProperty( '--exp-oe-button-bg', 'url("' + o.urls.ezoeDesign + 'stylesheets/skins/o2k7/img/button_bg.png")' );
        const height = o.height || Math.max( 240, ( parseInt( o.rows, 10 ) || 10 ) * 24 );
        this.contentArea.style.height = height + 'px';

        // the editor
        const extensions = [].concat( this.schema.extensions( o ) || [], [ UndoRedo, Dropcursor, Gapcursor, tinyMCEKeys( this ) ] );
        const content = this.schema.load( textarea.value, getSchema( extensions ) );
        const mount = h( 'div', { class: 'exp-oe-mount' } );
        this.contentArea.appendChild( mount );
        this.editor = new Editor( {
            element: mount,
            extensions,
            content,
            editorProps: {
                attributes: {
                    class: 'exp-oe-content ezxmltext',
                    role: 'textbox',
                    'aria-multiline': 'true',
                    'aria-label': t( 'Rich text editor' ),
                    spellcheck: 'true',
                    lang: o.language ? String( o.language ).split( '-' )[0] : ''
                }
            },
            onUpdate: () => {
                this.dirty = true;
                this.sync();
            },
            onTransaction: () => this.updateUI(),
            onFocus: () => this.wrapper.classList.add( 'exp-oe-focus' ),
            onBlur: () => this.wrapper.classList.remove( 'exp-oe-focus' )
        } );

        // toolbar, AI panel, status bar
        this.dialogs = createDialogs();
        this.commands = createCommands();
        this.ctx = { options: o, t, instance: this, dialogs: this.dialogs, schema: this.schema, fetch: hooks.fetch };
        Object.defineProperty( this.ctx, 'editor', { get: () => this.editor } );
        this.ai = new AIPanel( this.ctx, hooks.fetch );
        this.ctx.ai = this.ai;
        const names = o.buttons.slice();
        if ( o.ai.enabled && names.indexOf( 'ai' ) === -1 )
            names.push( '|', 'ai' );
        this.toolbar = new Toolbar( this.ctx, this.commands, resolveButtons( names, this.commands, this.ctx ) );
        this.statusbar = o.pathLocation === 'none' ? null : new StatusBar( this.ctx );

        const parts = [];
        if ( this.statusbar && o.pathLocation === 'top' )
            parts.push( this.statusbar.element );
        if ( o.toolbarLocation !== 'bottom' )
            parts.push( this.toolbar.element );
        parts.push( this.ai.element, this.contentArea );
        if ( o.toolbarLocation === 'bottom' )
            parts.push( this.toolbar.element );
        if ( this.statusbar && o.pathLocation !== 'top' )
            parts.push( this.statusbar.element );
        parts.forEach( ( p ) => this.wrapper.appendChild( p ) );
        if ( this.schema.isFallback )
            this.wrapper.appendChild( h( 'div', { class: 'exp-oe-warning', role: 'note', text: t( 'Fallback schema: ezoe attributes, embeds and custom tags are not kept. Do not save.' ) } ) );

        // the textarea stays in the form as the posted field
        this.textareaDisplay = textarea.style.display;
        textarea.style.display = 'none';
        textarea.setAttribute( 'aria-hidden', 'true' );
        textarea.parentNode.insertBefore( this.wrapper, textarea.nextSibling );

        // write the field before any submit (the switch and "Disable editor" are submit buttons too)
        this.form = textarea.form || textarea.closest( 'form' );
        if ( this.form ) {
            this.listen( this.form, 'submit', () => this.sync(), true );
            this.listen( this.form, 'formdata', () => this.sync() );
            this.listen( this.form, 'click', ( e ) => {
                const b = e.target && e.target.closest && e.target.closest( 'button, input[type="submit"], input[type="image"]' );
                if ( b && ( b.type === 'submit' || b.type === 'image' ) )
                    this.sync();
            }, true );
        }
        this.updateUI();
    }

    listen( target, type, fn, capture ) {
        target.addEventListener( type, fn, !!capture );
        this.listeners.push( [ target, type, fn, !!capture ] );
    }

    /** ezoe dialect HTML of the current document */
    getHTML() {
        if ( this.editor.isEmpty )
            return '';
        return this.schema.save( this.editor );
    }

    /** Writes the document into the textarea; unchanged documents keep the original value */
    sync() {
        if ( !this.dirty )
            return;
        const html = this.getHTML();
        if ( this.textarea.value !== html ) {
            this.textarea.value = html;
            this.textarea.dispatchEvent( new Event( 'input', { bubbles: true } ) );
        }
    }

    updateUI() {
        if ( this.toolbar )
            this.toolbar.update();
        if ( this.statusbar )
            this.statusbar.update();
    }

    statusInfo() {
        const text = this.editor.state.doc.textBetween( 0, this.editor.state.doc.content.size, ' ', ' ' ).trim();
        const words = text ? text.split( /\s+/ ).length : 0;
        return this.t( 'Words: %n' ).replace( '%n', words );
    }

    isEditable() {
        return !this.locked && this.editor.isEditable;
    }

    inTable() {
        return selectedAncestor( this.editor, ( n ) => n.type.spec.tableRole === 'table' );
    }

    setLocked( on ) {
        this.locked = !!on;
        this.editor.setEditable( !on );
        this.wrapper.classList.toggle( 'exp-oe-locked', !!on );
        this.updateUI();
    }

    runButton( name ) {
        const def = this.commands[name];
        if ( !def || this.locked )
            return false;
        const button = this.toolbar.controls[name];
        def.run( this.ctx, button );
        this.updateUI();
        return true;
    }

    findFormButton( name ) {
        if ( !this.form || !name )
            return null;
        return Array.prototype.find.call( this.form.elements, ( el ) => el.name === name ) || null;
    }

    clickFormButton( name ) {
        const button = this.findFormButton( name );
        if ( !button )
            return false;
        this.sync();
        button.click();
        return true;
    }

    isFullscreen() {
        return this.fullscreen;
    }

    toggleFullscreen() {
        this.fullscreen = !this.fullscreen;
        this.wrapper.classList.toggle( 'exp-oe-fullscreen', this.fullscreen );
        document.documentElement.classList.toggle( 'exp-oe-has-fullscreen', this.fullscreen );
        this.editor.commands.focus();
    }

    destroy() {
        this.sync();
        this.ai.destroy();
        for ( const [ target, type, fn, capture ] of this.listeners )
            target.removeEventListener( type, fn, capture );
        this.listeners = [];
        this.editor.destroy();
        this.wrapper.remove();
        this.textarea.style.display = this.textareaDisplay;
        this.textarea.removeAttribute( 'aria-hidden' );
    }
}
