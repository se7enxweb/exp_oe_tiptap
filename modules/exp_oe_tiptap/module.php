<?php
/**
 * Module exp_oe_tiptap: the switch view of 0.1.0 (now stored as ezoe's editor choice) and the policy functions.
 *
 * @copyright Copyright (C) 1998 - 2026 Exponential Foundation and 7x. All rights reserved.
 * @license GNU General Public License v2.0 (or any later version)
 * @package exp_oe_tiptap
 */

$Module = array( 'name' => 'Online editor Tiptap', 'variable_params' => true );

$ViewList = array();

// Stores the editor of the current user (POST only, form token checked) and redirects to RedirectURI.
// The edit form switches with ezoe's custom action buttons, which store the draft first.
$ViewList['switch'] = array(
    'functions' => array( 'switch' ),
    'ui_context' => 'administration',
    'script' => 'switch.php',
    'params' => array(),
    'single_post_actions' => array( 'SwitchEditorButton' => 'Switch' ),
    'post_action_parameters' => array( 'Switch' => array( 'Editor' => 'Editor', 'RedirectURI' => 'RedirectURI' ) ) );

$FunctionList = array();
// May use the view exp_oe_tiptap/switch of 0.1.0. The buttons in the edit form follow ezoe.ini EngineSwitch
$FunctionList['switch'] = array();
// May use the AI commands of the editor (also needs exp_oe_tiptap.ini [AISettings] Enabled=true)
$FunctionList['ai'] = array();
