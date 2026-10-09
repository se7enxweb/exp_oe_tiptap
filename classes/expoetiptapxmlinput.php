<?php
/**
 * The ezxmltext input handler of exp_oe_tiptap: ezoe's eZOEXMLInput with one difference, the edit template.
 *
 * Registered in ezxml.ini [InputSettings] AliasClasses[eZSimplifiedXMLInput]=expOETiptapXMLInput. The edit template
 * ezxmltext_exp_oe_tiptap.tpl renders either ezoe's own ezxmltext_ezoe.tpl (TinyMCE, unchanged) or the Tiptap editor,
 * followed by the switch button. Everything else (inputXML(), validateInput() with eZOEInputParser, isValid(), the
 * ezoe policies, "Disable editor", ezoe's engine switch) is inherited unchanged, so both editors read and write the
 * same ezoe HTML and the same ezxml.
 *
 * @copyright Copyright (C) 1998 - 2026 7x & Exponential Foundation. All rights reserved.
 * @license GNU General Public License v2.0 (or any later version)
 * @package exp_oe_tiptap
 */

class expOETiptapXMLInput extends eZOEXMLInput
{
    /** The prefix of the custom action of the switch button: CustomActionButton[<attribute id>_exp_oe_switch_<editor>] */
    const SWITCH_ACTION = 'exp_oe_switch_';

    function attributes()
    {
        return array_merge( parent::attributes(), array( 'exp_oe_editor' ) );
    }

    function attribute( $name )
    {
        if ( $name === 'exp_oe_editor' )
            return self::editorInfo();
        return parent::attribute( $name );
    }

    /**
     * What the edit template needs to know about the editor choice.
     *
     * @return array editor, label, other, other_label, can_switch, switch_action, tiptap_available, ai_enabled,
     *               ai_commands, scripts, styles, asset_loading, cache_key, min_height, upload_extensions,
     *               upload_from_url, i18n
     */
    public static function editorInfo()
    {
        $editor = expOETiptapEditor::resolve();
        $other  = expOETiptapEditor::other( $editor );
        return array(
            'editor'           => $editor,
            'label'            => ezpI18n::tr( 'extension/exp_oe_tiptap', expOETiptapEditor::label( $editor ) ),
            'other'            => $other,
            'other_label'      => ezpI18n::tr( 'extension/exp_oe_tiptap', expOETiptapEditor::label( $other ) ),
            'can_switch'       => expOETiptapEditor::switchAllowed()
                                  && ( $other !== expOETiptapEditor::TIPTAP || expOETiptapEditor::tiptapAvailable() ),
            'switch_action'    => self::SWITCH_ACTION . $other,
            'tiptap_available' => expOETiptapEditor::tiptapAvailable(),
            'ai_enabled'       => expOETiptapEditor::aiAllowed(),
            'ai_commands'      => expOETiptapEditor::aiCommands(),
            'scripts'          => expOETiptapEditor::scripts(),
            'styles'           => expOETiptapEditor::styles(),
            'asset_loading'    => expOETiptapEditor::setting( 'EditorSettings', 'AssetLoading', 'ezdesign' ) === 'ezjscore' ? 'ezjscore' : 'ezdesign',
            'cache_key'        => expOETiptapEditor::cacheKey(),
            'min_height'       => (int) expOETiptapEditor::setting( 'EditorSettings', 'MinHeight', 300 ),
            // the upload rules of ezoe's embed dialog (ezoe.ini [EditorSettings] UploadFileExtensions[], UploadFromUrl)
            'upload_extensions' => class_exists( 'expOEEditor' ) ? expOEEditor::uploadExtensions() : array(),
            'upload_from_url'   => class_exists( 'expOEUrlFetcher' ) ? (bool) expOEUrlFetcher::enabled() : false,
            'i18n'              => expOETiptapEditor::translations(),
        );
    }

    /**
     * Always the exp_oe_tiptap template, which includes ezoe's ezxmltext_ezoe.tpl or the Tiptap editor.
     *
     * @param eZContentObjectAttribute $contentObjectAttribute
     * @return string
     */
    function editTemplateSuffix( &$contentObjectAttribute )
    {
        return 'exp_oe_tiptap';
    }

    /**
     * The switch button, then ezoe's own actions. content/edit has validated and stored the draft before it calls
     * this (every CustomActionButton is a store action), so the text typed so far is kept, as with "Disable editor".
     *
     * @param eZHTTPTool $http
     * @param string $action
     * @param eZContentObjectAttribute $contentObjectAttribute
     */
    function customObjectAttributeHTTPAction( $http, $action, $contentObjectAttribute )
    {
        $editor = self::switchActionEditor( $action );
        if ( $editor === null )
        {
            parent::customObjectAttributeHTTPAction( $http, $action, $contentObjectAttribute );
            return;
        }
        if ( !expOETiptapEditor::setUserEditor( $editor ) )
            eZDebug::writeError( 'Switching the online editor is not allowed or unknown: ' . $action, __METHOD__ );
    }

    /**
     * @param string $action a custom action name without the attribute id
     * @return string|null the editor a switch action asks for, '' for "back to the default", null when the action is
     *                     not a switch action
     */
    public static function switchActionEditor( $action )
    {
        if ( !is_string( $action ) || strpos( $action, self::SWITCH_ACTION ) !== 0 )
            return null;
        $editor = substr( $action, strlen( self::SWITCH_ACTION ) );
        return $editor === 'default' ? '' : $editor;
    }
}
