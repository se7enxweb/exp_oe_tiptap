/**
 * Modal dialog in the look of ezoe's inline popups: title bar, panel, OK/Cancel at the bottom.
 * Escape cancels, Enter in a single line field presses the primary button, focus stays inside.
 */
import { h } from './dom.js';

let openCount = 0;

/**
 * @param {Object} spec { title, body: Node|Node[], buttons: [ { text, primary, cancel, onClick( dialog ) } ],
 *                        width, className, onClose }
 *                        onClick returns false to keep the dialog open.
 * @return {Object} { element, close(), setError( text ), setBusy( bool, text ) }
 */
export function openDialog( spec ) {
    const previousFocus = document.activeElement;
    const error = h( 'div', { class: 'exp-oe-dialog-error', role: 'alert', hidden: true } );
    const busy = h( 'div', { class: 'exp-oe-dialog-busy', hidden: true } );
    const titleId = 'exp-oe-dialog-title-' + ( ++openCount ) + '-' + Date.now();
    const footer = h( 'div', { class: 'exp-oe-dialog-footer' } );
    const panel = h( 'div', { class: 'exp-oe-dialog-panel' }, [].concat( spec.body || [] ) );
    const box = h( 'div', {
        class: 'exp-oe-dialog ' + ( spec.className || '' ), role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId,
        style: spec.width ? 'width:' + spec.width + 'px' : null
    }, [
        h( 'div', { class: 'exp-oe-dialog-title' }, [
            h( 'span', { id: titleId, text: spec.title || '' } ),
            h( 'button', { type: 'button', class: 'exp-oe-dialog-close', 'aria-label': spec.closeText || 'Close', title: spec.closeText || 'Close', onclick: () => cancel() }, '×' )
        ] ),
        error, busy, panel, footer
    ] );
    const overlay = h( 'div', { class: 'exp-oe-dialog-overlay' }, [ box ] );
    let closed = false;

    const api = {
        element: box,
        panel,
        close() {
            if ( closed )
                return;
            closed = true;
            overlay.remove();
            document.removeEventListener( 'keydown', onKey, true );
            if ( spec.onClose )
                spec.onClose();
            if ( previousFocus && previousFocus.focus )
                previousFocus.focus();
        },
        setError( text ) {
            error.textContent = text || '';
            error.hidden = !text;
        },
        setBusy( on, text ) {
            busy.textContent = text || '';
            busy.hidden = !on;
            for ( const b of footer.querySelectorAll( 'button' ) )
                b.disabled = !!on;
        },
        get closed() {
            return closed;
        }
    };

    const run = ( button ) => {
        api.setError( '' );
        let result;
        try {
            result = button.onClick ? button.onClick( api ) : undefined;
        } catch ( e ) {
            api.setError( e.message );
            return;
        }
        if ( result && typeof result.then === 'function' ) {
            api.setBusy( true, spec.busyText || '' );
            result.then( ( r ) => {
                api.setBusy( false );
                if ( r !== false )
                    api.close();
            }, ( e ) => {
                api.setBusy( false );
                api.setError( e && e.message ? e.message : String( e ) );
            } );
            return;
        }
        if ( result !== false )
            api.close();
    };

    const buttons = spec.buttons || [ { text: 'OK', primary: true } ];
    let primary = null, cancelButton = null;
    for ( const b of buttons ) {
        const el = h( 'button', { type: 'button', class: 'exp-oe-dialog-button' + ( b.primary ? ' exp-oe-primary' : '' ), text: b.text, onclick: () => run( b ) } );
        footer.appendChild( el );
        if ( b.primary )
            primary = b;
        if ( b.cancel )
            cancelButton = b;
    }

    function cancel() {
        if ( cancelButton && cancelButton.onClick )
            cancelButton.onClick( api );
        api.close();
    }

    function onKey( e ) {
        if ( !box.isConnected )
            return;
        if ( e.key === 'Escape' ) {
            e.preventDefault();
            e.stopPropagation();
            cancel();
        } else if ( e.key === 'Enter' && primary && e.target && e.target.tagName === 'INPUT' && box.contains( e.target ) && e.target.type !== 'file' ) {
            e.preventDefault();
            run( primary );
        } else if ( e.key === 'Tab' ) {
            const focusable = Array.prototype.filter.call( box.querySelectorAll( 'button, input, select, textarea, a[href], [tabindex="0"]' ), ( el ) => !el.disabled && !el.hidden );
            if ( !focusable.length )
                return;
            const first = focusable[0], last = focusable[focusable.length - 1];
            if ( e.shiftKey && document.activeElement === first ) {
                e.preventDefault();
                last.focus();
            } else if ( !e.shiftKey && document.activeElement === last ) {
                e.preventDefault();
                first.focus();
            }
        }
    }

    document.addEventListener( 'keydown', onKey, true );
    document.body.appendChild( overlay );
    const autofocus = box.querySelector( '[autofocus], .exp-oe-dialog-panel input, .exp-oe-dialog-panel select, .exp-oe-dialog-panel textarea' ) || footer.querySelector( 'button' );
    if ( autofocus && autofocus.focus )
        autofocus.focus();
    return api;
}

/** A labelled form row: <label>text</label> control */
export function field( label, control, hint ) {
    const id = control.id || ( 'exp-oe-f-' + Math.random().toString( 36 ).slice( 2 ) );
    control.id = id;
    return h( 'div', { class: 'exp-oe-field' }, [
        h( 'label', { for: id, text: label } ), control, hint ? h( 'div', { class: 'exp-oe-hint', text: hint } ) : null
    ] );
}

/** <select> with [ [ value, text ] ] options */
export function select( options, value, attrs ) {
    return h( 'select', attrs || {}, options.map( ( [ v, text ] ) => h( 'option', { value: v, text, selected: String( v ) === String( value === undefined || value === null ? '' : value ) } ) ) );
}
