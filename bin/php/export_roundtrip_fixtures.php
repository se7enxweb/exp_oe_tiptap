#!/usr/bin/env php
<?php
/**
 * Exports round trip fixtures from a site's own content: for every published object's current version, each ezxmltext
 * attribute with content becomes a pair
 *
 *   <prefix>-<class>-<attribute>-o<object id>[-<language>].xml   the stored ezxml
 *   <prefix>-<class>-<attribute>-o<object id>[-<language>].html  the ezoe editor HTML eZOEXMLInput::inputXML() makes of
 *                                                                it (expOETiptapRoundtrip::xmlToEditorHTML(), the same
 *                                                                path as the fixtures in tests/fixtures/)
 *
 * The language is added to the name when it is not the object's initial language. The pairs are what
 * tests/php/roundtrip/run.sh reads with EXPOETIPTAP_FIXTURES_DIR (or run.sh --fixtures=<dir>).
 *
 * Not strictly read only. eZOEXMLInput::inputXML() can create image aliases of embedded images: that writes rows
 * (the image attribute's alias list) and image files under var/storage. The whole export therefore runs in one
 * database transaction that is always rolled back, so no row it wrote is kept; the script refuses to run when
 * [DatabaseSettings] Transactions is not enabled. What the rollback cannot undo: alias files written to disk stay
 * in var/storage (with no row pointing to them; the next request that needs them makes them again), tables of an
 * engine without transactions (MyISAM) keep their rows, and a cluster file handler with a database of its own
 * (DFS) keeps its metadata rows. Run it on a copy of the site where that matters. Template compiling and caching
 * are turned off so rendering embed previews writes nothing to the cache. The content is the site's own content,
 * so --out must lie outside the extension's tests/fixtures/ (which is committed) unless --into-tests is given.
 *
 * Run from the Exponential root, always with the siteaccess whose database and settings you mean:
 *   php extension/exp_oe_tiptap/bin/php/export_roundtrip_fixtures.php -s <admin siteaccess> --out=/abs/path/fixtures
 *   php extension/exp_oe_tiptap/bin/php/export_roundtrip_fixtures.php -s <admin siteaccess> --out=/tmp/rt \
 *       --class=article --limit=100 --offset=200
 *
 * @copyright Copyright (C) 1998 - 2026 Exponential Foundation and 7x. All rights reserved.
 * @license GNU General Public License v2.0 (or any later version)
 * @package exp_oe_tiptap
 */

require 'autoload.php';
require_once __DIR__ . '/../../tests/php/roundtrip/expoetiptaproundtrip.php';

$cli = eZCLI::instance();
$script = eZScript::instance( array( 'description' => "Exports ezxmltext fields (ezxml and ezoe editor HTML) as round trip fixtures of exp_oe_tiptap.\n",
                                     'use-session' => false,
                                     'use-modules' => true,
                                     'use-extensions' => true ) );
$script->startup();
// getOptions() before initialize(): only then does -s choose the database
$options = $script->getOptions( '[out:][limit:][offset:][class:][prefix:][into-tests]', '',
                                array( 'out' => 'Directory to write the fixtures to (required; created if missing)',
                                       'limit' => 'Export at most this many attributes',
                                       'offset' => 'Skip this many attributes first (in the order of object id, attribute id, language)',
                                       'class' => 'Only objects of these classes (identifiers, comma separated)',
                                       'prefix' => 'Prefix of the file names (default rt)',
                                       'into-tests' => 'Allow --out inside the extension\'s tests/fixtures/ (committed: only for content you may publish)' ) );
$script->initialize();

$siteAccess = $script->usedSiteAccess();
if ( !$options['siteaccess'] || $siteAccess !== $options['siteaccess'] )
{
    $cli->error( 'FAIL: name the siteaccess with -s <siteaccess>; its database is the one exported from' );
    $script->shutdown( 1 );
}
if ( !$options['out'] )
{
    $cli->error( 'FAIL: --out=<dir> is required' );
    $script->shutdown( 1 );
}
$prefix = $options['prefix'] !== null ? (string) $options['prefix'] : 'rt';
if ( !preg_match( '/^[A-Za-z0-9_]+$/', $prefix ) )
{
    $cli->error( "FAIL: --prefix='$prefix' must be letters, digits and underscores" );
    $script->shutdown( 1 );
}
$limit = $options['limit'] !== null ? (int) $options['limit'] : 0;
$offset = $options['offset'] !== null ? (int) $options['offset'] : 0;
if ( $limit < 0 || $offset < 0 )
{
    $cli->error( 'FAIL: --limit and --offset must not be negative' );
    $script->shutdown( 1 );
}
$classes = $options['class'] ? array_values( array_filter( array_map( 'trim', explode( ',', $options['class'] ) ) ) ) : array();
foreach ( $classes as $identifier )
{
    if ( !preg_match( '/^[A-Za-z0-9_]+$/', $identifier ) )
    {
        $cli->error( "FAIL: '$identifier' is not a class identifier" );
        $script->shutdown( 1 );
    }
}

