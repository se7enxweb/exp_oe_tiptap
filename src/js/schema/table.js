/**
 * Tables of the ezoe editor HTML dialect, built on @tiptap/extension-table (commands, prosemirror-tables).
 *
 *   ezxml <table class border width align custom:*>  <table customattributes width border align class style><tbody>
 *   ezxml <tr class custom:*>                         <tr customattributes class style>
 *   ezxml <td|th class align xhtml:width xhtml:colspan xhtml:rowspan custom:*>
 *                                                     <td|th customattributes class width colspan rowspan align style>
 *
 * Tiptap's own output (a <colgroup>, a min-width style, text-align styles, colspan="1") is not used: the parser
 * would turn the styles into attributes. Everything ezoe writes is kept verbatim; colspan/rowspan of 1 are left out
 * as ezoe does.
 *
 * @license GPL-2.0-or-later
 */
import { Table as TiptapTable, TableRow as TiptapTableRow, TableCell as TiptapTableCell, TableHeader as TiptapTableHeader } from '@tiptap/extension-table';
import { attributeSet, verbatim, COMMON } from './attributes.js';

export const Table = TiptapTable.extend( {
    addOptions() {
        return Object.assign( {}, this.parent ? this.parent() : {}, { resizable: false, renderWrapper: false } );
    },
    addAttributes() {
        return attributeSet( [ 'width', 'border', 'align' ].concat( COMMON ) );
    },
    parseHTML() {
        return [ { tag: 'table' } ];
    },
    renderHTML( { HTMLAttributes } ) {
        return [ 'table', HTMLAttributes, [ 'tbody', 0 ] ];
    }
} );

export const TableRow = TiptapTableRow.extend( {
    addAttributes() {
        return attributeSet( COMMON );
    },
    renderHTML( { HTMLAttributes } ) {
        return [ 'tr', HTMLAttributes, 0 ];
    }
} );

function span( name ) {
    return {
        default: 1,
        parseHTML: element => {
            const value = parseInt( element.getAttribute( name ) || '1', 10 );
            return value > 0 ? value : 1;
        },
        renderHTML: attributes => ( attributes[ name ] && attributes[ name ] !== 1 ? { [ name ]: String( attributes[ name ] ) } : {} )
    };
}

function cellAttributes() {
    return Object.assign(
        attributeSet( [ 'width', 'align' ].concat( COMMON ), [ 'colspan', 'rowspan', 'colwidth' ] ),
        {
            colspan: span( 'colspan' ),
            rowspan: span( 'rowspan' ),
            // used by prosemirror-tables for column widths in the editor only, never written
            colwidth: { default: null, rendered: false, parseHTML: () => null }
        }
    );
}

export const TableCell = TiptapTableCell.extend( {
    addAttributes() {
        return cellAttributes();
    },
    renderHTML( { HTMLAttributes } ) {
        return [ 'td', HTMLAttributes, 0 ];
    }
} );

export const TableHeader = TiptapTableHeader.extend( {
    addAttributes() {
        return cellAttributes();
    },
    renderHTML( { HTMLAttributes } ) {
        return [ 'th', HTMLAttributes, 0 ];
    }
} );

export function ezoeTables() {
    return [ Table, TableRow, TableHeader, TableCell ];
}

export { verbatim };
