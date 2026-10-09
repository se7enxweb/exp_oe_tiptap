<?php
/**
 * File containing the expOETiptapServerFunctions class.
 *
 * @copyright Copyright (C) 7x & Exponential Foundation. All rights reserved.
 * @license GNU General Public License v2.0 (or any later version)
 * @package exp_oe_tiptap
 */

/**
 * ezjscore server functions of the Tiptap editor (ezjscore.ini [ezjscServer_expoetiptap]).
 *
 *   POST <root>/ezjscore/call  ezjscServer_function_arguments=expoetiptap::ai
 *        ezxform_token (or header X-CSRF-Token), command, text, language (translate), locale,
 *        format (text | markup), strict (1 on the second try)
 *   -> { error_text, content: { text, command, model } }
 *
 * Checks [AISettings] Enabled, the policy exp_oe_tiptap/ai, POST and the form token itself (ezformtoken checks
 * the token too when it is active), then calls the configured provider server side. The API key never leaves
 * the server.
 */
class expOETiptapServerFunctions extends ezjscServerFunctions
{
    /**
     * @param array $args unused
     * @return array
     * @throws expOETiptapAIException
     */
    public static function ai( $args )
    {
        try
        {
            $service = expOETiptapAIService::fromINI();
            $service->checkRequest(
                isset( $_SERVER['REQUEST_METHOD'] ) ? $_SERVER['REQUEST_METHOD'] : '',
                self::givenToken(),
                self::expectedToken(),
                self::hasPolicy()
            );
            $post = static function ( $name )
            {
                return isset( $_POST[$name] ) && is_string( $_POST[$name] ) ? $_POST[$name] : '';
            };
            return $service->run( $post( 'command' ), $post( 'text' ), $post( 'language' ), $post( 'locale' ), $post( 'format' ), $post( 'strict' ) === '1' );
        }
        catch ( expOETiptapAIException $e )
        {
            // the editor reads the message in the language of the siteaccess (context extension/exp_oe_tiptap)
            throw $e->translated();
        }
    }

    /** @return string|null */
    protected static function givenToken()
    {
        if ( isset( $_POST['ezxform_token'] ) && is_string( $_POST['ezxform_token'] ) && $_POST['ezxform_token'] !== '' )
            return $_POST['ezxform_token'];
        if ( !empty( $_SERVER['HTTP_X_CSRF_TOKEN'] ) && is_string( $_SERVER['HTTP_X_CSRF_TOKEN'] ) )
            return $_SERVER['HTTP_X_CSRF_TOKEN'];
        return null;
    }

    /** @return string|null the session's form token, null when the form token protection is not active */
    protected static function expectedToken()
    {
        if ( !class_exists( 'ezxFormToken' ) || !ezxFormToken::isEnabled() )
            return null;
        return ezxFormToken::getToken();
    }

    /** @return bool the current user has the policy exp_oe_tiptap/ai (any limitation counts as yes) */
    protected static function hasPolicy()
    {
        $user = eZUser::currentUser();
        if ( !$user instanceof eZUser )
            return false;
        $access = $user->hasAccessTo( 'exp_oe_tiptap', 'ai' );
        return isset( $access['accessWord'] ) && $access['accessWord'] !== 'no';
    }

    /** No caching of AI answers */
    public static function getCacheTime( $functionName )
    {
        return 0;
    }
}
