<?php
/**
 * Round trip helpers for the exp_oe_tiptap content mapping tests.
 *
 * ezxml -> ezoe editor HTML (eZOEXMLInput::inputXML()) and ezoe editor HTML -> ezxml (eZOEInputParser, the
 * same steps eZOEXMLInput::validateInput() takes), plus a comparison of two ezxml documents that tells an
 * identical result from one that only differs in whitespace or inline nesting order, and from a lossy one.
 *
 * The parser registers the URLs of links (eZURL::registerURL()), so the helpers must run against a copy of
 * the database: useSandbox() switches the kernel to it (an SQLite file, or a MySQL database named *_sandbox or *_rt
 * that is no siteaccess's Database and carries the marker table exp_oe_tiptap_sandbox) and refuses anything else.
 *
 * @copyright Copyright (C) 1998 - 2026 Exponential Foundation and 7x. All rights reserved.
 * @license GNU General Public License v2.0 (or any later version)
 * @package exp_oe_tiptap
 */

class expOETiptapRoundtrip
{
    const NS_XHTML = 'http://ez.no/namespaces/ezpublish3/xhtml/';
    const NS_CUSTOM = 'http://ez.no/namespaces/ezpublish3/custom/';

    /** A MySQL sandbox database name must end with one of these, so a live database is never taken by mistake */
    const SANDBOX_SUFFIX_PATTERN = '/_(sandbox|rt)$/';

    /**
     * A MySQL sandbox must contain a table of this name. The copy procedure creates it in the copy (never in the live
     * database), so a database that merely has a sandbox-like name is refused.
     */
    const SANDBOX_MARKER_TABLE = 'exp_oe_tiptap_sandbox';

    /**
     * Reads the sandbox argument of run.sh: an absolute path of an SQLite file (a copy of the database), or
     * mysql:<name> for a MySQL/MariaDB database on the server of the siteaccess (a copy, whose name ends with _sandbox
     * or _rt and differs from the siteaccess's live database and from the Database of every siteaccess and of the
     * override).
     *
     * For MySQL the name is checked here; useSandbox() then requires the marker table SANDBOX_MARKER_TABLE in the
     * database before anything else runs (requireSandboxMarker()). An SQLite file is compared with the live file by
     * device and inode (isSameFile()).
     *
     * @param string $value
     * @param string $liveImplementation [DatabaseSettings] DatabaseImplementation of the siteaccess
     * @param string $liveDatabase       [DatabaseSettings] Database of the siteaccess
     * @param array|null $configuredDatabases the [DatabaseSettings] Database values of the installation's site.ini
     *                   files (configuredDatabases()); null reads them from the installation in the current directory
     * @return array ( 'type' => 'sqlite', 'path' => string ) or ( 'type' => 'mysql', 'database' => string )
     * @throws RuntimeException when the value is not a sandbox
     */
    public static function parseSandbox( $value, $liveImplementation, $liveDatabase, $configuredDatabases = null )
    {
        $value = trim( (string)$value );
        if ( stripos( $value, 'mysql:' ) === 0 )
        {
            $name = substr( $value, 6 );
            if ( !preg_match( '/^[A-Za-z0-9_]{1,64}$/', $name ) )
                throw new RuntimeException( "Sandbox database '$name' is not a database name (letters, digits, underscore)" );
            if ( !preg_match( self::SANDBOX_SUFFIX_PATTERN, $name ) )
                throw new RuntimeException( "Refusing the database '$name': the name of a sandbox copy must end with _sandbox or _rt" );
            if ( self::isMySQL( $liveImplementation ) && strcasecmp( $name, (string)$liveDatabase ) === 0 )
                throw new RuntimeException( 'Refusing to use the live database' );
            if ( $configuredDatabases === null )
                $configuredDatabases = self::configuredDatabases( '.' );
            foreach ( $configuredDatabases as $file => $databases )
            {
                foreach ( (array)$databases as $database )
                {
                    if ( strcasecmp( $name, (string)$database ) === 0 )
                        throw new RuntimeException( "Refusing the database '$name': it is the Database of $file, a live database of the installation" );
                }
            }
            return array( 'type' => 'mysql', 'database' => $name );
        }
        if ( $value === '' || $value[0] !== '/' || !is_file( $value ) )
            throw new RuntimeException( "Sandbox database '$value' is neither an absolute path of an existing SQLite file nor mysql:<name>" );
        if ( !self::isMySQL( $liveImplementation ) && self::isSameFile( $value, eZSQLite3DB::filePath( (string)$liveDatabase ) ) )
            throw new RuntimeException( 'Refusing to use the live database' );
        return array( 'type' => 'sqlite', 'path' => realpath( $value ) );
    }

