/**
 * Toolbar in the look of ezoe's TinyMCE 3 o2k7 skin: 22px buttons with the icons of ezoe's own
 * sprite (extension/ezoe/.../themes/ez/img/icons.png, used by URL, not copied), separators between
 * the groups of ezoe.ini [EditorLayout] Buttons[], and the format list box.
 */
import { h } from './dom.js';
import { BLOCK_FORMATS } from '../editor/commands.js';

export class Toolbar {
    /**
     * @param {Object} ctx      { editor, options, t, dialogs, instance, ai }
     * @param {Object} commands the button registry (editor/commands.js)
     * @param {Array}  buttons  resolved button names, '|' for a separator
     */
    constructor( ctx, commands, buttons ) {
        this.ctx = ctx;
        this.commands = commands;
        this.buttons = buttons;
        this.controls = {};
        this.element = h( 'div', { class: 'exp-oe-toolbar', role: 'toolbar', 'aria-label': ctx.t( 'Editor toolbar' ) } );
        this.render();
    }

    render() {
        const { t } = this.ctx;
        let group = h( 'span', { class: 'exp-oe-group' } );
        this.element.appendChild( group );
        for ( const name of this.buttons ) {
            if ( name === '|' ) {
                group = h( 'span', { class: 'exp-oe-group' } );
                this.element.appendChild( h( 'span', { class: 'exp-oe-separator', 'aria-hidden': 'true' } ) );
                this.element.appendChild( group );
                continue;
            }
            const def = this.commands[name];
            if ( def.select ) {
                const select = h( 'select', {
                    class: 'exp-oe-listbox', title: t( def.title ), 'aria-label': t( def.title ), 'data-exp-oe-button': name,
                    onchange: () => {
                        if ( select.value )
                            def.change( this.ctx, select.value );
                        this.update();
                    }
                }, [ h( 'option', { value: '', text: '-- ' + t( 'Format' ) + ' --' } ) ].concat(
                    def.options( this.ctx ).map( ( [ value, label ] ) => h( 'option', { value, text: t( label ) } ) )
                ) );
                group.appendChild( select );
                this.controls[name] = select;
                continue;
            }
            const button = h( 'button', {
                type: 'button',
                class: 'exp-oe-button exp-oe-button-' + name,
                title: def.label ? def.label( this.ctx ) : t( def.title ),
                'aria-label': def.label ? def.label( this.ctx ) : t( def.title ),
                'data-exp-oe-button': name,
                tabindex: '-1',
                onmousedown: ( e ) => e.preventDefault(), // keep the editor selection
                onclick: ( e ) => {
                    e.preventDefault();
                    if ( button.disabled )
                        return;
                    def.run( this.ctx, button );
                    this.update();
                }
            }, [ h( 'span', { class: 'exp-oe-icon mce_' + def.icon, 'aria-hidden': 'true' } ) ] );
            if ( def.active )
                button.setAttribute( 'aria-pressed', 'false' );
            group.appendChild( button );
            this.controls[name] = button;
        }
        // the first button is reachable with Tab, the others with the arrow keys (toolbar pattern)
        const first = this.element.querySelector( 'button' );
        if ( first )
            first.tabIndex = 0;
        this.element.addEventListener( 'keydown', ( e ) => this.onKeyDown( e ) );
    }

    onKeyDown( e ) {
        if ( e.key !== 'ArrowRight' && e.key !== 'ArrowLeft' )
            return;
        const items = Array.prototype.slice.call( this.element.querySelectorAll( 'button:not([disabled]), select' ) );
        const index = items.indexOf( document.activeElement );
        if ( index === -1 )
            return;
        e.preventDefault();
        const next = items[ ( index + ( e.key === 'ArrowRight' ? 1 : items.length - 1 ) ) % items.length ];
        next.focus();
    }

    /** Active, disabled and list box state from the current selection */
    update() {
        const ctx = this.ctx;
        const inTable = !!ctx.instance.inTable();
        for ( const [ name, control ] of Object.entries( this.controls ) ) {
            const def = this.commands[name];
            try {
                if ( def.select ) {
                    const value = def.value( ctx );
                    control.value = BLOCK_FORMATS.some( ( [ tag ] ) => tag === value ) ? value : '';
                    continue;
                }
                let enabled = ctx.instance.isEditable();
                if ( enabled && def.tableOnly )
                    enabled = inTable;
                if ( enabled && def.enabled )
                    enabled = !!def.enabled( ctx );
                control.disabled = !enabled;
                control.classList.toggle( 'exp-oe-disabled', !enabled );
                if ( def.active ) {
                    const active = !!def.active( ctx );
                    control.classList.toggle( 'exp-oe-active', active );
                    control.setAttribute( 'aria-pressed', active ? 'true' : 'false' );
                }
            } catch ( e ) {
                control.disabled = true;
            }
        }
    }
}
