<?php
/**
 * Bootstrap of the PHP tests of exp_oe_tiptap (A's tests here, B's tests/php/roundtrip/, C's tests/php/ai/ may
 * require it too).
 *
 * Loads the Exponential kernel classes of the root named by EXPONENTIAL_ROOT (default: the installation this
 * extension is installed in, two levels up) and this extension's own classes ahead of any installed copy, so the
 * tests run whether or not the extension is active. ezoe's classes come from the root's autoload (ezoe is active
 * wherever this extension can run). Nothing is booted: no database, no siteaccess, no session. Settings come from
 * the root's settings/ and this extension's settings/ only, never from settings/override or a siteaccess; the INI
 * cache and the log files are off.
 *
 * Usable from the root's phpunit (php vendor/bin/phpunit extension/exp_oe_tiptap/tests/php/<File>Test.php) and with
 * the extension's own phpunit.xml.dist.
 */

if ( defined( 'EXP_OE_TIPTAP_TEST_ROOT' ) )
    return;

$extension = dirname( __DIR__, 2 );
$root = getenv( 'EXPONENTIAL_ROOT' );
if ( !is_string( $root ) || $root === '' )
    $root = dirname( $extension, 2 );
$root = rtrim( $root, '/' );
if ( !is_file( $root . '/autoload.php' ) )
{
    fwrite( STDERR, "exp_oe_tiptap tests: no Exponential root at '$root'. Set EXPONENTIAL_ROOT.\n" );
    exit( 1 );
}
define( 'EXP_OE_TIPTAP_TEST_ROOT', $root );
define( 'EXP_OE_TIPTAP_TEST_EXTENSION', $extension );

$ownClasses = array( 'exp_oe_tiptapinfo' => $extension . '/ezinfo.php' );
$classFiles = array_merge( glob( $extension . '/classes/*.php' ) ?: array(), glob( $extension . '/classes/*/*.php' ) ?: array() );
foreach ( $classFiles as $file )
{
    if ( preg_match_all( '/^\s*(?:abstract\s+|final\s+)?(?:class|interface|trait)\s+([A-Za-z_][A-Za-z0-9_]*)/m', (string) file_get_contents( $file ), $m ) )
    {
        foreach ( $m[1] as $class )
            $ownClasses[strtolower( $class )] = $file;
    }
}
spl_autoload_register( static function ( $class ) use ( $ownClasses )
{
    $key = strtolower( $class );
    if ( isset( $ownClasses[$key] ) )
        require_once $ownClasses[$key];
}, true, true );

chdir( $root );
require_once $root . '/autoload.php';

$GLOBALS['eZDebugLogFileEnabled'] = false;
$GLOBALS['eZDebugAlwaysLog'] = array( eZDebug::LEVEL_NOTICE => false, eZDebug::LEVEL_WARNING => false, eZDebug::LEVEL_ERROR => false,
                                      eZDebug::LEVEL_DEBUG => false, eZDebug::LEVEL_STRICT => false );

eZINI::setIsCacheEnabled( false );
eZINI::instance()->setOverrideDirs( array(
    'sa-extension' => array(),
    'siteaccess' => array(),
    'extension' => array( 'exp_oe_tiptap' => array( $extension . '/settings', true ) ),
    'override' => array(),
) );
eZINI::resetAllInstances( false );
