<?php
/**
 * exp_oe_tiptap/switch: the switch of 0.1.0, kept for links and forms that post to it. It stores the choice where
 * every editor choice is stored now, ezoe's user preference ezoe_engine (Editor=tiptap, ezoe, or empty for the site
 * default), and redirects to RedirectURI. POST only, with the form token of the session (field ezxform_token or
 * header X-CSRF-Token), checked here in addition to ezformtoken's own check of every POST. RedirectURI must be a
 * path on this site.
 *
 * Without a POST, or without a RedirectURI, it goes to ezoe's page ezoe/engine, the one page that lists and chooses
 * the editors.
 *
 * @copyright Copyright (C) 1998 - 2026 Exponential Foundation and 7x. All rights reserved.
 * @license GNU General Public License v2.0 (or any later version)
 * @package exp_oe_tiptap
 */

$Module = $Params['Module'];

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
        eZDebug::writeWarning( 'Online editor switch: unknown or unavailable editor ' . $editor, 'exp_oe_tiptap/switch' );
    else if ( $redirect !== '' )
        return $Module->redirectTo( $redirect );
}

return $Module->redirectTo( '/ezoe/engine' );
