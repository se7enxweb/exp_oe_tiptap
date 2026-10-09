<?php
/**
 * expOETiptapXMLInput is ezoe's eZOEXMLInput with another edit template: it extends it, overrides nothing that
 * parses or validates, and is registered as the alias of eZSimplifiedXMLInput.
 */

require_once __DIR__ . '/bootstrap.php';

use PHPUnit\Framework\TestCase;

final class InputHandlerTest extends TestCase
{
    protected function setUp(): void
    {
        if ( !class_exists( 'eZOEXMLInput' ) )
            $this->markTestSkipped( 'ezoe is not installed in this root' );
    }

    public function testExtendsEzoesInputHandler()
    {
        $this->assertTrue( is_subclass_of( 'expOETiptapXMLInput', 'eZOEXMLInput' ) );
        $this->assertTrue( is_subclass_of( 'expOETiptapXMLInput', 'eZXMLInputHandler' ) );
    }

    public function testParsingAndValidationStayEzoes()
    {
        $own = array();
        foreach ( ( new ReflectionClass( 'expOETiptapXMLInput' ) )->getMethods() as $method )
        {
            if ( $method->getDeclaringClass()->getName() === 'expOETiptapXMLInput' )
                $own[] = $method->getName();
        }
        sort( $own );
        $this->assertSame( array( 'attribute', 'attributes', 'customObjectAttributeHTTPAction', 'editTemplateSuffix', 'editorInfo', 'switchActionEditor' ), $own );
        foreach ( array( 'validateInput', 'inputXML', 'isValid', 'convertInput' ) as $inherited )
            $this->assertNotContains( $inherited, $own );
    }

    public function testEditTemplate()
    {
        $handler = ( new ReflectionClass( 'expOETiptapXMLInput' ) )->newInstanceWithoutConstructor();
        $attribute = null;
        $this->assertSame( 'exp_oe_tiptap', $handler->editTemplateSuffix( $attribute ) );
        $this->assertTrue( is_file( EXP_OE_TIPTAP_TEST_EXTENSION . '/design/standard/templates/content/datatype/edit/ezxmltext_exp_oe_tiptap.tpl' ) );
        $this->assertTrue( is_file( EXP_OE_TIPTAP_TEST_EXTENSION . '/design/standard/templates/content/datatype/edit/ezxmltext_exp_oe_tiptap_editor.tpl' ) );
    }

    public function testTemplateAttributesKeepEzoesAndAddTheEditor()
    {
        $handler = ( new ReflectionClass( 'expOETiptapXMLInput' ) )->newInstanceWithoutConstructor();
        $attributes = $handler->attributes();
        $this->assertContains( 'exp_oe_editor', $attributes );
        foreach ( array( 'input_xml', 'is_editor_enabled', 'can_disable', 'editor_layout_settings', 'custom_tag_definitions', 'engine' ) as $ezoe )
            $this->assertContains( $ezoe, $attributes );
        $this->assertTrue( $handler->hasAttribute( 'exp_oe_editor' ) );
    }

    public function testRegisteredAsTheAliasOfTheSimplifiedInput()
    {
        $aliases = eZINI::instance( 'ezxml.ini' )->variable( 'InputSettings', 'AliasClasses' );
        $this->assertSame( 'expOETiptapXMLInput', $aliases['eZSimplifiedXMLInput'] );
    }

    public function testTheEzoeTemplateIsIncludedForEzoe()
    {
        $tpl = file_get_contents( EXP_OE_TIPTAP_TEST_EXTENSION . '/design/standard/templates/content/datatype/edit/ezxmltext_exp_oe_tiptap.tpl' );
        $this->assertStringContainsString( "design:content/datatype/edit/ezxmltext_ezoe.tpl", $tpl );
        $this->assertStringContainsString( "design:content/datatype/edit/ezxmltext_exp_oe_tiptap_editor.tpl", $tpl );
    }

    public function testTheTiptapTemplatePostsTheSameField()
    {
        $tpl = file_get_contents( EXP_OE_TIPTAP_TEST_EXTENSION . '/design/standard/templates/content/datatype/edit/ezxmltext_exp_oe_tiptap_editor.tpl' );
        $this->assertStringContainsString( "concat( \$attribute_base, '_data_text_', \$attribute.id )", $tpl );
        $this->assertStringContainsString( '{$input_handler.input_xml}', $tpl );
        $this->assertStringContainsString( 'window.ExpOETiptap.init( textarea, options )', $tpl );
    }
}
