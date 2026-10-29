#!/usr/bin/env php
<?php
/**
 * Moves the user preference exp_oe_editor of exp_oe_tiptap 0.1.0 to ezoe's preference ezoe_engine, for every user.
 *
 * Since 0.1.1 the editor is chosen in ezoe's engine registry (Tiptap is the engine "tiptap"). Users who chose Tiptap
 * with the 0.1.0 switch get ezoe_engine=tiptap, unless they have chosen an engine in ezoe already; "ezoe" means the
 * site default and stores nothing. The old preference is emptied either way. The edit form does the same for one
 * user the first time it opens, so running this script is optional; it makes the page ezoe/engine right at once.
 *
 * Run from the Exponential root:
 *   php extension/exp_oe_tiptap/bin/php/migrate_editor_preference.php -s <admin siteaccess> --dry-run
 *   php extension/exp_oe_tiptap/bin/php/migrate_editor_preference.php -s <admin siteaccess>
 *
 * @copyright Copyright (C) 1998 - 2026 Exponential Foundation and 7x. All rights reserved.
 * @license GNU General Public License v2.0 (or any later version)
 * @package exp_oe_tiptap
 */

require 'autoload.php';

$cli = eZCLI::instance();
$script = eZScript::instance( array( 'description' => "Moves the preference exp_oe_editor (exp_oe_tiptap 0.1.0) to ezoe's ezoe_engine for every user.\n",
                                     'use-session' => false,
                                     'use-modules' => false,
                                     'use-extensions' => true ) );
$script->startup();
$options = $script->getOptions( '[dry-run]', '', array( 'dry-run' => 'Show what would change, change nothing' ) );
$script->initialize();
$dryRun = (bool) $options['dry-run'];

if ( !class_exists( 'expOEEditor' ) )
{
    $cli->error( 'FAIL: ezoe has no engine registry here (expOEEditor is missing); nothing to migrate to.' );
    $script->shutdown( 1 );
}

$db = eZDB::instance();
$configured = expOEEditor::configuredEngine();
$rows = $db->arrayQuery( "SELECT user_id, value FROM ezpreferences WHERE name = '" . $db->escapeString( expOETiptapEditor::PREFERENCE ) . "'" );
$moved = 0;
$cleared = 0;
foreach ( $rows as $row )
{
    $userID = (int) $row['user_id'];
    $legacy = (string) $row['value'];
    if ( $legacy === '' )
        continue;
    $current = $db->arrayQuery( 'SELECT value FROM ezpreferences WHERE user_id = ' . $userID
                              . " AND name = '" . $db->escapeString( expOETiptapEditor::ENGINE_PREFERENCE ) . "'" );
    $current = $current ? (string) $current[0]['value'] : false;
    $engine = expOETiptapEditor::migratedEngine( $legacy, $current, $configured );
    $cli->output( sprintf( 'user %d: exp_oe_editor=%s, ezoe_engine=%s -> %s', $userID, $legacy,
                           $current === false ? '(none)' : ( $current === '' ? '(site default)' : $current ),
                           $engine === null ? 'unchanged' : 'ezoe_engine=' . $engine ) );
    if ( $dryRun )
        continue;
    if ( $engine !== null && eZPreferences::setValue( expOETiptapEditor::ENGINE_PREFERENCE, $engine, $userID ) )
        ++$moved;
    if ( eZPreferences::setValue( expOETiptapEditor::PREFERENCE, '', $userID ) )
        ++$cleared;
}

$cli->output( sprintf( '%s: %d users with exp_oe_editor, %d moved to ezoe_engine, %d old preferences emptied%s',
                       'PASS', count( $rows ), $moved, $cleared, $dryRun ? ' (dry run, nothing changed)' : '' ) );
$script->shutdown();
