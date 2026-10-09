/**
 * Marks of the ezoe editor HTML dialect.
 *
 *   ezxml <strong>                    <strong>                        bold
 *   ezxml <emphasize>                 <em>                            italic
 *   ezxml <link>                      <a href ...>                    link
 *   ezxml <custom name="sub|sup">     <sub> / <sup>                   subscript / superscript
 *   ezxml <custom> (inline)           <span|u class="ezoeItemCustomTag NAME" type="custom">   ezCustomInline
 *
 * The order of the marks in the list returned by ezoeMarks() is their nesting order on output (first = outermost):
 * inline custom tags, emphasize, strong, sub, sup, link. Formatting usually spans more than a link inside it
 * ("<emphasize>Credit: <link>name</link></emphasize>"), so the link is innermost and the formatting is not split
 * around it (Tiptap orders marks by priority: custom 101, formatting 100, link 50).
 *
 * @license GPL-2.0-or-later
 */
import { Mark, mergeAttributes } from '@tiptap/core';
import { attributeSet, COMMON, customTagName } from './attributes.js';

const FORMAT_ATTRIBUTES = COMMON;

export const Bold = Mark.create( {
    name: 'bold',
    addAttributes() {
        return attributeSet( FORMAT_ATTRIBUTES );
    },
    parseHTML() {
        return [
            { tag: 'strong' },
            { tag: 'b', getAttrs: node => node.style.fontWeight !== 'normal' && null },
            { style: 'font-weight=bold' }
        ];
    },
    renderHTML( { HTMLAttributes } ) {
        return [ 'strong', HTMLAttributes, 0 ];
    },
    addCommands() {
        return {
            setBold: () => ( { commands } ) => commands.setMark( this.name ),
            toggleBold: () => ( { commands } ) => commands.toggleMark( this.name ),
            unsetBold: () => ( { commands } ) => commands.unsetMark( this.name )
        };
    },
    addKeyboardShortcuts() {
        return { 'Mod-b': () => this.editor.commands.toggleBold(), 'Mod-B': () => this.editor.commands.toggleBold() };
    }
} );

export const Italic = Mark.create( {
    name: 'italic',
    addAttributes() {
        return attributeSet( FORMAT_ATTRIBUTES );
    },
    parseHTML() {
        return [
            { tag: 'em' },
            { tag: 'i', getAttrs: node => node.style.fontStyle !== 'normal' && null },
            { style: 'font-style=italic' }
        ];
    },
    renderHTML( { HTMLAttributes } ) {
        return [ 'em', HTMLAttributes, 0 ];
    },
    addCommands() {
        return {
            setItalic: () => ( { commands } ) => commands.setMark( this.name ),
            toggleItalic: () => ( { commands } ) => commands.toggleMark( this.name ),
            unsetItalic: () => ( { commands } ) => commands.unsetMark( this.name )
        };
    },
    addKeyboardShortcuts() {
        return { 'Mod-i': () => this.editor.commands.toggleItalic(), 'Mod-I': () => this.editor.commands.toggleItalic() };
    }
} );

function nativeCustom( name, tag ) {
    const title = name === 'sub' ? 'Subscript' : 'Superscript';
    return Mark.create( {
        name: name === 'sub' ? 'subscript' : 'superscript',
        excludes: name === 'sub' ? 'superscript' : 'subscript',
        addAttributes() {
            return attributeSet( FORMAT_ATTRIBUTES.concat( [ 'align' ] ) );
        },
        parseHTML() {
            return [ { tag } ];
        },
        renderHTML( { HTMLAttributes } ) {
            return [ tag, HTMLAttributes, 0 ];
        },
        addCommands() {
            return {
                [ 'set' + title ]: () => ( { commands } ) => commands.setMark( this.name ),
                [ 'toggle' + title ]: () => ( { commands } ) => commands.toggleMark( this.name ),
                [ 'unset' + title ]: () => ( { commands } ) => commands.unsetMark( this.name )
            };
        }
    } );
}

export const Subscript = nativeCustom( 'sub', 'sub' );
export const Superscript = nativeCustom( 'sup', 'sup' );

/**
 * Links. ezoe writes href (ezobject://ID, eznode://ID or path, a URL, each optionally with #anchor), view, target,
 * title, id, class, customattributes, plus data-mce-href (TinyMCE only, never saved). The parser turns href into
 * object_id / node_id / url_id and anchor_name.
 */
