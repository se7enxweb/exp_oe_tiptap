{* The switch between ezoe and Tiptap below the editor. A custom action button: content/edit validates and stores the
   draft first (like ezoe's "Disable editor"), then expOETiptapXMLInput stores the preference exp_oe_editor and the form
   comes back with the other editor. The Tiptap toolbar clicks this button for its own switch item. *}
<div class="block exp-oe-switch">
    <input class="button exp-oe-switch-button" type="submit"
           name="CustomActionButton[{$attribute.id}_{$exp_oe.switch_action|wash}]"
           value="{'Switch to %editor'|i18n( 'extension/exp_oe_tiptap',, hash( '%editor', $exp_oe.other_label ) )|wash}"
           title="{'Your text is kept: the draft is stored first. The choice is saved for your user.'|i18n( 'extension/exp_oe_tiptap' )|wash}" />
    <span class="exp-oe-switch-current">{'Editing with %editor'|i18n( 'extension/exp_oe_tiptap',, hash( '%editor', $exp_oe.label ) )|wash}</span>
</div>
