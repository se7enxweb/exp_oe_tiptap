/**
 * The floating menus of the a4 skin, in the manner of Tiptap's own editors:
 *  - a bubble menu over selected text (bold, italic, underline, link, unlink),
 *  - a "+" beside an empty paragraph that opens the insert commands (image, object, file, table, custom tag,
 *    literal).
 * Both run the toolbar's own commands (editor/commands.js), so what they do, their names and their states are the
 * toolbar's; the toolbar stays the complete, keyboard-operable way to every command. Only buttons the toolbar has
 * are offered.
 *
 * Keyboard, following the WAI-ARIA Authoring Practices: the bubble is a toolbar and the insert menu a menu with a
 * roving tabindex (one button in the tab order; arrow keys, Home and End move between them). The "+" is a menu
 * button (aria-haspopup, aria-expanded, aria-controls; Enter, Space and the down arrow open the menu on its first
 * item, the up arrow on its last). Escape closes an open menu, in the menus and in the editor; so does a click
 * outside of them and Tab out of the menu.
 *
 * @license GPL-2.0-or-later
 */
import { h } from './dom.js';

const BUBBLE = [ 'bold', 'italic', 'underline', 'link', 'unlink' ];
const INSERT = [ 'image', 'object', 'file', 'table', 'custom', 'literal' ];
let menuIds = 0;

/**
 * Moves the focus between the enabled buttons of a toolbar or menu by key, with a roving tabindex.
 * @param {HTMLElement[]} items
 * @param {string}        key   the KeyboardEvent key
 * @param {boolean}       vertical  a menu (up/down) or a toolbar (left/right)
 * @return {HTMLElement|null} the button focused, or null when the key is not a navigation key
 */
export function moveFocus( items, key, vertical ) {
    const enabled = items.filter( ( b ) => !b.disabled );
    if ( !enabled.length )
        return null;
    const current = enabled.indexOf( document.activeElement );
    const next = vertical ? 'ArrowDown' : 'ArrowRight';
    const prev = vertical ? 'ArrowUp' : 'ArrowLeft';
    let i;
    if ( key === next )
        i = current < 0 ? 0 : ( current + 1 ) % enabled.length;
    else if ( key === prev )
        i = current < 0 ? enabled.length - 1 : ( current - 1 + enabled.length ) % enabled.length;
    else if ( key === 'Home' )
        i = 0;
    else if ( key === 'End' )
        i = enabled.length - 1;
    else
        return null;
    setRoving( items, enabled[i] );
    enabled[i].focus();
    return enabled[i];
}

/** Puts exactly one button of a toolbar or menu into the tab order */
export function setRoving( items, current ) {
    for ( const b of items )
        b.tabIndex = b === current ? 0 : -1;
}