    /**
     * The [DatabaseSettings] Database values of the installation's site.ini files: every siteaccess's
     * (settings/siteaccess/<siteaccess>/ and extension/<extension>/settings/siteaccess/<siteaccess>/) and the
     * override's (settings/override/), site.ini.append.php or site.ini.append. The files are only read.
     *
     * @param string $root the installation root
     * @return array file (relative to $root) => list of Database values
     */
    public static function configuredDatabases( $root )
    {
        $root = rtrim( (string)$root, '/' );
        $files = array();
        foreach ( array( 'settings/override', 'settings/siteaccess/*', 'extension/*/settings/siteaccess/*' ) as $dir )
        {
            foreach ( array( 'site.ini.append.php', 'site.ini.append' ) as $name )
                $files = array_merge( $files, glob( "$root/$dir/$name" ) ?: array() );
        }
        $result = array();
        foreach ( $files as $file )
        {
            $text = @file_get_contents( $file );
            if ( !is_string( $text ) )
                continue;
            $databases = self::databasesInSiteIni( $text );
            if ( $databases )
                $result[substr( $file, strlen( $root ) + 1 )] = $databases;
        }
        return $result;
    }

    /**
     * The Database values of the [DatabaseSettings] blocks of a site.ini text (the INI format of the kernel: [Block],
     * Name=value, # comments, optionally inside the <?php / * ... * / ?> wrapper of .ini.append.php).
     *
     * @param string $text
     * @return string[]
     */
    public static function databasesInSiteIni( $text )
    {
        $databases = array();
        $block = '';
        foreach ( preg_split( '/\r\n|\r|\n/', (string)$text ) as $line )
        {
            $line = trim( $line );
            if ( $line === '' || $line[0] === '#' )
                continue;
            if ( preg_match( '/^\[([^\]]+)\]/', $line, $m ) )
            {
                $block = trim( $m[1] );
                continue;
            }
            if ( $block === 'DatabaseSettings' && preg_match( '/^Database\s*=\s*(.*)$/', $line, $m ) )
            {
                $value = trim( $m[1] );
                if ( $value !== '' )
                    $databases[] = $value;
            }
        }
        return array_values( array_unique( $databases ) );
    }

    /**
     * Refuses a MySQL sandbox without the marker table SANDBOX_MARKER_TABLE: the copy procedure creates it in the
     * copy, so a database with a sandbox-like name that is not a prepared copy is never written to.
     *
     * @param string $database the sandbox database name
     * @param callable $hasTable function( string $table ): bool, whether the sandbox database has that table
     * @throws RuntimeException when the marker table is missing
     */
    public static function requireSandboxMarker( $database, $hasTable )
    {
        if ( !call_user_func( $hasTable, self::SANDBOX_MARKER_TABLE ) )
            throw new RuntimeException( "Refusing the database '$database': it has no table " . self::SANDBOX_MARKER_TABLE
                                      . ' (create it in the copy, never in the live database: CREATE TABLE '
                                      . self::SANDBOX_MARKER_TABLE . ' ( id INT )' );
    }

    /**
     * The directory the round trip reads its fixture pairs from: tests/fixtures/ of the extension, or the directory
     * EXPOETIPTAP_FIXTURES_DIR names (pairs from bin/php/export_roundtrip_fixtures.php).
     *
     * @param string|false $value the value of EXPOETIPTAP_FIXTURES_DIR
     * @return string|false the absolute path, or false when the directory named does not exist
     */
    public static function fixturesDir( $value )
    {
        $value = trim( (string)$value );
        if ( $value === '' )
            return realpath( __DIR__ . '/../../fixtures' );
        return is_dir( $value ) ? realpath( $value ) : false;
    }

    /**
     * Whether two paths name the same file: same device and inode (stat()), so neither a different spelling on a case
     * insensitive file system nor a hard or symbolic link lets the live SQLite file pass for a copy.
     *
     * @param string $a
     * @param string $b
     * @return bool
     */
    public static function isSameFile( $a, $b )
    {
        $sa = @stat( (string)$a );
        $sb = @stat( (string)$b );
        if ( !$sa || !$sb )
            return false;
        return $sa['dev'] === $sb['dev'] && $sa['ino'] === $sb['ino'];
    }

