<?php
/**
 * File containing the expOETiptapServerFunctions class.
 *
 * @copyright Copyright (C) 1998 - 2026 Exponential Foundation and 7x. All rights reserved.
 * @license GNU General Public License v2.0 (or any later version)
 * @package exp_oe_tiptap
 */

/**
 * ezjscore server functions of the Tiptap editor (ezjscore.ini [ezjscServer_expoetiptap]).
 *
 *   POST <root>/ezjscore/call  ezjscServer_function_arguments=expoetiptap::ai
 *        ezxform_token (or header X-CSRF-Token), command, text, language (translate), locale,
 *        format (text | markup), strict (1 on the second try),
 *        contentObjectId, version, attributeId, languageCode (the edited field, optional)
 *   -> { error_text, content: { text, command, model } }
 *
 * Checks [AISettings] Enabled, the policy exp_oe_tiptap/ai, POST and the form token itself, then calls the configured
 * provider server side. The token is always required: ezformtoken's when ezformtoken is active (which checks it too),
 * else the session token of this extension the editor template renders (expOETiptapEditor::expectedToken()). The API
 * key never leaves the server.
 *
 * When the request names the edited field (contentObjectId, version, attributeId, languageCode), it must be a draft
 * of the current user that the user may edit (expOETiptapAIRequestContext, the check of the edit form); the provider
 * then knows the content. With Provider=expai and expai's data policy active, the policy decides on the object of the
 * edited field, so a request without it is refused here already. Refused requests are logged (no text, no token).
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
        $service = expOETiptapAIService::fromINI();
        try
        {
            try
            {
                $service->checkRequest(
                    isset( $_SERVER['REQUEST_METHOD'] ) ? $_SERVER['REQUEST_METHOD'] : '',
                    self::givenToken(),
                    expOETiptapEditor::expectedToken(),
                    self::hasPolicy()
                );
                $requireObject = $service->providerName() === 'expai' && expOETiptapAIExpaiProvider::dataPolicyActive();
                $service->setRequestContext( ( new expOETiptapAIRequestContext() )->check( self::requestIds( $_POST ), $requireObject ) );
            }
            catch ( expOETiptapAIException $e )
            {
                $service->logRefusal( $e->getLogDetail() );
                throw $e;
            }
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

    /**
     * The ids of the edited field in a request (expOETiptapAIRequestContext::requestIds()).
     *
     * @param array $post
     * @return array object_id, version, attribute_id, language
     */
    public static function requestIds( array $post )
    {
        return expOETiptapAIRequestContext::requestIds( $post );
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
