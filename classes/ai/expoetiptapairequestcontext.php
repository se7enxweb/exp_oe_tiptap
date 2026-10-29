<?php
/**
 * File containing the expOETiptapAIRequestContext class.
 *
 * @copyright Copyright (C) 1998 - 2026 Exponential Foundation and 7x. All rights reserved.
 * @license GNU General Public License v2.0 (or any later version)
 * @package exp_oe_tiptap
 */

/**
 * The edited field an AI request names (contentObjectId, version, attributeId, languageCode) and the check that the
 * current user may work on it, the same check the edit form makes:
 *
 *  - the version is a draft (draft or internal draft) of the current user;
 *  - the user may edit the object in that language (eZContentObject::editAccess(), which also runs the listeners of
 *    content/edit/access; on a kernel without editAccess() eZContentObject::canEdit() in that language);
 *  - the attribute, when named, belongs to the object in that version and, when a language is named too, is the
 *    field of that language;
 *  - the language, when named, is a language of the site.
 *
 * The kernel is reached through callables, so the check can be tested without a database. A provider that relies on
 * the object (Provider=expai with expai's data policy) gets the checked ids; a request without them is refused when
 * $requireObject is set.
 */
class expOETiptapAIRequestContext
{
    /** @var callable function( int $objectID ): eZContentObject|null */
    protected $fetchObject;

    /** @var callable function( int $attributeID, int $version ): eZContentObjectAttribute|null */
    protected $fetchAttribute;

    /** @var callable function(): int the user object id of the current user */
    protected $currentUserID;

    /** @var callable function(): string[] the locale codes of the site's content languages */
    protected $languages;

    /**
     * @param callable|null $fetchObject
     * @param callable|null $fetchAttribute
     * @param callable|null $currentUserID
     * @param callable|null $languages
     */
    public function __construct( $fetchObject = null, $fetchAttribute = null, $currentUserID = null, $languages = null )
    {
        $this->fetchObject = $fetchObject ?: static function ( $id ) { return eZContentObject::fetch( $id ); };
        $this->fetchAttribute = $fetchAttribute ?: static function ( $id, $version ) { return eZContentObjectAttribute::fetch( $id, $version ); };
        $this->currentUserID = $currentUserID ?: static function () { return (int) eZUser::currentUserID(); };
        $this->languages = $languages ?: static function () { return eZContentLanguage::fetchLocaleList(); };
    }

    /**
     * The ids of the edited field in a request.
     *
     * @param array $post
     * @return array object_id, version, attribute_id (int, 0 when missing or not a positive number), language (string:
     *               '' when missing; null when given but not a language code, which check() refuses)
     */
    public static function requestIds( array $post )
    {
        $id = static function ( $name ) use ( $post )
        {
            return isset( $post[$name] ) && is_string( $post[$name] ) && preg_match( '/^[1-9][0-9]{0,9}\z/', $post[$name] ) ? (int) $post[$name] : 0;
        };
        $language = '';
        if ( isset( $post['languageCode'] ) && $post['languageCode'] !== '' )
            $language = is_string( $post['languageCode'] ) && preg_match( '/^[a-z]{2,3}-[A-Z]{2}\z/', $post['languageCode'] ) ? $post['languageCode'] : null;
        return array( 'object_id' => $id( 'contentObjectId' ), 'version' => $id( 'version' ), 'attribute_id' => $id( 'attributeId' ), 'language' => $language );
    }

    /**
     * Checks the edited field.
     *
     * @param array $ids requestIds()
     * @param bool $requireObject refuse a request that names no object (the provider's data policy needs it)
     * @return array the ids for the provider (language '' when none was named); empty when no object was named
     * @throws expOETiptapAIException
     */
    public function check( array $ids, $requireObject = false )
    {
        $ids += array( 'object_id' => 0, 'version' => 0, 'attribute_id' => 0, 'language' => '' );
        if ( $ids['language'] === null || ( $ids['language'] !== '' && !in_array( $ids['language'], (array) call_user_func( $this->languages ), true ) ) )
            throw new expOETiptapAIException( 'The language of the field is not valid.', 'languageCode is not a language of the site' );
        if ( (int) $ids['object_id'] <= 0 )
        {
            if ( $requireObject )
                throw new expOETiptapAIException( 'This text cannot be sent: the data policy needs to know which content it belongs to.', 'data policy active, no object in the request' );
            return array();
        }
        $object = call_user_func( $this->fetchObject, (int) $ids['object_id'] );
        if ( !is_object( $object ) )
            throw new expOETiptapAIException( 'You are not allowed to edit this content.', 'object of the request not found' );
        $version = (int) $ids['version'] > 0 ? $object->version( (int) $ids['version'] ) : null;
        if ( !is_object( $version ) )
            throw new expOETiptapAIException( 'This is not a draft of yours.', 'version of the request not found for the object' );
        if ( (int) $version->attribute( 'creator_id' ) !== (int) call_user_func( $this->currentUserID )
             || !in_array( (int) $version->attribute( 'status' ), array( eZContentObjectVersion::STATUS_DRAFT, eZContentObjectVersion::STATUS_INTERNAL_DRAFT ), true ) )
            throw new expOETiptapAIException( 'This is not a draft of yours.', 'version of the request is not a draft of the current user' );
        if ( !self::mayEdit( $object, $version, $ids['language'] !== '' ? $ids['language'] : false ) )
            throw new expOETiptapAIException( 'You are not allowed to edit this content.', 'no edit access to the object of the request' );
        if ( (int) $ids['attribute_id'] > 0 )
        {
            $attribute = call_user_func( $this->fetchAttribute, (int) $ids['attribute_id'], (int) $ids['version'] );
            if ( !is_object( $attribute ) || (int) $attribute->attribute( 'contentobject_id' ) !== (int) $ids['object_id'] )
                throw new expOETiptapAIException( 'The field does not belong to this content.', 'attribute and object of the request do not match' );
            $attributeLanguage = (string) $attribute->attribute( 'language_code' );
            if ( $ids['language'] !== '' && $attributeLanguage !== '' && $attributeLanguage !== $ids['language'] )
                throw new expOETiptapAIException( 'The field does not belong to this content.', 'language of the attribute and language of the request do not match' );
        }
        return $ids;
    }

    /**
     * Whether the current user may edit the object in the language: editAccess() where the kernel has it (newer
     * kernels; it checks the version too and runs the listeners of content/edit/access), else canEdit() in that
     * language, the check older kernels make on the edit form.
     *
     * @param object $object eZContentObject
     * @param object $version eZContentObjectVersion
     * @param string|false $language
     * @return bool
     */
    protected static function mayEdit( $object, $version, $language )
    {
        if ( method_exists( $object, 'editAccess' ) )
            return (bool) $object->editAccess( $version, $language );
        return (bool) $object->canEdit( false, false, false, $language );
    }
}