export const Link = Mark.create( {
    name: 'link',
    inclusive: false,
    priority: 50,
    addAttributes() {
        return attributeSet( [ 'href', 'target', 'title', 'id', 'view' ].concat( FORMAT_ATTRIBUTES ) );
    },
    parseHTML() {
        return [ { tag: 'a[href]' } ];
    },
    renderHTML( { HTMLAttributes } ) {
        return [ 'a', HTMLAttributes, 0 ];
    },
    addCommands() {
        return {
            setLink: attributes => ( { chain } ) => chain().setMark( this.name, attributes ).run(),
            toggleLink: attributes => ( { chain } ) => chain().toggleMark( this.name, attributes, { extendEmptyMarkRange: true } ).run(),
            unsetLink: () => ( { chain } ) => chain().unsetMark( this.name, { extendEmptyMarkRange: true } ).run()
        };
    }
} );

/**
 * Inline custom tags (content.ini [CustomTagSettings] IsInline[name]=true): ezoe writes
 * <span class="ezoeItemCustomTag NAME" type="custom" customattributes="..">, and <u ...> for "underline".
 * A plain <u> (pasted, or the underline button) is the custom tag "underline" too, as eZOEInputParser reads it.
 * Several inline custom tags can be on the same text, so the mark does not exclude itself.
 */
export const CustomInline = Mark.create( {
    name: 'ezCustomInline',
    excludes: '',
    priority: 101,
    addAttributes() {
        return Object.assign( attributeSet( [ 'class', 'type', 'customattributes', 'style', 'align' ], [ 'tag' ] ), {
            tag: { default: 'span', rendered: false, parseHTML: element => element.nodeName.toLowerCase() === 'u' ? 'u' : 'span' }
        } );
    },
    parseHTML() {
        return [
            { tag: 'span[type="custom"]', priority: 60 },
            { tag: 'u[type="custom"]', priority: 60 },
            { tag: 'u', priority: 55, getAttrs: () => ( { tag: 'u', class: 'ezoeItemCustomTag underline', type: 'custom' } ) },
            { style: 'text-decoration=underline', getAttrs: () => ( { tag: 'u', class: 'ezoeItemCustomTag underline', type: 'custom' } ) }
        ];
    },
    renderHTML( { mark, HTMLAttributes } ) {
        return [ mark.attrs.tag === 'u' ? 'u' : 'span', HTMLAttributes, 0 ];
    },
    addCommands() {
        return {
            /** Puts the inline custom tag `name` (with custom attributes, as ezoe's string) on the selection. */
            setCustomInline: ( name, customattributes = null ) => ( { commands } ) => commands.setMark( this.name, {
                tag: name === 'underline' ? 'u' : 'span',
                class: 'ezoeItemCustomTag ' + name,
                type: 'custom',
                customattributes
            } ),
            /** Removes the inline custom tag `name` (all inline custom tags without a name) from the selection. */
            unsetCustomInline: name => ( { tr, state, dispatch } ) => {
                const { from, to } = state.selection;
                const type = state.schema.marks[ this.name ];
                state.doc.nodesBetween( from, to, ( node, pos ) => {
                    node.marks.forEach( mark => {
                        if ( mark.type === type && ( !name || customTagName( mark.attrs ) === name ) )
                            tr.removeMark( Math.max( pos, from ), Math.min( pos + node.nodeSize, to ), mark );
                    } );
                } );
                if ( dispatch )
                    dispatch( tr );
                return true;
            },
            toggleUnderline: () => ( { editor, commands } ) => {
                const active = editor.getAttributes( this.name );
                return customTagName( active ) === 'underline' ? commands.unsetCustomInline( 'underline' ) : commands.setCustomInline( 'underline' );
            }
        };
    },
    addKeyboardShortcuts() {
        return { 'Mod-u': () => this.editor.commands.toggleUnderline(), 'Mod-U': () => this.editor.commands.toggleUnderline() };
    }
} );

/** The marks in nesting order (first = outermost). */
export function ezoeMarks() {
    return [ CustomInline, Italic, Bold, Subscript, Superscript, Link ];
}

export { mergeAttributes };
