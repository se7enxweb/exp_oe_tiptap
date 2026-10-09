/**
 * The toolbar buttons of ezoe (ezoe.ini [EditorLayout] Buttons[]) and what they do in Tiptap.
 *
 * Every entry: { title, icon, run( ctx ), active?( ctx ), enabled?( ctx ), select? }
 *   title  translation key (ctx.t), the TinyMCE 3 ez theme's tooltip text
 *   icon   the class of ezoe's o2k7 icon sprite (span.mce_<icon>)
 * Buttons whose node or mark type the schema does not have are left out of the toolbar
 * (available() false), like ezoe hides buttons for tags ezxml does not allow.
 */
import { nodeForTag, markForTag, linkMark, hasCommand, knownAttrs, selectedAncestor, currentBlock, attrsFromElement } from './schema-utils.js';

const BLOCK_FORMATS = [
    [ 'p', 'Paragraph' ],
    [ 'pre', 'Preformatted' ],
    [ 'h1', 'Heading 1' ],
    [ 'h2', 'Heading 2' ],
    [ 'h3', 'Heading 3' ],
    [ 'h4', 'Heading 4' ],
    [ 'h5', 'Heading 5' ],
    [ 'h6', 'Heading 6' ]
];

/**
 * A mark of a plain tag (<strong>, <u>...). The attributes come from the schema's own parse rule for the
 * bare element, so <u> becomes ezoe's underline custom tag (class "ezoeItemCustomTag underline").
 */
function plainMark( editor, tag ) {
    const found = markForTag( editor, tag );
    if ( !found )
        return null;
    const attrs = attrsFromElement( found.type, document.createElement( tag ) ) || {};
    return { name: found.name, attrs };
}

function markButton( tag, title, icon, command ) {
    return {
        title, icon,
        available: ( { editor } ) => !!markForTag( editor, tag ),
        run: ( { editor } ) => {
            if ( command && hasCommand( editor, command ) )
                return editor.chain().focus()[command]().run();
            const m = plainMark( editor, tag );
            return editor.chain().focus().toggleMark( m.name, m.attrs ).run();
        },
        active: ( { editor } ) => {
            const m = plainMark( editor, tag );
            return editor.isActive( m.name, m.attrs.class ? { class: m.attrs.class } : {} );
        }
    };
}

/** Align attribute of the block (ezoe: align="left|center|right|justify" on p, h1-h6, td, th) */
function alignButton( value, title, icon ) {
    const target = ( editor ) => selectedAncestor( editor, ( n ) => n.isBlock && n.type.spec.attrs && ( 'align' in n.type.spec.attrs || 'textAlign' in n.type.spec.attrs ) );
    return {
        title, icon,
        available: ( { editor } ) => hasCommand( editor, 'setTextAlign' ) ||
            Object.values( editor.schema.nodes ).some( ( t ) => t.spec.attrs && 'align' in t.spec.attrs ),
        run: ( { editor } ) => {
            const found = target( editor );
            if ( found && 'align' in found.node.type.spec.attrs ) {
                const next = found.node.attrs.align === value ? null : value;
                return editor.chain().focus().command( ( { tr } ) => {
                    tr.setNodeMarkup( found.pos, undefined, Object.assign( {}, found.node.attrs, { align: next } ) );
                    return true;
                } ).run();
            }
            if ( hasCommand( editor, 'setTextAlign' ) )
                return editor.isActive( { textAlign: value } ) ? editor.chain().focus().unsetTextAlign().run() : editor.chain().focus().setTextAlign( value ).run();
            return false;
        },
        active: ( { editor } ) => {
            const found = target( editor );
            if ( !found )
                return false;
            return found.node.attrs.align === value || found.node.attrs.textAlign === value;
        }
    };
}

