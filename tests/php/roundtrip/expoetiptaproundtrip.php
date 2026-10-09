<?php
/**
 * Round trip helpers for the exp_oe_tiptap content mapping tests.
 *
 * ezxml -> ezoe editor HTML (eZOEXMLInput::inputXML()) and ezoe editor HTML -> ezxml (eZOEInputParser, the
 * same steps eZOEXMLInput::validateInput() takes), plus a comparison of two ezxml documents that tells an
 * identical result from one that only differs in whitespace or inline nesting order, and from a lossy one.
 *
 * The parser registers the URLs of links (eZURL::registerURL()), so the helpers must run against a copy of
 * the database: useSandboxDatabase() switches the kernel to it and refuses anything else.
 *
 * @copyright Copyright (C) 1998 - 2026 7x & Exponential Foundation
 * @license GNU General Public License v2.0 (or any later version)
 * @package exp_oe_tiptap
 */

class expOETiptapRoundtrip
{
    const NS_XHTML = 'http://ez.no/namespaces/ezpublish3/xhtml/';
    const NS_CUSTOM = 'http://ez.no/namespaces/ezpublish3/custom/';

    /**
     * Switches the kernel to the SQLite database file $path (a copy, never the live database) and turns off
     * template compiling and caching so rendering embeds writes nothing to the shared cache.
     *
     * @param string $path absolute path of the SQLite copy
     * @return string the file the connection really uses
     */
    public static function useSandboxDatabase( $path )
    {
        if ( !$path || $path[0] !== '/' || !is_file( $path ) )
            throw new RuntimeException( "Sandbox database '$path' is not an absolute path of an existing file" );
        $live = realpath( eZSQLite3DB::filePath( eZINI::instance()->variable( 'DatabaseSettings', 'Database' ) ) );
        if ( $live && realpath( $path ) === $live )
            throw new RuntimeException( 'Refusing to use the live database' );

        $db = eZDB::instance( 'sqlite3', array( 'database' => $path ), true );
        eZDB::setInstance( $db );
        $rows = $db->arrayQuery( 'PRAGMA database_list' );
        $file = '';
        foreach ( (array)$rows as $row )
        {
            if ( $row['name'] === 'main' )
                $file = $row['file'];
        }
        if ( realpath( $file ) !== realpath( $path ) )
            throw new RuntimeException( "Database switch failed: connected to '$file'" );

        $ini = eZINI::instance();
        $ini->setVariable( 'TemplateSettings', 'TemplateCompile', 'disabled' );
        $ini->setVariable( 'TemplateSettings', 'TemplateCache', 'disabled' );
        return $file;
    }

    /**
     * The editor HTML ezoe puts into the textarea for $xml (decoded, as the browser sees the textarea value).
     *
     * @param string $xml
     * @return string
     */
    public static function xmlToEditorHTML( $xml )
    {
        $input = new eZOEXMLInput( $xml, false, null );
        return htmlspecialchars_decode( $input->inputXML(), ENT_COMPAT );
    }

    /**
     * The ezxml ezoe stores for posted editor HTML, as eZOEXMLInput::validateInput() makes it.
     *
     * @param string $html
     * @param array $messages filled with the parser's messages
     * @return string
     */
    public static function editorHTMLToXML( $html, &$messages = array() )
    {
        $parser = new eZOEInputParser();
        $document = $parser->process( $html );
        if ( !$document instanceof DOMDocument )
        {
            $messages = $parser->Messages;
            return '';
        }

        // Remove last empty paragraph (added in the output part), as validateInput() does
        $parent = $document->documentElement;
        $lastChild = $parent->lastChild;
        while ( $lastChild && $lastChild->nodeName !== 'paragraph' )
        {
            $parent = $lastChild;
            $lastChild = $parent->lastChild;
        }
        if ( $lastChild && $lastChild->nodeName === 'paragraph' )
        {
            $textChild = $lastChild->lastChild;
            if ( !$textChild ||
                 ( $lastChild->childNodes->length == 1 &&
                   $textChild->nodeType == XML_TEXT_NODE &&
                   in_array( $textChild->textContent, array( ' ', '', '&nbsp;', "\xC2\xA0" ), true ) ) )
            {
                $parent->removeChild( $lastChild );
            }
        }
        $messages = $parser->Messages;
        return eZXMLTextType::domString( $document );
    }

