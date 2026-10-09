{* exp_oe_tiptap/switch: the online editor of the current user. The edit form switches with its own button; this
   page is for choosing outside the edit form. The form token is added to the form by ezformtoken. *}
<div class="context-block">
<div class="box-header"><h1 class="context-title">{'Online editor'|i18n( 'extension/exp_oe_tiptap' )}</h1></div>
<div class="box-content">
{if $saved}
    <div class="message-feedback"><h2>{'The editor of your user was saved.'|i18n( 'extension/exp_oe_tiptap' )}</h2></div>
{/if}
{if $error}
    <div class="message-warning"><h2>{'This editor cannot be chosen.'|i18n( 'extension/exp_oe_tiptap' )}</h2></div>
{/if}
{if $switch_enabled|not}
    <div class="message-warning"><h2>{'Switching the editor is disabled on this site.'|i18n( 'extension/exp_oe_tiptap' )}</h2></div>
{/if}
<form method="post" action={'/exp_oe_tiptap/switch'|ezurl}>
    <div class="block">
        <label for="exp-oe-editor">{'Editor for text fields'|i18n( 'extension/exp_oe_tiptap' )}</label>
        <select id="exp-oe-editor" name="Editor"{if $switch_enabled|not} disabled="disabled"{/if}>
            <option value=""{if eq( $preference, '' )} selected="selected"{/if}>{'Default of this site (%editor)'|i18n( 'extension/exp_oe_tiptap',, hash( '%editor', $editors[$default_editor] ) )|wash}</option>
            {foreach $editors as $id => $label}
            {if or( ne( $id, 'tiptap' ), $tiptap_available )}
            <option value="{$id|wash}"{if eq( $preference, $id )} selected="selected"{/if}>{$label|wash}</option>
            {/if}
            {/foreach}
        </select>
        <p>{'In use now: %editor. Saved only for your user; the text of your content is the same with either editor.'|i18n( 'extension/exp_oe_tiptap',, hash( '%editor', $editors[$resolved] ) )|wash}</p>
    </div>
    <div class="controlbar"><input class="button" type="submit" name="SwitchEditorButton" value="{'Save'|i18n( 'extension/exp_oe_tiptap' )}"{if $switch_enabled|not} disabled="disabled"{/if} /></div>
</form>
</div>
</div>