function listButton( tag, title, icon, toggleName ) {
    return {
        title, icon,
        available: ( { editor } ) => !!nodeForTag( editor, tag ),
        run: ( { editor } ) => {
            if ( hasCommand( editor, toggleName ) )
                return editor.chain().focus()[toggleName]().run();
            const list = nodeForTag( editor, tag ), item = nodeForTag( editor, 'li' );
            return editor.chain().focus().toggleList( list.name, item.name ).run();
        },
        active: ( { editor } ) => editor.isActive( nodeForTag( editor, tag ).name )
    };
}

function tableButton( command, title, icon ) {
    return {
        title, icon,
        available: ( { editor } ) => hasCommand( editor, command ),
        run: ( { editor } ) => editor.chain().focus()[command]().run(),
        enabled: ( { editor } ) => editor.can()[command](),
        tableOnly: true
    };
}

/** Converts the current textblock to the format of <tag> (formatselect) */
export function setBlockFormat( editor, tag ) {
    const found = nodeForTag( editor, tag );
    if ( !found )
        return false;
    return editor.chain().focus().setNode( found.name, found.attrs ).run();
}

/** The tag of formatselect for the current textblock */
export function currentBlockFormat( editor ) {
    const block = currentBlock( editor );
    for ( const [ tag ] of BLOCK_FORMATS ) {
        const found = nodeForTag( editor, tag );
        if ( found && found.type === block.type ) {
            if ( !found.attrs || !Object.keys( found.attrs ).length )
                return tag;
            if ( Object.keys( found.attrs ).every( ( k ) => block.attrs[k] === found.attrs[k] ) )
                return tag;
        }
    }
    return '';
}

