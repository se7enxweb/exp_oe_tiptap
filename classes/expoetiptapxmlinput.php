<?php
/**
 * The ezxmltext input handler of exp_oe_tiptap: ezoe's eZOEXMLInput, kept for what 0.1.0 put in place.
 *
 * Since 0.1.1 Tiptap is an engine of ezoe's registry (expOETiptapEngine) and the edit template is ezoe's own
 * ezxmltext_ezoe.tpl, which includes the Tiptap editor when the user's engine is tiptap. This class is still the
 * alias of eZSimplifiedXMLInput (ezxml.ini) for three things only:
 *  - it moves the preference exp_oe_editor of 0.1.0 to ezoe's ezoe_engine before ezoe reads it (migratePreference())
 *  - the custom action of the 0.1.0 switch button, CustomActionButton[<attribute id>_exp_oe_switch_<editor>], still
 *    works and stores ezoe's preference
 *  - the template attribute exp_oe_editor, for overrides written against 0.1.0
 * Parsing and validation (inputXML(), validateInput() with eZOEInputParser, isValid()) are ezoe's, unchanged, and
 * the extension works the same without this alias.
 *
 * @copyright Copyright (C) 1998 - 2026 Exponential Foundation and 7x. All rights reserved.
 * @license GNU General Public License v2.0 (or any later version)
 * @package exp_oe_tiptap
 */

class expOETiptapXMLInput extends eZOEXMLInput
{
    /** The prefix of the custom action of the 0.1.0 switch button: CustomActionButton[<attribute id>_exp_oe_switch_<editor>] */
    const SWITCH_ACTION = 'exp_oe_switch_';

    function attributes()
    {
        return array_merge( parent::attributes(), array( 'exp_oe_editor' ) );
    }

    function attribute( $name )
    {
        if ( $name === 'exp_oe_editor' )
            return self::editorInfo();
        if ( $name === 'engine' || $name === 'engine_switch_choices' || $name === 'engine_switch_options' )
            expOETiptapEditor::migratePreference();
        return parent::attribute( $name );
    }

    /** @return array the settings of the Tiptap editor (see expOETiptapEditor::editorInfo()) */
    public static function editorInfo()
    {
        return expOETiptapEditor::editorInfo();
    }

    /**
     * The switch button of 0.1.0, then ezoe's own actions (its "Switch to the editor ..." buttons included).
     * content/edit has validated and stored the draft before it calls this, so the text typed so far is kept.
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
        if ( !expOETiptapEditor::switchAllowed() )
            eZDebug::writeError( 'Switching the editor is disabled in ezoe.ini [EditorSettings] EngineSwitch', __METHOD__ );
        else if ( !expOETiptapEditor::setUserEditor( $editor ) )
            eZDebug::writeError( 'Unknown or unavailable editor in custom HTTP action: ' . $action, __METHOD__ );
    }

    /**
     * @param string $action a custom action name without the attribute id
     * @return string|null the editor a switch action asks for, '' for "back to the default", null when the action is
     *                     not a switch action of 0.1.0
     */
    public static function switchActionEditor( $action )
    {
        if ( !is_string( $action ) || strpos( $action, self::SWITCH_ACTION ) !== 0 )
            return null;
        $editor = substr( $action, strlen( self::SWITCH_ACTION ) );
        return $editor === 'default' ? '' : $editor;
    }
}
