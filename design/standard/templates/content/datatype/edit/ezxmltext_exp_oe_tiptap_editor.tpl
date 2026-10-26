{* The Tiptap editor of one ezxmltext attribute: the template of the ezoe engine "tiptap" (expOETiptapEngine),
   included by ezoe's ezxmltext_ezoe.tpl when the user's engine is tiptap. Its settings are the engine's config
   ($input_handler.engine.config, expOETiptapEditor::editorInfo()).
   The textarea holds the ezoe editor HTML ($input_handler.input_xml) and is posted back under the same name, so
   eZOEInputParser turns it into ezxml exactly as for TinyMCE. The options of the editor follow the textarea as JSON
   (<script type="application/json" data-exp-oe-options-for="<textarea id>">); javascript/exp_oe_tiptap/
   exp_oe_tiptap_start.js (loaded once, with defer) calls window.ExpOETiptap.init( textarea, options ) (the built
   bundle), which replaces the textarea with the editor and writes the editor's HTML back into it before every
   submit. No inline script: the page runs under a Content Security Policy without 'unsafe-inline'.
   Below it come ezoe's "Disable editor" and ezoe's engine switch buttons, the same as under TinyMCE.
   The options are described in doc/plan.md section 5. *}
{default attribute_base='ContentObjectAttribute'
         editorRow=10}

{def $exp_oe          = $input_handler.engine.config
     $layout_settings = $input_handler.editor_layout_settings}

{run-once}
{* assets: once per page, whatever number of xml fields the form has *}
{if eq( $exp_oe.asset_loading, 'ezjscore' )}
    {ezscript_require( $exp_oe.scripts )}
    {ezcss_require( $exp_oe.styles )}
{else}
    {foreach $exp_oe.styles as $exp_oe_style}
<link rel="stylesheet" type="text/css" href="{concat( 'stylesheets/', $exp_oe_style )|ezdesign( 'no' )}" />
    {/foreach}
    {foreach $exp_oe.scripts as $exp_oe_script}
<script src="{concat( 'javascript/', $exp_oe_script )|ezdesign( 'no' )}" charset="utf-8"></script>
    {/foreach}
{/if}
{* starts every editor of the page from its options block, once the page is parsed *}
<script src="{'javascript/exp_oe_tiptap/exp_oe_tiptap_start.js'|ezdesign( 'no' )}" charset="utf-8" defer></script>
{/run-once}