export function createCommands() {
    return {
        formatselect: {
            title: 'Format', select: true,
            options: ( { editor } ) => BLOCK_FORMATS.filter( ( [ tag ] ) => !!nodeForTag( editor, tag ) ),
            value: ( { editor } ) => currentBlockFormat( editor ),
            change: ( { editor }, tag ) => setBlockFormat( editor, tag ),
            available: () => true
        },
        bold: markButton( 'strong', 'Bold (Ctrl+B)', 'bold', 'toggleBold' ),
        italic: markButton( 'em', 'Italic (Ctrl+I)', 'italic', 'toggleItalic' ),
        underline: markButton( 'u', 'Underline (Ctrl+U)', 'underline', 'toggleUnderline' ),
        sub: markButton( 'sub', 'Subscript', 'sub' ),
        sup: markButton( 'sup', 'Superscript', 'sup' ),
        justifyleft: alignButton( 'left', 'Align left', 'justifyleft' ),
        justifycenter: alignButton( 'center', 'Align center', 'justifycenter' ),
        justifyright: alignButton( 'right', 'Align right', 'justifyright' ),
        justifyfull: alignButton( 'justify', 'Align full', 'justifyfull' ),
        bullist: listButton( 'ul', 'Unordered list', 'bullist', 'toggleBulletList' ),
        numlist: listButton( 'ol', 'Ordered list', 'numlist', 'toggleOrderedList' ),
        outdent: {
            title: 'Outdent', icon: 'outdent',
            available: ( { editor } ) => !!nodeForTag( editor, 'li' ),
            run: ( { editor } ) => editor.chain().focus().liftListItem( nodeForTag( editor, 'li' ).name ).run(),
            enabled: ( { editor } ) => editor.can().liftListItem( nodeForTag( editor, 'li' ).name )
        },
        indent: {
            title: 'Indent', icon: 'indent',
            available: ( { editor } ) => !!nodeForTag( editor, 'li' ),
            run: ( { editor } ) => editor.chain().focus().sinkListItem( nodeForTag( editor, 'li' ).name ).run(),
            enabled: ( { editor } ) => editor.can().sinkListItem( nodeForTag( editor, 'li' ).name )
        },
        undo: {
            title: 'Undo (Ctrl+Z)', icon: 'undo',
            available: ( { editor } ) => hasCommand( editor, 'undo' ),
            run: ( { editor } ) => editor.chain().focus().undo().run(),
            enabled: ( { editor } ) => editor.can().undo()
        },
        redo: {
            title: 'Redo (Ctrl+Y)', icon: 'redo',
            available: ( { editor } ) => hasCommand( editor, 'redo' ),
            run: ( { editor } ) => editor.chain().focus().redo().run(),
            enabled: ( { editor } ) => editor.can().redo()
        },
        link: {
            title: 'Insert/edit link', icon: 'link',
            available: ( { editor } ) => !!linkMark( editor ),
            run: ( ctx ) => ctx.dialogs.link( ctx ),
            active: ( { editor } ) => editor.isActive( linkMark( editor ).name )
        },
        unlink: {
            title: 'Unlink', icon: 'unlink',
            available: ( { editor } ) => !!linkMark( editor ),
            run: ( { editor } ) => editor.chain().focus().extendMarkRange( linkMark( editor ).name ).unsetMark( linkMark( editor ).name ).run(),
            enabled: ( { editor } ) => editor.isActive( linkMark( editor ).name )
        },
        anchor: {
            title: 'Insert/edit anchor', icon: 'anchor',
            available: () => true,
            run: ( ctx ) => ctx.dialogs.anchor( ctx )
        },
        image: {
            title: 'Insert/edit image', icon: 'image',
            available: ( ctx ) => !!ctx.options.contentObjectId,
            run: ( ctx ) => ctx.dialogs.embed( ctx, 'images' )
        },
        object: {
            title: 'Insert/edit object', icon: 'object',
            available: ( ctx ) => !!ctx.options.contentObjectId,
            run: ( ctx ) => ctx.dialogs.embed( ctx, 'objects' )
        },
        file: {
            title: 'Insert/edit file', icon: 'file',
            available: ( ctx ) => !!ctx.options.contentObjectId,
            run: ( ctx ) => ctx.dialogs.embed( ctx, 'files' )
        },
        custom: {
            title: 'Insert custom tag', icon: 'custom',
            available: ( ctx ) => ( ctx.options.customTags || [] ).length > 0,
            run: ( ctx ) => ctx.dialogs.customTag( ctx )
        },
        literal: {
            title: 'Literal text', icon: 'literal',
            available: ( { editor } ) => !!nodeForTag( editor, 'pre' ),
            run: ( { editor } ) => {
                const pre = nodeForTag( editor, 'pre' );
                return editor.isActive( pre.name ) ? setBlockFormat( editor, 'p' ) : setBlockFormat( editor, 'pre' );
            },
            active: ( { editor } ) => editor.isActive( nodeForTag( editor, 'pre' ).name )
        },
        charmap: {
            title: 'Insert special character', icon: 'charmap',
            available: () => true,
            run: ( ctx ) => ctx.dialogs.charmap( ctx )
        },
        pagebreak: {
            title: 'Insert page break', icon: 'pagebreak',
            available: ( ctx ) => ( ctx.options.customTags || [] ).some( ( d ) => d.name === 'pagebreak' ),
            run: ( { editor } ) => editor.chain().focus().insertContent( '<div type="custom" class="ezoeItemCustomTag pagebreak"><p>pagebreak</p></div>' ).run()
        },
        table: {
            title: 'Insert/edit table', icon: 'table',
            available: ( { editor } ) => hasCommand( editor, 'insertTable' ),
            run: ( ctx ) => ctx.dialogs.table( ctx )
        },
        delete_table: tableButton( 'deleteTable', 'Delete table', 'delete_table' ),
        delete_col: tableButton( 'deleteColumn', 'Delete column', 'delete_col' ),
        col_after: tableButton( 'addColumnAfter', 'Insert column after', 'col_after' ),
        col_before: tableButton( 'addColumnBefore', 'Insert column before', 'col_before' ),
        delete_row: tableButton( 'deleteRow', 'Delete row', 'delete_row' ),
        row_after: tableButton( 'addRowAfter', 'Insert row after', 'row_after' ),
        row_before: tableButton( 'addRowBefore', 'Insert row before', 'row_before' ),
        split_cells: tableButton( 'splitCell', 'Split merged table cells', 'split_cells' ),
        merge_cells: tableButton( 'mergeCells', 'Merge table cells', 'merge_cells' ),
        cell_props: {
            title: 'Table cell properties', icon: 'cell_props', tableOnly: true,
            available: ( { editor } ) => hasCommand( editor, 'insertTable' ),
            run: ( ctx ) => ctx.dialogs.cellProperties( ctx ),
            enabled: ( { editor } ) => !!selectedAncestor( editor, ( n ) => n.type.spec.tableRole === 'cell' || n.type.spec.tableRole === 'header_cell' )
        },
        removeformat: {
            title: 'Remove formatting', icon: 'removeformat',
            available: () => true,
            run: ( { editor } ) => editor.chain().focus().unsetAllMarks().run()
        },
        fullscreen: {
            title: 'Toggle fullscreen mode', icon: 'fullscreen',
            available: () => true,
            run: ( ctx ) => ctx.instance.toggleFullscreen(),
            active: ( ctx ) => ctx.instance.isFullscreen()
        },
        help: {
            title: 'Help (Alt+0)', icon: 'help',
            available: () => true,
            run: ( ctx ) => ctx.dialogs.help( ctx )
        },
        disable: {
            title: 'Disable editor', icon: 'disable',
            available: ( ctx ) => !!ctx.options.disableButtonName,
            run: ( ctx ) => ctx.instance.clickFormButton( ctx.options.disableButtonName )
        },
        store: {
            title: 'Store draft (Ctrl+S)', icon: 'store',
            available: ( ctx ) => !!ctx.instance.findFormButton( 'StoreButton' ),
            run: ( ctx ) => ctx.instance.clickFormButton( 'StoreButton' )
        },
        publish: {
            title: 'Send for publishing', icon: 'publish',
            available: ( ctx ) => !!ctx.instance.findFormButton( 'PublishButton' ),
            run: ( ctx ) => ctx.instance.clickFormButton( 'PublishButton' )
        },
        discard: {
            title: 'Discard draft', icon: 'discard',
            available: ( ctx ) => !!ctx.instance.findFormButton( 'DiscardButton' ),
            run: ( ctx ) => ctx.instance.clickFormButton( 'DiscardButton' )
        },
        switch: {
            title: 'Switch editor', icon: 'switch',
            label: ( ctx ) => ctx.options.otherEditorLabel ? ctx.t( 'Switch to %s' ).replace( '%s', ctx.options.otherEditorLabel ) : ctx.t( 'Switch editor' ),
            available: ( ctx ) => !!ctx.options.switchButtonName,
            run: ( ctx ) => ctx.instance.clickFormButton( ctx.options.switchButtonName )
        },
        ai: {
            title: 'AI assistant', icon: 'ai', menu: true,
            available: ( ctx ) => !!( ctx.options.ai && ctx.options.ai.enabled ),
            run: ( ctx, anchor ) => ctx.ai.openMenu( anchor )
        }
    };
}

/** The ezoe button list with unknown and unavailable buttons and double separators removed */
export function resolveButtons( names, commands, ctx ) {
    const result = [];
    for ( const raw of names || [] ) {
        const name = String( raw ).trim();
        if ( name === '|' ) {
            if ( result.length && result[result.length - 1] !== '|' )
                result.push( '|' );
            continue;
        }
        const def = commands[name];
        if ( !def || result.indexOf( name ) !== -1 )
            continue;
        let ok = false;
        try {
            ok = !def.available || def.available( ctx );
        } catch ( e ) {
            ok = false;
        }
        if ( ok )
            result.push( name );
    }
    while ( result.length && result[result.length - 1] === '|' )
        result.pop();
    return result;
}

export { BLOCK_FORMATS, knownAttrs };