export class FloatingMenus {
    /**
     * @param {Object} ctx      { editor, t, instance }
     * @param {Object} commands the button registry
     * @param {Array}  names    the toolbar's resolved button names
     */
    constructor( ctx, commands, names ) {
        this.ctx = ctx;
        this.commands = commands;
        const has = ( n ) => names.indexOf( n ) !== -1 && commands[n] && !commands[n].select;
        this.bubbleButtons = BUBBLE.filter( has );
        this.insertButtons = INSERT.filter( has );
        this.controls = {};
        const t = ctx.t;

        this.bubble = h( 'div', { class: 'exp-oe-bubble', role: 'toolbar', 'aria-label': t( 'Formatting' ), hidden: true },
                         this.bubbleButtons.map( ( n ) => this.button( n ) ) );
        const menuId = 'exp-oe-plus-menu-' + ( ++menuIds );
        this.plusMenu = h( 'div', { class: 'exp-oe-plus-menu', id: menuId, role: 'menu', 'aria-label': t( 'Insert' ), hidden: true },
                           this.insertButtons.map( ( n ) => this.button( n, true ) ) );
        this.plus = h( 'button', {
            type: 'button', class: 'exp-oe-plus', title: t( 'Insert' ), 'aria-label': t( 'Insert' ),
            'aria-haspopup': 'menu', 'aria-expanded': 'false', 'aria-controls': menuId, hidden: true,
            onmousedown: ( e ) => e.preventDefault(),
            onclick: ( e ) => { e.preventDefault(); this.togglePlusMenu(); },
            onkeydown: ( e ) => {
                if ( e.key === 'ArrowDown' || e.key === 'ArrowUp' ) {
                    e.preventDefault();
                    this.openPlusMenu( e.key === 'ArrowUp' );
                }
            }
        }, [ h( 'span', { class: 'exp-oe-icon mce_plus', 'aria-hidden': 'true' } ) ] );
        this.bubbleItems = [ ...this.bubble.querySelectorAll( 'button' ) ];
        this.menuItems = [ ...this.plusMenu.querySelectorAll( 'button' ) ];
        setRoving( this.bubbleItems, this.bubbleItems[0] );
        setRoving( this.menuItems, null );

        this.bubble.addEventListener( 'keydown', ( e ) => {
            if ( moveFocus( this.bubbleItems, e.key, false ) )
                e.preventDefault();
        } );
        this.plusMenu.addEventListener( 'keydown', ( e ) => {
            if ( moveFocus( this.menuItems, e.key, true ) )
                e.preventDefault();
            else if ( e.key === 'Escape' ) {
                // a menu button's menu returns the focus to its button
                e.preventDefault();
                e.stopPropagation();
                this.hidePlusMenu();
                this.plus.focus();
            }
            else if ( e.key === 'Tab' )
                this.hidePlusMenu();
        } );
        this.element = h( 'div', { class: 'exp-oe-floating' }, [ this.bubble, this.plus, this.plusMenu ] );
        this.element.addEventListener( 'keydown', ( e ) => {
            if ( e.key === 'Escape' ) {
                e.preventDefault();
                this.hideAll();
                ctx.editor.commands.focus();
            }
        } );
    }

    /**
     * Listens on the editor and the document: Escape in the editor and a click outside of the menus close them.
     * @param {Function} listen ( target, type, fn, capture ), registers a listener the instance removes on destroy
     */
    attach( listen ) {
        listen( this.ctx.editor.view.dom, 'keydown', ( e ) => {
            if ( e.key !== 'Escape' || !this.isOpen() )
                return;
            e.preventDefault();
            e.stopPropagation();
            this.hidePlusMenu();
            this.bubble.hidden = true;
        } );
        listen( document, 'mousedown', ( e ) => {
            if ( !this.plusMenu.hidden && !this.element.contains( e.target ) )
                this.hidePlusMenu();
        }, true );
    }

    /** An insert menu or a bubble menu is shown */
    isOpen() {
        return !this.plusMenu.hidden || !this.bubble.hidden;
    }

    button( name, menuItem ) {
        const def = this.commands[name];
        const t = this.ctx.t;
        const label = def.label ? def.label( this.ctx ) : t( def.title );
        const b = h( 'button', {
            type: 'button', class: 'exp-oe-button exp-oe-button-' + name, title: label, 'aria-label': label,
            role: menuItem ? 'menuitem' : null,
            onmousedown: ( e ) => e.preventDefault(),
            onclick: ( e ) => {
                e.preventDefault();
                if ( b.disabled )
                    return;
                this.hidePlusMenu();
                def.run( this.ctx, b );
                this.ctx.instance.updateUI();
            }
        }, [ h( 'span', { class: 'exp-oe-icon mce_' + def.icon, 'aria-hidden': 'true' } ) ] );
        if ( def.active && !menuItem )
            b.setAttribute( 'aria-pressed', 'false' );
        this.controls[name] = b;
        return b;
    }

    hideAll() {
        this.bubble.hidden = true;
        this.plus.hidden = true;
        this.hidePlusMenu();
    }

    hidePlusMenu() {
        this.plusMenu.hidden = true;
        this.plus.setAttribute( 'aria-expanded', 'false' );
    }

    togglePlusMenu() {
        if ( this.plusMenu.hidden )
            this.openPlusMenu( false );
        else
            this.hidePlusMenu();
    }

