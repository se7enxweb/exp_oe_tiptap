/**
 * Word level diff for the AI suggestion preview (longest common subsequence over words and
 * whitespace). Large inputs fall back to "everything removed, everything added" so the browser
 * never spends seconds on a preview.
 */

const MAX_CELLS = 4000000;

export function tokenize( text ) {
    return String( text || '' ).match( /\s+|[^\s]+/g ) || [];
}

/**
 * @return Array of { type: 'same'|'add'|'del', text }
 */
export function diffWords( before, after ) {
    const a = tokenize( before ), b = tokenize( after );
    if ( a.length * b.length > MAX_CELLS ) {
        const out = [];
        if ( before )
            out.push( { type: 'del', text: before } );
        if ( after )
            out.push( { type: 'add', text: after } );
        return out;
    }
    const n = a.length, m = b.length;
    // lengths of the LCS of the suffixes, one row at a time (Uint32 rows keep memory small)
    const rows = new Array( n + 1 );
    rows[n] = new Uint32Array( m + 1 );
    for ( let i = n - 1; i >= 0; i-- ) {
        const row = new Uint32Array( m + 1 ), next = rows[i + 1];
        for ( let j = m - 1; j >= 0; j-- )
            row[j] = a[i] === b[j] ? next[j + 1] + 1 : Math.max( next[j], row[j + 1] );
        rows[i] = row;
    }
    const out = [];
    const push = ( type, text ) => {
        const last = out[out.length - 1];
        if ( last && last.type === type )
            last.text += text;
        else
            out.push( { type, text } );
    };
    let i = 0, j = 0;
    while ( i < n && j < m ) {
        if ( a[i] === b[j] ) {
            push( 'same', a[i] );
            i++;
            j++;
        } else if ( rows[i + 1][j] >= rows[i][j + 1] ) {
            push( 'del', a[i++] );
        } else {
            push( 'add', b[j++] );
        }
    }
    while ( i < n )
        push( 'del', a[i++] );
    while ( j < m )
        push( 'add', b[j++] );
    return out;
}
