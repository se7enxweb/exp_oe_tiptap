<?php
/**
 * The switch: the form token check and the redirect limit of the view exp_oe_tiptap/switch, the custom action
 * names of the button in the edit form, and that the view checks POST and token before it stores anything.
 */

require_once __DIR__ . '/bootstrap.php';

use PHPUnit\Framework\TestCase;

final class SwitchViewTest extends TestCase
{
    const TOKEN = '0123456789abcdef0123456789abcdef01234567';

    public function testMatchingTokenInTheFormField()
    {
        $this->assertTrue( expOETiptapEditor::tokenValid( array( 'ezxform_token' => self::TOKEN ), array(), self::TOKEN ) );
    }

    public function testMatchingTokenInTheHeader()
    {
        $this->assertTrue( expOETiptapEditor::tokenValid( array(), array( 'HTTP_X_CSRF_TOKEN' => self::TOKEN ), self::TOKEN ) );
    }

    public function testWrongTokenIsRefused()
    {
        $this->assertFalse( expOETiptapEditor::tokenValid( array( 'ezxform_token' => strrev( self::TOKEN ) ), array(), self::TOKEN ) );
        $this->assertFalse( expOETiptapEditor::tokenValid( array(), array( 'HTTP_X_CSRF_TOKEN' => 'x' ), self::TOKEN ) );
    }

    public function testMissingTokenIsRefused()
    {
        $this->assertFalse( expOETiptapEditor::tokenValid( array( 'Editor' => 'tiptap' ), array(), self::TOKEN ) );
    }

    public function testTheFormFieldIsUsedBeforeTheHeader()
    {
        $this->assertFalse( expOETiptapEditor::tokenValid( array( 'ezxform_token' => 'wrong' ), array( 'HTTP_X_CSRF_TOKEN' => self::TOKEN ), self::TOKEN ) );
    }

    public function testNothingMatchesAnEmptyExpectation()
    {
        $this->assertFalse( expOETiptapEditor::tokensMatch( '', '' ) );
        $this->assertFalse( expOETiptapEditor::tokensMatch( null, null ) );
        $this->assertFalse( expOETiptapEditor::tokenValid( array( 'ezxform_token' => '' ), array(), '' ) );
    }

    public function testNonStringTokensAreRefused()
    {
        $this->assertFalse( expOETiptapEditor::tokenValid( array( 'ezxform_token' => array( self::TOKEN ) ), array(), self::TOKEN ) );
    }

    public function testLocalRedirects()
    {
        $this->assertSame( '/content/edit/57/3/ger-DE', expOETiptapEditor::localRedirect( '/content/edit/57/3/ger-DE' ) );
        $this->assertSame( '/', expOETiptapEditor::localRedirect( '//evil.example/x' ) );
        $this->assertSame( '/', expOETiptapEditor::localRedirect( 'https://evil.example/' ) );
        $this->assertSame( '/', expOETiptapEditor::localRedirect( '/\\evil.example' ) );
        $this->assertSame( '/', expOETiptapEditor::localRedirect( "/a\r\nLocation: https://evil.example" ) );
        $this->assertSame( '/', expOETiptapEditor::localRedirect( 'javascript:alert(1)' ) );
        $this->assertSame( '', expOETiptapEditor::localRedirect( null, '' ) );
    }

    public function testSwitchActionNames()
    {
        $this->assertSame( 'tiptap', expOETiptapXMLInput::switchActionEditor( 'exp_oe_switch_tiptap' ) );
        $this->assertSame( 'ezoe', expOETiptapXMLInput::switchActionEditor( 'exp_oe_switch_ezoe' ) );
        $this->assertSame( '', expOETiptapXMLInput::switchActionEditor( 'exp_oe_switch_default' ) );
        $this->assertNull( expOETiptapXMLInput::switchActionEditor( 'disable_editor' ) );
        $this->assertNull( expOETiptapXMLInput::switchActionEditor( 'switch_engine_tinymce8' ) );
        $this->assertNull( expOETiptapXMLInput::switchActionEditor( null ) );
    }

    public function testUnknownEditorIsNeverStored()
    {
        $this->assertFalse( expOETiptapEditor::setUserEditor( 'ckeditor' ) );
    }

    public function testTheViewChecksPostAndTokenBeforeStoring()
    {
        $source = file_get_contents( EXP_OE_TIPTAP_TEST_EXTENSION . '/modules/exp_oe_tiptap/switch.php' );
        $check = strpos( $source, "expOETiptapEditor::tokenValid( \$_POST, \$_SERVER )" );
        $post  = strpos( $source, "\$_SERVER['REQUEST_METHOD'] === 'POST'" );
        $store = strpos( $source, 'expOETiptapEditor::setUserEditor(' );
        $this->assertNotFalse( $check );
        $this->assertNotFalse( $post );
        $this->assertNotFalse( $store );
        $this->assertLessThan( $store, $check );
        $this->assertLessThan( $store, $post );
        $this->assertStringContainsString( 'expOETiptapEditor::localRedirect(', $source );
    }

    public function testTheViewNeedsTheSwitchPolicy()
    {
        $Module = null;
        include EXP_OE_TIPTAP_TEST_EXTENSION . '/modules/exp_oe_tiptap/module.php';
        $this->assertSame( array( 'switch' ), $ViewList['switch']['functions'] );
        $this->assertArrayHasKey( 'switch', $FunctionList );
        $this->assertArrayHasKey( 'ai', $FunctionList );
    }
}
