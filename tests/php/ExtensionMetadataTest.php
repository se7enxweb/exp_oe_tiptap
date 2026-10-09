<?php
/**
 * ezinfo.php, extension.xml and composer.json say the same: version, name, licence, website (AGENTS.md: a release
 * carries its version in both files).
 */

require_once __DIR__ . '/bootstrap.php';

use PHPUnit\Framework\TestCase;

final class ExtensionMetadataTest extends TestCase
{
    private function xml()
    {
        $xml = simplexml_load_file( EXP_OE_TIPTAP_TEST_EXTENSION . '/extension.xml' );
        $this->assertNotFalse( $xml, 'extension.xml is well-formed' );
        return $xml;
    }

    private function composer()
    {
        $json = json_decode( file_get_contents( EXP_OE_TIPTAP_TEST_EXTENSION . '/composer.json' ), true );
        $this->assertIsArray( $json, 'composer.json is valid JSON' );
        return $json;
    }

    public function testEzinfoAndExtensionXmlAgree()
    {
        $info = exp_oe_tiptapInfo::info();
        $meta = $this->xml()->metadata;
        $this->assertSame( $info['Version'], (string) $meta->version );
        $this->assertSame( $info['Name'], (string) $meta->name );
        $this->assertSame( $info['License'], (string) $meta->license );
        $this->assertSame( $info['Info_url'], (string) $meta->info_url );
        $this->assertSame( $info['Copyright'], (string) $meta->copyright );
    }

    public function testVersionIsARealNumber()
    {
        $version = exp_oe_tiptapInfo::info()['Version'];
        $this->assertMatchesRegularExpression( '/^\d+\.\d+\.\d+(\.\d+)?$/', $version );
        $this->assertSame( '0.1.0', $version );
    }

    public function testLicenceAndWebsite()
    {
        $info = exp_oe_tiptapInfo::info();
        $this->assertSame( 'GNU General Public License v2.0 (or any later version)', $info['License'] );
        $this->assertSame( 'https://github.com/se7enxweb/exp_oe_tiptap', $info['Info_url'] );
        $this->assertStringContainsString( '7x & Exponential Foundation', $info['Copyright'] );
        $this->assertStringNotContainsString( 'eZ Publish', $info['Name'] );
    }

    public function testTiptapIsNamedAsThirdPartySoftware()
    {
        $info = exp_oe_tiptapInfo::info();
        $this->assertSame( 'Tiptap', $info['Includes the following third-party software']['Name'] );
        $this->assertSame( 'MIT License', $info['Includes the following third-party software']['License'] );
        $names = array();
        foreach ( $this->xml()->metadata->software->uses as $uses )
            $names[] = (string) $uses->name;
        $this->assertContains( 'Tiptap', $names );
    }

    public function testExtensionXmlRequiresEzoe()
    {
        $required = array();
        foreach ( $this->xml()->dependencies->requires->extension as $extension )
            $required[] = (string) $extension['name'];
        $this->assertContains( 'ezoe', $required );
        $this->assertContains( 'ezjscore', $required );
    }

    public function testComposer()
    {
        $composer = $this->composer();
        $this->assertSame( 'se7enxweb/exp_oe_tiptap', $composer['name'] );
        $this->assertSame( 'ezpublish-legacy-extension', $composer['type'] );
        $this->assertSame( 'GPL-2.0-or-later', $composer['license'] );
        $this->assertSame( 'exp_oe_tiptap', $composer['extra']['ezpublish-legacy-extension-name'] );
        $this->assertArrayHasKey( 'se7enxweb/exponential', $composer['require'], 'the kernel, which ships ezoe' );
        $this->assertArrayNotHasKey( 'version', $composer, 'the version comes from the tag' );
    }
}
