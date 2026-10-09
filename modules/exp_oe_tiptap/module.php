<?php
/**
 * Module exp_oe_tiptap: the switch between the online editors outside the edit form, and the policy functions.
 *
 * @copyright Copyright (C) 1998 - 2026 7x & Exponential Foundation. All rights reserved.
 * @license GNU General Public License v2.0 (or any later version)
 * @package exp_oe_tiptap
 */

$Module = array( 'name' => 'Online editor Tiptap', 'variable_params' => true );

$ViewList = array();

// Stores the editor of the current user (POST only, form token checked) and redirects to RedirectURI.
// The edit form itself switches with a custom action button, which stores the draft first.
$ViewList['switch'] = array(
    'functions' => array( 'switch' ),
    'ui_context' => 'administration',
    'script' => 'switch.php',
    'params' => array(),
    'single_post_actions' => array( 'SwitchEditorButton' => 'Switch' ),
    'post_action_parameters' => array( 'Switch' => array( 'Editor' => 'Editor', 'RedirectURI' => 'RedirectURI' ) ) );

$FunctionList = array();
// May switch between ezoe and Tiptap (the button below the editor and the view exp_oe_tiptap/switch)
$FunctionList['switch'] = array();
// May use the AI commands of the editor (also needs exp_oe_tiptap.ini [AISettings] Enabled=true)
$FunctionList['ai'] = array();
