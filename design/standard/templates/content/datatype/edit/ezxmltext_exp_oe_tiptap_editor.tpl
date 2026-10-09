{* The Tiptap editor of one ezxmltext attribute, included by ezxmltext_exp_oe_tiptap.tpl.
   The textarea holds the ezoe editor HTML ($input_handler.input_xml) and is posted back under the same name, so
   eZOEInputParser turns it into ezxml exactly as for TinyMCE. window.ExpOETiptap.init( textarea, options ) (the
   built bundle) replaces the textarea with the editor and writes the editor's HTML back into it before every submit.
   The options are described in doc/plan.md section 5. *}
{default attribute_base='ContentObjectAttribute'
         editorRow=10}

{def $layout_settings = $input_handler.editor_layout_settings}

{run-once}
{* assets: once per page, whatever number of xml fields the form has *}
{if eq( $exp_oe.asset_loading, 'ezjscore' )}
    {ezscript_require( $exp_oe.scripts )}
    {ezcss_require( $exp_oe.styles )}
{else}
    {foreach $exp_oe.styles as $exp_oe_style}
<link rel="stylesheet" type="text/css" href="{concat( 'stylesheets/', $exp_oe_style )|ezdesign( 'no' )}?v={$exp_oe.cache_key|wash}" />
    {/foreach}
    {foreach $exp_oe.scripts as $exp_oe_script}
<script src="{concat( 'javascript/', $exp_oe_script )|ezdesign( 'no' )}?v={$exp_oe.cache_key|wash}" charset="utf-8"></script>
    {/foreach}
{/if}
<script type="text/javascript">
{literal}
// Starts Tiptap on one textarea once the bundle is there (it may be loaded at the end of the page with ezjscore).
function expOETiptapStart( id, options )
{
    var start = function()
    {
        var textarea = document.getElementById( id );
        if ( !textarea )
            return;
        if ( !window.ExpOETiptap || typeof window.ExpOETiptap.init !== 'function' )
        {
            // The plain textarea stays usable: it holds the editor HTML and is posted as it is
            if ( window.console )
                window.console.error( 'exp_oe_tiptap: the editor bundle is not loaded, editing ' + id + ' as plain text' );
            return;
        }
        window.ExpOETiptap.init( textarea, options );
    };
    if ( window.ExpOETiptap || document.readyState !== 'loading' )
        start();
    else
        document.addEventListener( 'DOMContentLoaded', start );
}
{/literal}
</script>
{/run-once}

{def $content_css_list = array()
     $skin             = ezini( 'EditorSettings', 'Skin', 'ezoe.ini',,true() )
     $link_classes     = hash()
     $link_class_names = hash()
     $image_sizes      = ezini( 'AliasSettings', 'AliasList', 'image.ini' )
     $view_modes       = ezini( 'embed', 'AvailableViewModes', 'content.ini' )|merge( ezini( 'embed-inline', 'AvailableViewModes', 'content.ini' ) )|unique
     $cur_locale       = fetch( 'content', 'locale' )
     $editor_id        = concat( $attribute_base, '_data_text_', $attribute.id )
     $switch_name      = ''
     $disable_name     = ''}
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
</div>

<script type="text/javascript">
expOETiptapStart( '{$editor_id}', {ldelim}
    attributeId: {$attribute.id},
    contentObjectId: {$attribute.contentobject_id},
    version: {$attribute.version},
    language: {json_encode( $attribute.language_code )},
    rows: {$editorRow},
    minHeight: {$exp_oe.min_height},
    buttons: {json_encode( $layout_settings['buttons'] )},
    pathLocation: {json_encode( $layout_settings['path_location'] )},
    toolbarLocation: {json_encode( $layout_settings['toolbar_location'] )},
    skin: {json_encode( $skin )},
    contentCss: {json_encode( ezcssfiles( $content_css_list, 3, true() ) )},
    xmlTagAlias: {$input_handler.json_xml_tag_alias},
    customTags: {json_encode( $input_handler.custom_tag_definitions )},
    literal: {json_encode( $input_handler.literal_definition )},
    tableDefinitions: {json_encode( $input_handler.table_definitions )},
    generalDefinitions: {json_encode( $input_handler.general_definitions )},
    embedDefinitions: {json_encode( $input_handler.embed_definitions )},
    linkClasses: {json_encode( $link_classes )},
    linkViewModes: {json_encode( ezini( 'link', 'AvailableViewModes', 'content.ini' ) )},
    customAttributeStyleMap: {json_encode( ezini( 'EditorSettings', 'CustomAttributeStyleMap', 'ezoe.ini',,true() ) )},
    imageSizes: {json_encode( $image_sizes )},
    viewModes: {json_encode( $view_modes )},
    defaultSize: {json_encode( ezini( 'ImageSettings', 'DefaultEmbedAlias', 'content.ini' ) )},
    uploadExtensions: {json_encode( $exp_oe.upload_extensions )},
    uploadFromUrl: {json_encode( $exp_oe.upload_from_url )},
    urls: {ldelim}
        root: {'/'|ezroot},
        ezoe: {'/ezoe/'|ezurl},
        ezjscore: {'/ezjscore/'|ezurl},
        contentEdit: {'/content/edit'|ezurl},
        'switch': {'/exp_oe_tiptap/switch'|ezurl}
    {rdelim},
    formToken: "@$ezxFormToken@",
    switchButtonName: {json_encode( $switch_name )},
    disableButtonName: {json_encode( $disable_name )},
    ai: {ldelim}
        enabled: {cond( $exp_oe.ai_enabled, 'true', 'false' )},
        commands: {json_encode( cond( $exp_oe.ai_enabled, $exp_oe.ai_commands, array() ) )},
        call: 'expoetiptap::ai'
    {rdelim},
    // English text => translation (context extension/exp_oe_tiptap); texts missing here stay English
    i18n: {json_encode( $exp_oe.i18n )},
    editorLabel: {json_encode( $exp_oe.label )},
    otherEditorLabel: {json_encode( $exp_oe.other_label )},
    locale: {json_encode( $cur_locale.http_locale_code )}
{rdelim} );
</script>
{undef $layout_settings $content_css_list $skin $link_classes $link_class_names $image_sizes $view_modes $cur_locale $editor_id $switch_name $disable_name}
{/default}
