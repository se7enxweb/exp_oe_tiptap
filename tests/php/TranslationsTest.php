<?php
/**
 * The editor's texts: options.i18n is keyed by the English text, and every built-in text has a German translation
 * and an entry in the untranslated template.
 */

require_once __DIR__ . '/bootstrap.php';

use PHPUnit\Framework\TestCase;

final class TranslationsTest extends TestCase
{
    private function sources( $language )
    {
        $xml = simplexml_load_file( EXP_OE_TIPTAP_TEST_EXTENSION . '/translations/' . $language . '/translation.ts' );
        $this->assertNotFalse( $xml );
        $sources = array();
        foreach ( $xml->context as $context )
        {
            $this->assertSame( 'extension/exp_oe_tiptap', (string) $context->name );
            foreach ( $context->message as $message )
                $sources[(string) $message->source] = (string) $message->translation;
        }
        return $sources;
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

    public function testPlaceholdersSurviveTheTranslation()
    {
        foreach ( $this->sources( 'ger-DE' ) as $source => $german )
        {
            preg_match_all( '/%[a-z]+/', $source, $a );
            preg_match_all( '/%[a-z]+/', $german, $b );
            $this->assertSame( $a[0], $b[0], $source );
        }
    }
}
