<?php
/**
 * Tiptap as an engine of ezoe's editor registry: registered by settings/ezoe.ini.append.php
 * (ezoe.ini [EditorSettings] Engines[tiptap]=expOETiptapEngine), so it is listed, chosen and switched to like
 * TinyMCE 3 and 8 on the page ezoe/engine and with ezoe's "Switch to the editor ..." buttons in the edit form.
 *
 * Available while the built bundle is present (exp_oe_tiptap.ini [EditorSettings] Scripts[], first entry). The
 * editor is rendered by ezxmltext_exp_oe_tiptap_editor.tpl, which ezoe's ezxmltext_ezoe.tpl includes; its settings
 * are the engine's config (expOETiptapEditor::editorInfo()).
 *
 * @copyright Copyright (C) 1998 - 2026 Exponential Foundation and 7x. All rights reserved.
 * @license GNU General Public License v2.0 (or any later version)
 * @package exp_oe_tiptap
 */

class expOETiptapEngine extends expOEEditorEngineBase
{
    const TEMPLATE = 'design:content/datatype/edit/ezxmltext_exp_oe_tiptap_editor.tpl';

    public function identifier()
    {
        return expOETiptapEditor::ENGINE;
    }

    public function label()
    {
        return 'Tiptap';
    }

    public function isAvailable()
    {
        return expOETiptapEditor::tiptapAvailable();
    }

    /** @return string the version of this extension (ezinfo.php), e.g. 0.1.1 */
    public function version()
    {
        if ( !class_exists( 'exp_oe_tiptapInfo', false ) )
            require_once dirname( __DIR__ ) . '/ezinfo.php';
        $info = exp_oe_tiptapInfo::info();
        return isset( $info['Version'] ) ? (string) $info['Version'] : '';
    }

    /** @return string translated by ezoe (context design/standard/ezoe, carried by this extension's translations) */
    public function description()
    {
        return 'Tiptap (ProseMirror), from the extension exp_oe_tiptap: the same text as the Online Editor, with its dialogs.';
    }

    public function template()
    {
        return self::TEMPLATE;
    }

    /** The bundle is put on the page by the template itself (exp_oe_tiptap.ini [EditorSettings] AssetLoading). */
    public function assets()
    {
        return array( 'scripts' => array(), 'styles' => array() );
    }

    public function config( array $context = array() )
    {
        return expOETiptapEditor::editorInfo();
    }
}
