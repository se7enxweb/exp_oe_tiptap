<?php
/**
 * exp_oe_tiptap/switch: stores the online editor of the current user (user preference exp_oe_editor) and redirects
 * back. POST only, with the form token of the session (field ezxform_token or header X-CSRF-Token), checked here in
 * addition to ezformtoken's own check of every POST. RedirectURI must be a path on this site.
 *
 * This view cannot store an open draft (it is a request of its own); the edit form switches with the custom action
 * button CustomActionButton[<attribute id>_exp_oe_switch_<editor>] instead, which content/edit stores first.
 *
 * Without a valid POST it shows a small form with the current choice.
 *
 * @copyright Copyright (C) 1998 - 2026 7x & Exponential Foundation. All rights reserved.
 * @license GNU General Public License v2.0 (or any later version)
 * @package exp_oe_tiptap
 */

$Module = $Params['Module'];
$http   = eZHTTPTool::instance();
$error  = false;

if ( $Module->isCurrentAction( 'Switch' ) )
{
    $isPost = isset( $_SERVER['REQUEST_METHOD'] ) && $_SERVER['REQUEST_METHOD'] === 'POST';
    $editor = $Module->actionParameter( 'Editor' );
    $editor = is_string( $editor ) ? $editor : '';
    $redirect = expOETiptapEditor::localRedirect( $Module->hasActionParameter( 'RedirectURI' ) ? $Module->actionParameter( 'RedirectURI' ) : '', '' );

    if ( !$isPost || !expOETiptapEditor::tokenValid( $_POST, $_SERVER ) )
    {
        eZDebug::writeWarning( 'Online editor switch refused: not a POST with the form token of this session', 'exp_oe_tiptap/switch' );
        return $Module->handleError( eZError::KERNEL_ACCESS_DENIED, 'kernel' );
    }
    if ( !expOETiptapEditor::setUserEditor( $editor ) )
        $error = true;
    else if ( $redirect !== '' )
        return $Module->redirectTo( $redirect );
}

$preference = eZPreferences::value( expOETiptapEditor::PREFERENCE );
$tpl = eZTemplate::factory();
$tpl->setVariable( 'editors', array( expOETiptapEditor::EZOE   => ezpI18n::tr( 'extension/exp_oe_tiptap', expOETiptapEditor::label( expOETiptapEditor::EZOE ) ),
                                     expOETiptapEditor::TIPTAP => ezpI18n::tr( 'extension/exp_oe_tiptap', expOETiptapEditor::label( expOETiptapEditor::TIPTAP ) ) ) );
$tpl->setVariable( 'preference', is_string( $preference ) ? $preference : '' );
$tpl->setVariable( 'resolved', expOETiptapEditor::resolve() );
$tpl->setVariable( 'default_editor', expOETiptapEditor::defaultEditor() );
$tpl->setVariable( 'tiptap_available', expOETiptapEditor::tiptapAvailable() );
$tpl->setVariable( 'switch_enabled', expOETiptapEditor::switchEnabled() );
$tpl->setVariable( 'saved', $Module->isCurrentAction( 'Switch' ) && !$error );
$tpl->setVariable( 'error', $error );

$Result = array();
$Result['content'] = $tpl->fetch( 'design:exp_oe_tiptap/switch.tpl' );
$Result['path'] = array( array( 'url' => false, 'text' => ezpI18n::tr( 'extension/exp_oe_tiptap', 'Online editor' ) ) );
