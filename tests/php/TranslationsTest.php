<?php
/**
 * The editor's texts: options.i18n is keyed by the English text and carries every text of the bundle
 * (strings.json), and every text the extension shows (bundle, templates, PHP, AI error messages) has a German
 * translation and an entry in the untranslated template.
 */

require_once __DIR__ . '/bootstrap.php';

use PHPUnit\Framework\TestCase;

final class TranslationsTest extends TestCase
{
    const CONTEXT = 'extension/exp_oe_tiptap';

    private function sources( $language )
    {
        $xml = simplexml_load_file( EXP_OE_TIPTAP_TEST_EXTENSION . '/translations/' . $language . '/translation.ts' );
        $this->assertNotFalse( $xml );
        $sources = array();
        foreach ( $xml->context as $context )
        {
            $this->assertSame( self::CONTEXT, (string) $context->name );
            foreach ( $context->message as $message )
                $sources[(string) $message->source] = (string) $message->translation;
        }
        return $sources;
    }

    /** @return array the texts of the bundle, the list the build writes */
    private function bundleStrings()
    {
        $strings = json_decode( (string) file_get_contents( EXP_OE_TIPTAP_TEST_EXTENSION . '/design/standard/javascript/exp_oe_tiptap/strings.json' ), true );
        $this->assertIsArray( $strings );
        $this->assertNotEmpty( $strings );
        return $strings;
    }

    /** @return array the English texts of the templates (|i18n with this context) and of the PHP code */
    private function serverStrings()
    {
        $q = "'((?:[^'\\\\]|\\\\.)*)'";
        $texts = array();
        $files = array_merge(
            glob( EXP_OE_TIPTAP_TEST_EXTENSION . '/design/standard/templates/*/*.tpl' ) ?: array(),
            glob( EXP_OE_TIPTAP_TEST_EXTENSION . '/design/standard/templates/*/*/*/*.tpl' ) ?: array()
        );
        foreach ( $files as $file )
        {
            preg_match_all( '/' . $q . "\\|i18n\\(\\s*'" . preg_quote( self::CONTEXT, '/' ) . "'/", (string) file_get_contents( $file ), $m );
            $texts = array_merge( $texts, $m[1] );
        }
        $files = array_merge( glob( EXP_OE_TIPTAP_TEST_EXTENSION . '/classes/*.php' ) ?: array(),
                              glob( EXP_OE_TIPTAP_TEST_EXTENSION . '/classes/*/*.php' ) ?: array(),
                              glob( EXP_OE_TIPTAP_TEST_EXTENSION . '/modules/*/*.php' ) ?: array() );
        foreach ( $files as $file )
        {
            $source = (string) file_get_contents( $file );
            foreach ( array( "ezpI18n::tr\\(\\s*'" . preg_quote( self::CONTEXT, '/' ) . "',\\s*" . $q,
                             'expOETiptapAIException\\(\\s*' . $q, '\\$message = ' . $q ) as $pattern )
            {
                preg_match_all( '/' . $pattern . '/', $source, $m );
                $texts = array_merge( $texts, $m[1] );
            }
        }
        $texts = array_unique( array_map( 'stripslashes', $texts ) );
        $this->assertGreaterThan( 30, count( $texts ) );
        return $texts;
    }

    public function testTranslationsAreKeyedByTheEnglishText()
    {
        $translations = expOETiptapEditor::translations();
        $this->assertArrayHasKey( 'Switch to %editor', $translations );
        $this->assertArrayHasKey( 'Bold', $translations );
        foreach ( $translations as $source => $text )
        {
            $this->assertIsString( $source );
            $this->assertIsString( $text );
        }
    }

    public function testTheEditorGetsEveryTextOfTheBundle()
    {
        $translations = expOETiptapEditor::translations();
        foreach ( $this->bundleStrings() as $source )
            $this->assertArrayHasKey( $source, $translations, $source );
        // the AI panel's own texts are among them: chips, warnings, buttons, scope, client errors
        foreach ( array( 'Inline object', 'Keep original', 'Insert below', 'Try again', 'selected text', 'whole document',
                         'The AI assistant is not available (HTTP %status).' ) as $source )
            $this->assertArrayHasKey( $source, $translations, $source );
    }

    public function testEveryBuiltInTextIsInBothTranslationFiles()
    {
        $german = $this->sources( 'ger-DE' );
        $untranslated = $this->sources( 'untranslated' );
        $property = new ReflectionProperty( 'expOETiptapEditor', 'strings' );
        foreach ( $property->getValue() as $source )
        {
            $this->assertArrayHasKey( $source, $untranslated, $source );
            $this->assertArrayHasKey( $source, $german, $source );
            $this->assertNotSame( '', $german[$source], $source );
        }
    }

    public function testEveryBundleTextHasAGermanTranslation()
    {
        $german = $this->sources( 'ger-DE' );
        $untranslated = $this->sources( 'untranslated' );
        foreach ( $this->bundleStrings() as $source )
        {
            $this->assertArrayHasKey( $source, $untranslated, $source );
            $this->assertArrayHasKey( $source, $german, $source );
            $this->assertNotSame( '', $german[$source], $source );
        }
    }

    public function testEveryTemplateAndServerTextHasAGermanTranslation()
    {
        $german = $this->sources( 'ger-DE' );
        $untranslated = $this->sources( 'untranslated' );
        foreach ( $this->serverStrings() as $source )
        {
            $this->assertArrayHasKey( $source, $untranslated, $source );
            $this->assertArrayHasKey( $source, $german, $source );
            $this->assertNotSame( '', $german[$source], $source );
        }
    }

    public function testBothFilesHaveTheSameTexts()
    {
        $this->assertSame( array_keys( $this->sources( 'untranslated' ) ), array_keys( $this->sources( 'ger-DE' ) ) );
    }

    public function testPlaceholdersSurviveTheTranslation()
    {
        foreach ( $this->sources( 'ger-DE' ) as $source => $german )
        {
            preg_match_all( '/%[a-z]+|%\d/', $source, $a );
            preg_match_all( '/%[a-z]+|%\d/', $german, $b );
            sort( $a[0] );
            sort( $b[0] );
            $this->assertSame( $a[0], $b[0], $source );
        }
    }

    public function testAIErrorsKeepTheirTextForTheTranslation()
    {
        $e = new expOETiptapAIException( 'The text is too long for the AI assistant (at most %max characters).', 'input 5 > 4', 0, array( '%max' => 4 ) );
        $this->assertSame( 'The text is too long for the AI assistant (at most 4 characters).', $e->getMessage() );
        $this->assertSame( 'The text is too long for the AI assistant (at most %max characters).', $e->getText() );
        $translated = $e->translated();
        $this->assertInstanceOf( 'expOETiptapAIException', $translated );
        $this->assertStringContainsString( '4', $translated->getMessage() );
        $this->assertSame( 'input 5 > 4', $translated->getLogDetail() );
    }
}
