<?php
/**
 * The extension's own settings leave the skin undefined. An extension's settings are read after a siteaccess's,
 * so a Skin value in settings/exp_oe_tiptap.ini.append.php would hide every siteaccess's choice of skin.
 */

require_once __DIR__ . '/bootstrap.php';

use PHPUnit\Framework\TestCase;

final class SettingsDefaultsTest extends TestCase
{
    public function testSkinIsLeftToTheSiteaccess()
    {
        $file = file_get_contents( EXP_OE_TIPTAP_TEST_EXTENSION . '/settings/exp_oe_tiptap.ini.append.php' );
        $this->assertNotFalse( $file );
        $this->assertDoesNotMatchRegularExpression( '/^\s*Skin\s*=/m', $file, 'Skin is not set by the extension' );
        $this->assertMatchesRegularExpression( '/^#Skin=$/m', $file, 'the setting is named, commented out' );
    }

    public function testTheTemplateReadsTheSkinOnlyWhenItIsSet()
    {
        $tpl = file_get_contents( EXP_OE_TIPTAP_TEST_EXTENSION . '/design/standard/templates/content/datatype/edit/ezxmltext_exp_oe_tiptap_editor.tpl' );
        $this->assertStringContainsString( "ezini_hasvariable( 'EditorSettings', 'Skin', 'exp_oe_tiptap.ini' )", $tpl );
    }

    /**
     * admin4 gets the skin a4 through DesignSkin[], looked up with the SiteDesign, and a siteaccess's Skin is applied
     * after it, so it still decides
     */
    public function testAdmin4GetsTheSkinA4UnlessTheSiteaccessSetsASkin()
    {
        $file = file_get_contents( EXP_OE_TIPTAP_TEST_EXTENSION . '/settings/exp_oe_tiptap.ini.append.php' );
        $this->assertMatchesRegularExpression( '/^DesignSkin\[admin4\]=a4$/m', $file );
        $this->assertMatchesRegularExpression( '/^DesignSkin\[admin4l\]=a4$/m', $file );
        $tpl = file_get_contents( EXP_OE_TIPTAP_TEST_EXTENSION . '/design/standard/templates/content/datatype/edit/ezxmltext_exp_oe_tiptap_editor.tpl' );
        $this->assertStringContainsString( "ezini( 'DesignSettings', 'SiteDesign', 'site.ini' )", $tpl );
        $this->assertStringContainsString( "ezini_hasvariable( 'EditorSettings', 'DesignSkin', 'exp_oe_tiptap.ini' )", $tpl );
        $this->assertStringContainsString( '{if is_set( $design_skins[$site_design] )}', $tpl );
        $design = strpos( $tpl, '{set $tiptap_skin = $design_skins[$site_design]}' );
        $skin = strpos( $tpl, "{set \$tiptap_skin = ezini( 'EditorSettings', 'Skin', 'exp_oe_tiptap.ini',, true() )}" );
        $this->assertNotFalse( $design );
        $this->assertNotFalse( $skin );
        $this->assertLessThan( $skin, $design, 'Skin is set after DesignSkin[], so it wins' );
    }

    /** SourceEditable is named, left to the siteaccess as Skin is, and editable unless it says disabled */
    public function testSourceEditableIsEnabledUnlessASiteaccessDisablesIt()
    {
        $file = file_get_contents( EXP_OE_TIPTAP_TEST_EXTENSION . '/settings/exp_oe_tiptap.ini.append.php' );
        $this->assertStringStartsWith( '<?php /* #?ini charset="utf-8"?', $file, 'the INI wrapper' );
        $this->assertMatchesRegularExpression( '/^#SourceEditable=enabled$/m', $file );
        $this->assertDoesNotMatchRegularExpression( '/^\s*SourceEditable\s*=/m', $file );
        $php = file_get_contents( EXP_OE_TIPTAP_TEST_EXTENSION . '/classes/expoetiptapeditor.php' );
        $this->assertStringContainsString( "self::setting( 'EditorSettings', 'SourceEditable', 'enabled' ) !== 'disabled'", $php );
        $tpl = file_get_contents( EXP_OE_TIPTAP_TEST_EXTENSION . '/design/standard/templates/content/datatype/edit/ezxmltext_exp_oe_tiptap_editor.tpl' );
        $this->assertStringContainsString( "\"sourceEditable\": {cond( \$exp_oe.source_editable, 'true', 'false' )}", $tpl );
    }

    /**
     * AtomicInlineCustomTags[] lists the formulas without a reset line, so a siteaccess's names are added rather than
     * dropped, and reaches the editor as the option atomicInlineCustomTags
     */
    public function testAtomicInlineCustomTagsReachTheEditor()
    {
        $file = file_get_contents( EXP_OE_TIPTAP_TEST_EXTENSION . '/settings/exp_oe_tiptap.ini.append.php' );
        $this->assertMatchesRegularExpression( '/^AtomicInlineCustomTags\[\]=math_latex$/m', $file );
        $this->assertMatchesRegularExpression( '/^AtomicInlineCustomTags\[\]=math_mathml$/m', $file );
        $this->assertDoesNotMatchRegularExpression( '/^AtomicInlineCustomTags\[\]\s*$/m', $file, 'no reset line' );
        $this->assertContains( 'math_latex', expOETiptapEditor::atomicInlineCustomTags() );
        $this->assertContains( 'math_mathml', expOETiptapEditor::atomicInlineCustomTags() );
        $tpl = file_get_contents( EXP_OE_TIPTAP_TEST_EXTENSION . '/design/standard/templates/content/datatype/edit/ezxmltext_exp_oe_tiptap_editor.tpl' );
        $this->assertStringContainsString( '"atomicInlineCustomTags": {json_encode( $exp_oe.atomic_inline_custom_tags )}', $tpl );
        // the TeX source tags of content.ini, for the line comments of a formula's text
        $this->assertStringContainsString( '"texSourceCustomTags": {json_encode( $exp_oe.tex_source_custom_tags )}', $tpl );
        $ini = eZINI::instance( 'content.ini' );
        $saved = $ini->hasVariable( 'CustomTagSettings', 'TeXSource' ) ? $ini->variable( 'CustomTagSettings', 'TeXSource' ) : null;
        $ini->setVariable( 'CustomTagSettings', 'TeXSource', array( 'math_latex' => 'true', 'math_mathml' => 'false' ) );
        $names = expOETiptapEditor::texSourceCustomTags();
        if ( $saved === null )
            $ini->removeSetting( 'CustomTagSettings', 'TeXSource' );
        else
            $ini->setVariable( 'CustomTagSettings', 'TeXSource', $saved );
        $this->assertSame( array( 'math_latex' ), $names );
    }
}