$out = (string) $options['out'];
if ( !is_dir( $out ) && !mkdir( $out, 0777, true ) )
{
    $cli->error( "FAIL: cannot create '$out'" );
    $script->shutdown( 1 );
}
$out = realpath( $out );
$testFixtures = realpath( __DIR__ . '/../../tests/fixtures' );
if ( $testFixtures && ( $out === $testFixtures || strpos( $out . '/', $testFixtures . '/' ) === 0 ) && !$options['into-tests'] )
{
    $cli->error( "FAIL: '$out' is the extension's tests/fixtures/, which is committed; a site's content does not belong "
               . 'there. Use another directory, or --into-tests for content you may publish.' );
    $script->shutdown( 1 );
}

// rendering embed previews must not fill the shared template cache
$ini = eZINI::instance();
$ini->setVariable( 'TemplateSettings', 'TemplateCompile', 'disabled' );
$ini->setVariable( 'TemplateSettings', 'TemplateCache', 'disabled' );

$db = eZDB::instance();
$cli->output( sprintf( 'Siteaccess %s, database %s (%s); no other siteaccess or database was read', $siteAccess,
                       (string) $db->DB, get_class( $db ) ) );
// inputXML() may create image aliases (rows and files): every row is written inside one transaction that is rolled
// back at the end, so without transactions the export would keep them
if ( $ini->variable( 'DatabaseSettings', 'Transactions' ) !== 'enabled' )
{
    $cli->error( 'FAIL: [DatabaseSettings] Transactions is not enabled for this siteaccess; the export runs in a '
               . 'transaction that is rolled back, so that the image aliases inputXML() may create are not kept' );
    $script->shutdown( 1 );
}

$where = "a.data_type_string = 'ezxmltext' AND o.status = " . (int) eZContentObject::STATUS_PUBLISHED;
if ( $classes )
{
    $quoted = array();
    foreach ( $classes as $identifier )
        $quoted[] = "'" . $db->escapeString( $identifier ) . "'";
    $where .= ' AND c.identifier IN (' . implode( ', ', $quoted ) . ')';
}
$sql = "SELECT a.id, a.contentobject_id, a.language_code, a.data_text, c.identifier AS class_identifier,
               ca.identifier AS attribute_identifier, l.locale AS initial_language
        FROM ezcontentobject o
        JOIN ezcontentobject_attribute a ON a.contentobject_id = o.id AND a.version = o.current_version
        JOIN ezcontentclass c ON c.id = o.contentclass_id AND c.version = 0
        JOIN ezcontentclass_attribute ca ON ca.id = a.contentclassattribute_id AND ca.version = 0
        LEFT JOIN ezcontent_language l ON l.id = o.initial_language_id
        WHERE $where
        ORDER BY o.id, a.id, a.language_code";

$written = 0;
$skipped = 0;
$failed = 0;
$seen = 0;
$batch = 200;
$position = 0;
$db->begin();
try
{
    while ( true )
    {
        // a rollback inside the kernel ends every level of the transaction: open it again, so later writes are rolled back too
        if ( $db->transactionCounter() < 1 )
            $db->begin();
        $rows = $db->arrayQuery( $sql, array( 'offset' => $position, 'limit' => $batch ) );
        if ( !$rows )
            break;
        $position += count( $rows );
        foreach ( $rows as $row )
        {
            $xml = (string) $row['data_text'];
            if ( !expOETiptapExportHasContent( $xml ) )
            {
                ++$skipped;
                continue;
            }
            // --offset and --limit count attributes with content, the ones that become fixtures
            if ( $seen++ < $offset )
                continue;
            if ( $limit && $written + $failed >= $limit )
                break 2;
            $name = sprintf( '%s-%s-%s-o%d', $prefix, $row['class_identifier'], $row['attribute_identifier'], $row['contentobject_id'] );
            if ( $row['language_code'] !== $row['initial_language'] )
                $name .= '-' . $row['language_code'];
            $name = str_replace( '_', '-', $name );
            try
            {
                $html = expOETiptapRoundtrip::xmlToEditorHTML( $xml );
            }
            catch ( Throwable $e )
            {
                ++$failed;
                $cli->warning( "SKIP $name: inputXML() failed: " . $e->getMessage() );
                continue;
            }
            file_put_contents( "$out/$name.xml", $xml );
            file_put_contents( "$out/$name.html", $html );
            ++$written;
            if ( $written % 500 === 0 )
                $cli->output( "  $written written" );
        }
        eZContentObject::clearCache();
    }
}
finally
{
    // always: what inputXML() wrote to the database (image alias rows) is not kept
    if ( $db->transactionCounter() > 0 )
        $db->rollback();
}

$cli->output( sprintf( '%s: %d fixtures written to %s, %d empty fields skipped, %d failed (siteaccess %s, database %s)',
                       $failed ? 'WARN' : 'PASS', $written, $out, $skipped, $failed, $siteAccess, (string) $db->DB ) );
$script->shutdown( $failed ? 1 : 0 );

/**
 * @param string $xml stored ezxml
 * @return bool the document has anything below its <section>
 */
function expOETiptapExportHasContent( $xml )
{
    if ( trim( $xml ) === '' )
        return false;
    $dom = new DOMDocument( '1.0', 'utf-8' );
    $previous = libxml_use_internal_errors( true );
    $ok = $dom->loadXML( $xml );
    libxml_clear_errors();
    libxml_use_internal_errors( $previous );
    // an unreadable document is exported: the round trip reports what happens to it
    return !$ok || ( $dom->documentElement && $dom->documentElement->hasChildNodes() );
}