{def $content_css_list = array()
     $skin             = ezini( 'EditorSettings', 'Skin', 'ezoe.ini',,true() )
     $link_classes     = hash()
     $link_class_names = hash()
     $image_sizes      = ezini( 'AliasSettings', 'AliasList', 'image.ini' )
     $view_modes       = ezini( 'embed', 'AvailableViewModes', 'content.ini' )|merge( ezini( 'embed-inline', 'AvailableViewModes', 'content.ini' ) )|unique
     $cur_locale       = fetch( 'content', 'locale' )
     $text_locale      = fetch( 'content', 'locale', hash( 'locale_code', $attribute.language_code ) )
     $editor_id        = concat( $attribute_base, '_data_text_', $attribute.id )
     $switch_name      = ''
     $disable_name     = ''}
{* The look of Tiptap: exp_oe_tiptap.ini [EditorSettings] Skin (a4 = admin4's look with Tiptap's own icons), else
   DesignSkin[] of the siteaccess's SiteDesign (admin4: a4), else ezoe's Skin (o2k7, TinyMCE 3's look). The editor
   content CSS keeps ezoe's skin. *}
{def $tiptap_skin  = $skin
     $site_design  = ezini( 'DesignSettings', 'SiteDesign', 'site.ini' )
     $design_skins = hash()}
{if ezini_hasvariable( 'EditorSettings', 'DesignSkin', 'exp_oe_tiptap.ini' )}
    {set $design_skins = ezini( 'EditorSettings', 'DesignSkin', 'exp_oe_tiptap.ini' )}
{/if}
{if is_set( $design_skins[$site_design] )}
    {if $design_skins[$site_design]|ne( '' )}
        {set $tiptap_skin = $design_skins[$site_design]}
    {/if}
{/if}
{* Nested, not and(): and() evaluates every parameter, so ezini() would still be asked for the undefined Skin and
   log an error on every edit page. Dynamic (the last true()): the template compiler resolves a static ezini() when
   it compiles the file, inside the if or not, and logged the undefined Skin then. *}
{if ezini_hasvariable( 'EditorSettings', 'Skin', 'exp_oe_tiptap.ini' )}
    {if ezini( 'EditorSettings', 'Skin', 'exp_oe_tiptap.ini',, true() )|ne( '' )}
        {set $tiptap_skin = ezini( 'EditorSettings', 'Skin', 'exp_oe_tiptap.ini',, true() )}
    {/if}
{/if}
{foreach ezini( 'StylesheetSettings', 'EditorCSSFileList', 'design.ini',,true() ) as $css}
    {set $content_css_list = $content_css_list|append( $css|explode( '<skin>' )|implode( $skin ) )}
{/foreach}
{if ezini_hasvariable( 'link', 'ClassDescription', 'content.ini' )}
    {set $link_class_names = ezini( 'link', 'ClassDescription', 'content.ini', '', true() )}
{/if}
{foreach ezini( 'link', 'AvailableClasses', 'content.ini' ) as $link_class}
    {set $link_classes = $link_classes|merge( hash( $link_class, first_set( $link_class_names[$link_class], $link_class ) ) )}
{/foreach}
{if $exp_oe.can_switch}
    {set $switch_name = concat( 'CustomActionButton[', $attribute.id, '_', $exp_oe.switch_action, ']' )}
{/if}
{if $input_handler.can_disable}
    {set $disable_name = concat( 'CustomActionButton[', $attribute.id, '_disable_editor]' )}
{/if}

<div class="oe-window exp-oe-window ezoe-skin-{$skin|wash}">
    <textarea class="box exp-oe-source" id="{$editor_id}" name="{$editor_id}" cols="88" rows="{$editorRow}">{$input_handler.input_xml}</textarea>
</div>

<div class="block">
    {if $input_handler.can_disable}
        <input class="button{if $layout_settings['buttons']|contains('disable')} hide{/if}" type="submit" name="{$disable_name}" value="{'Disable editor'|i18n( 'design/standard/content/datatype' )}" />
    {/if}
    {* ezoe's engine switch: one button per other available engine, the one choice of editor (ezoe_engine) *}
    {include uri='design:content/datatype/edit/ezxmltext_ezoe_engine_switch.tpl' attribute=$attribute input_handler=$input_handler}
    <span class="exp-oe-switch-current">{'Editing with %editor'|i18n( 'extension/exp_oe_tiptap',, hash( '%editor', $exp_oe.label ) )|wash}</span>
</div>

{* The options of this editor, as JSON (doc/plan.md section 5): contentLanguage is the language tag of the text (BCP 47,
   e.g. en-GB) from its locale file, for the lang attribute of the text; contentDirection 'rtl' for a text in a
   right-to-left content language (the locale file's TextDirection); contextMenu and sourceEditable are
   exp_oe_tiptap.ini [EditorSettings] ContextMenu and SourceEditable; pathOpenDialog is ezoe.ini [EditorSettings]
   TagPathOpenDialog (a click on a tag of the path opens its dialog); customTagControls is ezoe.ini [EditorSettings]
   CustomTagControls (the bar on the focused custom tag, its shortcuts and the labels); atomicInlineCustomTags is
   exp_oe_tiptap.ini [EditorSettings] AtomicInlineCustomTags[] (inline custom tags kept as one piece),
   texSourceCustomTags the names of content.ini [CustomTagSettings] TeXSource[] (their text is TeX source); formToken is ezformtoken's
   placeholder (its output filter puts the token in) or, without an active ezformtoken, the session token of
   exp_oe_tiptap; i18n maps English texts
   to their translation (context extension/exp_oe_tiptap), texts missing there stay English. Every value from the
   installation goes through json_encode; the block is printed with < and > as \u003c and \u003e (in JSON they occur
   only inside strings), because json_encode leaves "<!--" as it is and "<!--<script>" in a value would make the
   browser read past this block's </script> and skip the scripts after it. *}
{set-block variable=$exp_oe_options_json}
{ldelim}
    "attributeId": {$attribute.id|int},
    "contentObjectId": {$attribute.contentobject_id|int},
    "version": {$attribute.version|int},
    "language": {json_encode( $attribute.language_code )},
    "contentLanguage": {json_encode( $text_locale.http_locale_code )},
    "contentDirection": {json_encode( first_set( $text_locale.text_direction, 'ltr' ) )},
    "rows": {$editorRow|int},
    "minHeight": {$exp_oe.min_height|int},
    "contextMenu": {cond( $exp_oe.context_menu, 'true', 'false' )},
    "sourceEditable": {cond( $exp_oe.source_editable, 'true', 'false' )},
    "buttons": {json_encode( $layout_settings['buttons'] )},
    "pathLocation": {json_encode( $layout_settings['path_location'] )},
    "pathOpenDialog": {cond( ezini( 'EditorSettings', 'TagPathOpenDialog', 'ezoe.ini' )|eq( 'enabled' ), 'true', 'false' )},
    "toolbarLocation": {json_encode( $layout_settings['toolbar_location'] )},
    "skin": {json_encode( $tiptap_skin )},
    "contentCss": {json_encode( ezcssfiles( $content_css_list, 3, true() ) )},
    "xmlTagAlias": {$input_handler.json_xml_tag_alias},
    "customTags": {json_encode( $input_handler.custom_tag_definitions )},
    "customTagControls": {cond( $input_handler.custom_tag_controls_enabled, 'true', 'false' )},
    "atomicInlineCustomTags": {json_encode( $exp_oe.atomic_inline_custom_tags )},
    "texSourceCustomTags": {json_encode( $exp_oe.tex_source_custom_tags )},
    "literal": {json_encode( $input_handler.literal_definition )},
    "tableDefinitions": {json_encode( $input_handler.table_definitions )},
    "generalDefinitions": {json_encode( $input_handler.general_definitions )},
    "embedDefinitions": {json_encode( $input_handler.embed_definitions )},
    "linkClasses": {json_encode( $link_classes )},
    "linkViewModes": {json_encode( ezini( 'link', 'AvailableViewModes', 'content.ini' ) )},
    "customAttributeStyleMap": {json_encode( ezini( 'EditorSettings', 'CustomAttributeStyleMap', 'ezoe.ini',,true() ) )},
    "imageSizes": {json_encode( $image_sizes )},
    "viewModes": {json_encode( $view_modes )},
    "defaultSize": {json_encode( ezini( 'ImageSettings', 'DefaultEmbedAlias', 'content.ini' ) )},
    "uploadExtensions": {json_encode( $exp_oe.upload_extensions )},
    "uploadFromUrl": {json_encode( $exp_oe.upload_from_url )},
    "urls": {ldelim}
        "root": {json_encode( '/'|ezroot( 'no' ) )},
        "ezoe": {json_encode( '/ezoe/'|ezurl( 'no' ) )},
        "ezjscore": {json_encode( '/ezjscore/'|ezurl( 'no' ) )},
        "contentEdit": {json_encode( '/content/edit'|ezurl( 'no' ) )},
        "switch": {json_encode( '/ezoe/engine'|ezurl( 'no' ) )}
    {rdelim},
    "formToken": {json_encode( $exp_oe.form_token )},
    "switchButtonName": {json_encode( $switch_name )},
    "disableButtonName": {json_encode( $disable_name )},
    "ai": {ldelim}
        "enabled": {cond( $exp_oe.ai_enabled, 'true', 'false' )},
        "commands": {json_encode( cond( $exp_oe.ai_enabled, $exp_oe.ai_commands, array() ) )},
        "call": "expoetiptap::ai"
    {rdelim},
    "i18n": {json_encode( $exp_oe.i18n )},
    "editorLabel": {json_encode( $exp_oe.label )},
    "otherEditorLabel": {json_encode( $exp_oe.other_label )},
    "locale": {json_encode( $cur_locale.http_locale_code )}
{rdelim}
{/set-block}
<script type="application/json" data-exp-oe-options-for="{$editor_id|wash}">{$exp_oe_options_json|explode( '<' )|implode( '\u003c' )|explode( '>' )|implode( '\u003e' )}</script>
{undef $exp_oe_options_json $exp_oe $layout_settings $content_css_list $skin $tiptap_skin $site_design $design_skins $link_classes $link_class_names $image_sizes $view_modes $cur_locale $text_locale $editor_id $switch_name $disable_name}
{/default}