    /**
     * Compares two ezxml documents.
     *
     * @param string $expected
     * @param string $actual
     * @return array ( 'result' => 'identical'|'equal'|'lossy', 'detail' => string )
     */
    public static function compare( $expected, $actual )
    {
        $a = self::strictForm( $expected );
        $b = self::strictForm( $actual );
        if ( $a === $b )
            return array( 'result' => 'identical', 'detail' => '' );

        $sa = self::semanticForm( $expected );
        $sb = self::semanticForm( $actual );
        if ( $sa === $sb )
            return array( 'result' => 'equal', 'detail' => self::firstDifference( $a, $b ) );

        return array( 'result' => 'lossy', 'detail' => self::firstDifference( $sa, $sb ) );
    }

    /**
     * The document as a string with sorted attributes and without namespace declarations; text kept exactly.
     */
    public static function strictForm( $xml )
    {
        $dom = self::load( $xml );
        if ( !$dom )
            return 'INVALID XML';
        return self::strictNode( $dom->documentElement );
    }

    protected static function strictNode( DOMNode $node )
    {
        if ( $node instanceof DOMText )
            return 'T(' . $node->data . ')';
        if ( !$node instanceof DOMElement )
            return '';
        $out = '<' . $node->nodeName . self::attributeString( $node, false ) . '>';
        foreach ( $node->childNodes as $child )
            $out .= self::strictNode( $child );
        return $out . '</' . $node->nodeName . '>';
    }

    protected static function attributeString( DOMElement $node, $resolveUrls )
    {
        $attributes = array();
        foreach ( $node->attributes as $attribute )
        {
            $name = $attribute->prefix ? $attribute->prefix . ':' . $attribute->localName : $attribute->localName;
            $value = $attribute->value;
            if ( $resolveUrls && $name === 'url_id' && $node->nodeName === 'link' )
            {
                // the fixtures carry placeholders for e-mail addresses, the database the real ones
                $name = 'url';
                $value = self::scrubPersonalData( (string)eZURL::url( (int)$value ) );
            }
            $attributes[$name] = $value;
        }
        ksort( $attributes );
        $out = '';
        foreach ( $attributes as $name => $value )
            $out .= ' ' . $name . '="' . htmlspecialchars( $value, ENT_QUOTES, 'UTF-8' ) . '"';
        return $out;
    }

    /**
     * Inline elements whose nesting order does not change what is rendered: they are compared as a set of
     * "marks" on each run of text.
     */
    protected static $markElements = array( 'strong', 'emphasize', 'link' );

    /**
     * The document in a form that ignores whitespace differences (runs of spaces and no-break spaces are one
     * space, whitespace only text between blocks is dropped, text is trimmed at the start and end of a
     * paragraph, line, header and list item), resolves link url_id to the URL and flattens the nesting of
     * strong, emphasize, link and inline custom tags.
     */
    public static function semanticForm( $xml )
    {
        $dom = self::load( $xml );
        if ( !$dom )
            return 'INVALID XML';
        return self::semanticBlock( $dom->documentElement );
    }

    protected static function isInlineCustom( DOMElement $node )
    {
        if ( $node->nodeName !== 'custom' )
            return false;
        return eZOEXMLInput::customTagIsInline( $node->getAttribute( 'name' ) ) === true;
    }

    protected static function isMark( DOMNode $node )
    {
        return $node instanceof DOMElement &&
               ( in_array( $node->nodeName, self::$markElements, true ) || self::isInlineCustom( $node ) );
    }

    protected static function semanticBlock( DOMElement $node )
    {
        $name = $node->nodeName;
        $out = '<' . $name . self::attributeString( $node, true ) . '>';
        if ( in_array( $name, array( 'paragraph', 'line', 'header', 'li', 'td', 'th' ), true ) || self::isMark( $node ) )
        {
            $runs = array();
            self::flatten( $node, array(), $runs, false );
            $out .= self::runsString( $runs );
        }
        else
        {
            foreach ( $node->childNodes as $child )
            {
                if ( $child instanceof DOMElement )
                    $out .= self::semanticBlock( $child );
                else if ( $child instanceof DOMText && trim( str_replace( "\xC2\xA0", ' ', $child->data ) ) !== '' )
                    $out .= 'T(' . self::collapse( $child->data ) . ')';
            }
        }
        return $out . '</' . $name . '>';
    }