    /** @return bool the database implementation is MySQL or MariaDB */
    public static function isMySQL( $implementation )
    {
        return in_array( strtolower( (string)$implementation ), array( 'ezmysqli', 'ezmysql', 'mysqli', 'mysql' ), true );
    }

    /**
     * Switches the kernel to the sandbox database (parseSandbox(): an SQLite copy or a MySQL copy on the server of
     * the siteaccess, never the live database) and turns off template compiling and caching so rendering embeds
     * writes nothing to the shared cache.
     *
     * @param string $value absolute path of the SQLite copy, or mysql:<name>
     * @return string what the connection really uses (the file, or mysql:<name>)
     */
    public static function useSandbox( $value )
    {
        $ini = eZINI::instance();
        $implementation = (string)$ini->variable( 'DatabaseSettings', 'DatabaseImplementation' );
        $sandbox = self::parseSandbox( $value, $implementation, (string)$ini->variable( 'DatabaseSettings', 'Database' ) );
        if ( $sandbox['type'] === 'mysql' )
        {
            // the server, user and password of the siteaccess, another database; no slave server
            $db = eZDB::instance( self::isMySQL( $implementation ) ? $implementation : 'ezmysqli',
                                  array( 'database' => $sandbox['database'], 'use_slave_server' => false ), true );
            if ( !$db->isConnected() )
                throw new RuntimeException( "Could not connect to the sandbox database '{$sandbox['database']}'" );
            $rows = $db->arrayQuery( 'SELECT DATABASE() AS name' );
            $used = isset( $rows[0]['name'] ) ? (string)$rows[0]['name'] : '';
            if ( $used !== $sandbox['database'] )
                throw new RuntimeException( "Database switch failed: connected to '$used'" );
            // before the kernel uses the connection: the copy must carry the marker table
            self::requireSandboxMarker( $used, static function ( $table ) use ( $db )
            {
                $found = $db->arrayQuery( "SELECT COUNT(*) AS n FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = '"
                                          . $db->escapeString( $table ) . "'" );
                return isset( $found[0]['n'] ) && (int)$found[0]['n'] > 0;
            } );
            eZDB::setInstance( $db );
            $result = 'mysql:' . $used;
        }
        else
        {
            $db = eZDB::instance( 'sqlite3', array( 'database' => $sandbox['path'] ), true );
            eZDB::setInstance( $db );
            $rows = $db->arrayQuery( 'PRAGMA database_list' );
            $file = '';
            foreach ( (array)$rows as $row )
            {
                if ( $row['name'] === 'main' )
                    $file = $row['file'];
            }
            if ( realpath( $file ) !== $sandbox['path'] )
                throw new RuntimeException( "Database switch failed: connected to '$file'" );
            $result = $file;
        }

        $ini->setVariable( 'TemplateSettings', 'TemplateCompile', 'disabled' );
        $ini->setVariable( 'TemplateSettings', 'TemplateCache', 'disabled' );
        return $result;
    }

    /**
     * Switches the kernel to the SQLite database file $path (a copy, never the live database). Kept for callers of
     * 0.1.x; useSandbox() takes a MySQL copy as well.
     *
     * @param string $path absolute path of the SQLite copy
     * @return string the file the connection really uses
     */
    public static function useSandboxDatabase( $path )
    {
        if ( !$path || $path[0] !== '/' || !is_file( $path ) )
            throw new RuntimeException( "Sandbox database '$path' is not an absolute path of an existing file" );
        return self::useSandbox( $path );
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
            else if ( $resolveUrls && $name === 'href' && $node->nodeName === 'link' )
            {
                // a fixture link whose target was replaced by a placeholder names it as href (the package form of
                // a link), because no url_id of the database points to the placeholder
                $name = 'url';
                $value = self::scrubPersonalData( $value );
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
     * paragraph, line, header and list item), resolves link url_id (or a placeholder href) to the URL and flattens
     * the nesting of strong, emphasize, link and inline custom tags.
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
        // mb_strcut(): never half a character, so the detail stays valid UTF-8 (report.json)
        return 'expected …' . mb_strcut( $a, $from, 160, 'UTF-8' ) . "…\n      got …" . mb_strcut( $b, $from, 160, 'UTF-8' ) . '…';
    }
}