    /** Opens the insert menu and focuses its first (or last) enabled item */
    openPlusMenu( last ) {
        this.plusMenu.hidden = false;
        this.plus.setAttribute( 'aria-expanded', 'true' );
        this.plusMenu.style.top = ( this.plus.offsetTop + this.plus.offsetHeight + 4 ) + 'px';
        this.plusMenu.style.left = this.plus.offsetLeft + 'px';
        setRoving( this.menuItems, null );
        moveFocus( this.menuItems, last ? 'End' : 'Home', true );
    }

    /** Called on every transaction, focus and blur: shows, places and updates the menus */
    update( hasFocus ) {
        const { editor, instance } = this.ctx;
        const view = editor.view;
        const within = this.element.contains( document.activeElement );
        if ( !instance.isEditable() ) {
            this.hideAll();
            return;
        }
        if ( !hasFocus && !within ) {
            // during a blur the focus has not landed yet (document.activeElement is the body): a click into the insert
            // menu, which moves the focus to its first item, would close it again. Decide once the focus has moved.
            clearTimeout( this.blurTimer );
            this.blurTimer = setTimeout( () => {
                if ( !editor.isDestroyed && !editor.isFocused && !this.element.contains( document.activeElement ) )
                    this.hideAll();
            }, 0 );
            return;
        }
        const { selection } = editor.state;
        // the menus are placed in the content area, which scrolls: its rectangle plus its scroll offset
        const area = this.element.parentNode;
        const rect = area.getBoundingClientRect();
        const frame = { left: rect.left - area.scrollLeft, top: rect.top - area.scrollTop };

        // bubble: text selected
        const textSelected = !selection.empty && !selection.node && this.bubbleButtons.length; // not a selected node (embed, table)
        if ( textSelected ) {
            for ( const [ name, b ] of Object.entries( this.controls ) ) {
                const def = this.commands[name];
                let enabled = true;
                try { enabled = def.enabled ? !!def.enabled( this.ctx ) : true; } catch ( e ) { enabled = false; }
                b.disabled = !enabled;
                if ( def.active && b.hasAttribute( 'aria-pressed' ) ) {
                    let active = false;
                    try { active = !!def.active( this.ctx ); } catch ( e ) {}
                    b.classList.toggle( 'exp-oe-active', active );
                    b.setAttribute( 'aria-pressed', active ? 'true' : 'false' );
                }
            }
            // the button in the tab order stays an enabled one
            const tabbable = this.bubbleItems.find( ( b ) => b.tabIndex === 0 );
            if ( !tabbable || tabbable.disabled )
                setRoving( this.bubbleItems, this.bubbleItems.find( ( b ) => !b.disabled ) || null );
            const start = view.coordsAtPos( selection.from );
            const end = view.coordsAtPos( selection.to );
            this.bubble.hidden = false;
            // at the selection, but never past the area's right edge: on a phone a selection at the line's end put
            // the bubble's last button (link) outside the editor, where the area clips it
            const maxLeft = area.scrollLeft + area.clientWidth - this.bubble.offsetWidth - 4;
            this.bubble.style.left = Math.max( 0, Math.min( start.left - frame.left, maxLeft ) ) + 'px';
            // above the selection, or below it where the text area has no room above (first line)
            const above = start.top - frame.top - this.bubble.offsetHeight - 6;
            const areaTop = this.element.parentNode.scrollTop;
            this.bubble.style.top = ( above >= areaTop ? above : end.bottom - frame.top + 6 ) + 'px';
        }
        else if ( !within || !this.bubble.contains( document.activeElement ) )
            this.bubble.hidden = true;

        // "+": the cursor stands in an empty paragraph
        const parent = selection.$from && selection.$from.parent;
        const emptyLine = selection.empty && parent && parent.type.name === 'paragraph' && parent.content.size === 0 && this.insertButtons.length;
        if ( emptyLine ) {
            const at = view.coordsAtPos( selection.from );
            this.plus.hidden = false;
            this.plus.style.top = Math.max( 0, at.top - frame.top - 4 ) + 'px';
            this.plus.style.left = '4px';
        }
        else if ( !within ) {
            this.plus.hidden = true;
            this.hidePlusMenu();
        }
    }
}