    /**
     * Flattens the inline content of $node into runs: array( marks, text ) or array( null, block string ).
     */
    protected static function flatten( DOMElement $node, array $marks, array &$runs, $inside )
    {
        foreach ( $node->childNodes as $child )
        {
            if ( $child instanceof DOMText )
            {
                $runs[] = array( $marks, $child->data );
            }
            else if ( $child instanceof DOMElement && self::isMark( $child ) )
            {
                $key = $child->nodeName . self::attributeString( $child, true );
                $childMarks = $marks;
                $childMarks[$key] = true;
                ksort( $childMarks );
                self::flatten( $child, $childMarks, $runs, true );
            }
            else if ( $child instanceof DOMElement )
            {
                $runs[] = array( null, self::semanticBlock( $child ) . ( $marks ? '@' . implode( '+', array_keys( $marks ) ) : '' ) );
            }
        }
    }

    protected static function runsString( array $runs )
    {
        // merge neighbouring text runs with the same marks
        $merged = array();
        foreach ( $runs as $run )
        {
            $last = count( $merged ) - 1;
            if ( $run[0] !== null && $last >= 0 && $merged[$last][0] !== null &&
                 array_keys( $merged[$last][0] ) === array_keys( $run[0] ) )
                $merged[$last][1] .= $run[1];
            else
                $merged[] = $run;
        }
        // whitespace: collapse, drop empty runs, then trim the start and the end of each stretch of text (white
        // space at the edge of a block is not rendered, whatever inline element holds it)
        $runs = array();
        foreach ( $merged as $run )
        {
            if ( $run[0] !== null )
            {
                $run[1] = self::collapse( $run[1] );
                if ( $run[1] === '' )
                    continue;
            }
            $runs[] = $run;
        }
        $count = count( $runs );
        for ( $i = 0; $i < $count; $i++ )
        {
            if ( $runs[$i][0] === null || ( $i > 0 && $runs[$i - 1][0] !== null ) )
                continue;
            // start of a stretch: trim forward
            for ( $j = $i; $j < $count && $runs[$j][0] !== null; $j++ )
            {
                $runs[$j][1] = ltrim( $runs[$j][1] );
                if ( $runs[$j][1] !== '' )
                    break;
            }
        }
        for ( $i = $count - 1; $i >= 0; $i-- )
        {
            if ( $runs[$i][0] === null || ( $i < $count - 1 && $runs[$i + 1][0] !== null ) )
                continue;
            for ( $j = $i; $j >= 0 && $runs[$j][0] !== null; $j-- )
            {
                $runs[$j][1] = rtrim( $runs[$j][1] );
                if ( $runs[$j][1] !== '' )
                    break;
            }
        }
        $out = array();
        foreach ( $runs as $run )
        {
            if ( $run[0] === null )
                $out[] = $run[1];
            else if ( $run[1] !== '' )
                $out[] = 'T[' . implode( '+', array_keys( $run[0] ) ) . '](' . $run[1] . ')';
        }
        return implode( '', $out );
    }

    /**
     * Replaces e-mail addresses (personal data) with a placeholder; used for the fixtures taken from real content.
     *
     * @param string $text
     * @return string
     */
    public static function scrubPersonalData( $text )
    {
        return preg_replace( '/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/', 'person@example.com', $text );
    }

    protected static function collapse( $text )
    {
        return preg_replace( '/[\s\x{00A0}]+/u', ' ', $text );
    }

    protected static function load( $xml )
    {
        if ( trim( (string)$xml ) === '' )
            return false;
        $dom = new DOMDocument( '1.0', 'utf-8' );
        $previous = libxml_use_internal_errors( true );
        $ok = $dom->loadXML( $xml );
        libxml_clear_errors();
        libxml_use_internal_errors( $previous );
        return $ok ? $dom : false;
    }

    protected static function firstDifference( $a, $b )
    {
        $length = min( strlen( $a ), strlen( $b ) );
        $i = 0;
        while ( $i < $length && $a[$i] === $b[$i] )
            $i++;
        // back to a character boundary
        while ( $i > 0 && ( ord( $a[$i] ?? "\0" ) & 0xC0 ) === 0x80 )
            $i--;
        $from = max( 0, $i - 60 );
        return 'expected …' . substr( $a, $from, 160 ) . "…\n      got …" . substr( $b, $from, 160 ) . '…';
    }
}
