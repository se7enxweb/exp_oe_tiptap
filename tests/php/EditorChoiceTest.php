<?php
/**
 * The editor choice: per-request switch > user preference exp_oe_editor > [EditorSettings] DefaultEditor, the
 * preference only while switching is allowed, and tiptap only while its bundle is built.
 */

require_once __DIR__ . '/bootstrap.php';

use PHPUnit\Framework\TestCase;

final class EditorChoiceTest extends TestCase
{
    protected function tearDown(): void
    {
        eZINI::resetInstance( 'exp_oe_tiptap.ini' );
        expOETiptapEditor::reset();
    }

    private function setting( $block, $name, $value )
    {
        eZINI::instance( 'exp_oe_tiptap.ini' )->setVariable( $block, $name, $value );
    }

    public function testDefaultIsTheSetting()
    {
        $this->assertSame( 'ezoe', expOETiptapEditor::choose( 'ezoe', true, null, null, true ) );
        $this->assertSame( 'tiptap', expOETiptapEditor::choose( 'tiptap', true, null, null, true ) );
    }

    public function testUnknownDefaultFallsBackToEzoe()
    {
        $this->assertSame( 'ezoe', expOETiptapEditor::choose( 'ckeditor', true, null, null, true ) );
        $this->assertSame( 'ezoe', expOETiptapEditor::choose( '', true, '', null, true ) );
    }

    public function testPreferenceWinsOverTheDefault()
    {
        $this->assertSame( 'tiptap', expOETiptapEditor::choose( 'ezoe', true, 'tiptap', null, true ) );
        $this->assertSame( 'ezoe', expOETiptapEditor::choose( 'tiptap', true, 'ezoe', null, true ) );
    }

    public function testEmptyOrUnknownPreferenceMeansTheDefault()
    {
        $this->assertSame( 'tiptap', expOETiptapEditor::choose( 'tiptap', true, '', null, true ) );
        $this->assertSame( 'ezoe', expOETiptapEditor::choose( 'ezoe', true, 'tinymce8', null, true ) );
    }

    public function testRequestChoiceWinsOverThePreference()
    {
        $this->assertSame( 'ezoe', expOETiptapEditor::choose( 'tiptap', true, 'tiptap', 'ezoe', true ) );
        $this->assertSame( 'tiptap', expOETiptapEditor::choose( 'ezoe', true, 'ezoe', 'tiptap', true ) );
    }

    public function testWithoutSwitchEveryoneGetsTheDefault()
    {
        $this->assertSame( 'ezoe', expOETiptapEditor::choose( 'ezoe', false, 'tiptap', 'tiptap', true ) );
        $this->assertSame( 'tiptap', expOETiptapEditor::choose( 'tiptap', false, 'ezoe', 'ezoe', true ) );
    }

    public function testTiptapWithoutBundleFallsBackToEzoe()
    {
        $this->assertSame( 'ezoe', expOETiptapEditor::choose( 'tiptap', true, null, null, false ) );
        $this->assertSame( 'ezoe', expOETiptapEditor::choose( 'ezoe', true, 'tiptap', null, false ) );
        $this->assertSame( 'ezoe', expOETiptapEditor::choose( 'ezoe', true, null, 'tiptap', false ) );
    }

    public function testShippedSettings()
    {
        $this->assertSame( 'ezoe', expOETiptapEditor::defaultEditor() );
        $this->assertTrue( expOETiptapEditor::switchEnabled() );
        $this->assertSame( array( 'exp_oe_tiptap/exp_oe_tiptap.js' ), expOETiptapEditor::scripts() );
        $this->assertSame( array( 'exp_oe_tiptap/exp_oe_tiptap.css' ), expOETiptapEditor::styles() );
        $this->assertSame( 'false', expOETiptapEditor::setting( 'AISettings', 'Enabled' ) );
        $this->assertSame( '', expOETiptapEditor::setting( 'AISettings', 'ApiKey' ), 'no API key in a committed file' );
        $this->assertContains( 'improve', expOETiptapEditor::aiCommands() );
    }

    public function testSettingsAreRead()
    {
        $this->setting( 'EditorSettings', 'DefaultEditor', 'tiptap' );
        $this->setting( 'EditorSettings', 'AllowSwitch', 'disabled' );
        $this->assertSame( 'tiptap', expOETiptapEditor::defaultEditor() );
        $this->assertFalse( expOETiptapEditor::switchEnabled() );
        $this->assertFalse( expOETiptapEditor::switchAllowed(), 'no switch without the setting, whatever the policy' );

        $this->setting( 'EditorSettings', 'DefaultEditor', 'nonsense' );
        $this->assertSame( 'ezoe', expOETiptapEditor::defaultEditor() );
    }

    public function testAiIsOffWhileTheSettingIsOff()
    {
        $this->assertFalse( expOETiptapEditor::aiAllowed() );
    }

    public function testBundleAvailabilityFollowsTheFile()
    {
        $this->setting( 'EditorSettings', 'Scripts', array( 'exp_oe_tiptap/no-such-bundle.js' ) );
        $this->assertFalse( expOETiptapEditor::bundleFile() );
        $this->assertFalse( expOETiptapEditor::tiptapAvailable() );

        $this->setting( 'EditorSettings', 'Scripts', array() );
        $this->assertFalse( expOETiptapEditor::tiptapAvailable() );
    }

    public function testCacheKeyIsShortAndStable()
    {
        $key = expOETiptapEditor::cacheKey();
        $this->assertMatchesRegularExpression( '/^[0-9a-f]{10}$/', $key );
        $this->assertSame( $key, expOETiptapEditor::cacheKey() );
    }

    public function testOtherAndLabels()
    {
        $this->assertSame( 'tiptap', expOETiptapEditor::other( 'ezoe' ) );
        $this->assertSame( 'ezoe', expOETiptapEditor::other( 'tiptap' ) );
        $this->assertSame( 'Tiptap', expOETiptapEditor::label( 'tiptap' ) );
        $this->assertTrue( expOETiptapEditor::isEditor( 'ezoe' ) );
        $this->assertFalse( expOETiptapEditor::isEditor( 'TIPTAP' ) );
        $this->assertFalse( expOETiptapEditor::isEditor( null ) );
    }

    public function testRequestEditorOnlyTakesKnownEditors()
    {
        expOETiptapEditor::setRequestEditor( 'tiptap' );
        $this->assertSame( 'tiptap', expOETiptapEditor::requestEditor() );
        expOETiptapEditor::setRequestEditor( '<script>' );
        $this->assertNull( expOETiptapEditor::requestEditor() );
    }
}
