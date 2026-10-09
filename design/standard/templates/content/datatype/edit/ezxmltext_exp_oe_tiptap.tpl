{* exp_oe_tiptap: the edit template of ezxmltext (expOETiptapXMLInput::editTemplateSuffix()). Renders the editor the
   user edits with (expOETiptapEditor::resolve(): switch of this request > preference exp_oe_editor > DefaultEditor):
   ezoe's own template, unchanged, or the Tiptap editor. The switch button follows; ezoe's "Disable editor" and its
   own engine switch stay where ezoe puts them. *}
{default input_handler=$attribute.content.input
         attribute_base='ContentObjectAttribute'
         editorRow=10}
{if gt( $attribute.contentclass_attribute.data_int1, 1 )}
    {set editorRow=$attribute.contentclass_attribute.data_int1}
{/if}
{def $exp_oe = $input_handler.exp_oe_editor}

{if and( $input_handler.is_editor_enabled, eq( $exp_oe.editor, 'tiptap' ) )}
    {include uri='design:content/datatype/edit/ezxmltext_exp_oe_tiptap_editor.tpl'
             attribute=$attribute
             input_handler=$input_handler
             attribute_base=$attribute_base
             editorRow=$editorRow
             exp_oe=$exp_oe}
{else}
    {include uri='design:content/datatype/edit/ezxmltext_ezoe.tpl'
             attribute=$attribute
             input_handler=$input_handler
             attribute_base=$attribute_base
             editorRow=$editorRow}
{/if}

{if and( $input_handler.is_editor_enabled, $exp_oe.can_switch )}
    {include uri='design:content/datatype/edit/ezxmltext_exp_oe_tiptap_switch.tpl' attribute=$attribute exp_oe=$exp_oe}
{/if}
{undef $exp_oe}
{/default}
