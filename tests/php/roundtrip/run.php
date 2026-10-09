<?php
/**
 * Step 2 of the round trip test: feeds the HTML that came out of Tiptap (step 1, tests/js/schema/roundtrip.mjs) to
 * ezoe's parser and compares the ezxml with the fixture's original ezxml. The same is done for the baseline (the
 * fixture's HTML posted by ezoe without Tiptap), so a loss of ezoe itself is told from a loss of Tiptap.
 *
 * Needs a COPY of the database the fixtures come from (the parser registers link URLs):
 *
 *   EXPOETIPTAP_SANDBOX_DB=/abs/path/copy.db EXPOETIPTAP_TIPTAP_DIR=/abs/path/step1-output \
 *     php bin/php/ezexec.php -s admin extension/exp_oe_tiptap/tests/php/roundtrip/run.php --allow-root-user
 *
 * Writes report.json and report.md to EXPOETIPTAP_TIPTAP_DIR; exits 1 when Tiptap loses anything ezoe keeps.
 *
 * @copyright Copyright (C) 1998 - 2026 7x & Exponential Foundation
 * @license GNU General Public License v2.0 (or any later version)
 * @package exp_oe_tiptap
 */

require_once __DIR__ . '/expoetiptaproundtrip.php';

$fixtureDir = realpath( __DIR__ . '/../../fixtures' );
$tiptapDir = getenv( 'EXPOETIPTAP_TIPTAP_DIR' );
$only = getenv( 'EXPOETIPTAP_ONLY' );
expOETiptapRoundtrip::useSandboxDatabase( getenv( 'EXPOETIPTAP_SANDBOX_DB' ) );
if ( !$tiptapDir || !is_dir( $tiptapDir ) )
{
    echo "FAIL EXPOETIPTAP_TIPTAP_DIR is not the output directory of tests/js/schema/roundtrip.mjs\n";
    return 1;
}

$labels = array( 'identical' => 'identical', 'equal' => 'equal (whitespace / nesting order)', 'lossy' => 'LOSSY' );
$rows = array();
$totals = array( 'tiptap' => array(), 'baseline' => array(), 'tiptap_vs_baseline' => array() );
$tiptapOnlyLoss = 0;
foreach ( glob( "$fixtureDir/*.xml" ) as $xmlFile )
{
    $name = basename( $xmlFile, '.xml' );
    if ( $only && strpos( $name, $only ) === false )
        continue;
    $tiptapFile = "$tiptapDir/$name.html";
    $baselineFile = "$tiptapDir/$name.ezoe.html";
    if ( !is_file( $tiptapFile ) || !is_file( $baselineFile ) )
    {
        echo "FAIL $name: no output of step 1\n";
        return 1;
    }
    $original = file_get_contents( $xmlFile );
    $tiptapXml = expOETiptapRoundtrip::editorHTMLToXML( file_get_contents( $tiptapFile ), $tiptapMessages );
    $baselineXml = expOETiptapRoundtrip::editorHTMLToXML( file_get_contents( $baselineFile ), $baselineMessages );
    file_put_contents( "$tiptapDir/$name.tiptap.xml", $tiptapXml );
    file_put_contents( "$tiptapDir/$name.ezoe.xml", $baselineXml );

    $tiptap = expOETiptapRoundtrip::compare( $original, $tiptapXml );
    $baseline = expOETiptapRoundtrip::compare( $original, $baselineXml );
    $versus = expOETiptapRoundtrip::compare( $baselineXml, $tiptapXml );
    $totals['tiptap'][$tiptap['result']] = ( $totals['tiptap'][$tiptap['result']] ?? 0 ) + 1;
    $totals['baseline'][$baseline['result']] = ( $totals['baseline'][$baseline['result']] ?? 0 ) + 1;
    $totals['tiptap_vs_baseline'][$versus['result']] = ( $totals['tiptap_vs_baseline'][$versus['result']] ?? 0 ) + 1;
    if ( $versus['result'] === 'lossy' )
        $tiptapOnlyLoss++;
    $rows[] = array( 'name' => $name, 'tiptap' => $tiptap, 'baseline' => $baseline, 'tiptap_vs_baseline' => $versus,
                     'messages' => array_values( array_unique( array_merge( (array)$tiptapMessages, (array)$baselineMessages ) ) ) );
}

$md = "| fixture | Tiptap vs original | ezoe alone vs original | Tiptap vs ezoe alone |\n|---|---|---|---|\n";
foreach ( $rows as $row )
{
    $md .= '| ' . $row['name'] . ' | ' . $labels[$row['tiptap']['result']] . ' | ' . $labels[$row['baseline']['result']] .
           ' | ' . $labels[$row['tiptap_vs_baseline']['result']] . " |\n";
    printf( "%-55s tiptap: %-10s ezoe: %-10s tiptap-vs-ezoe: %s\n", $row['name'], $row['tiptap']['result'],
            $row['baseline']['result'], $row['tiptap_vs_baseline']['result'] );
    if ( $row['tiptap_vs_baseline']['result'] === 'lossy' )
        echo '    ' . str_replace( "\n", "\n    ", $row['tiptap_vs_baseline']['detail'] ) . "\n";
}
file_put_contents( "$tiptapDir/report.json", json_encode( array( 'totals' => $totals, 'fixtures' => $rows ), JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE ) );
file_put_contents( "$tiptapDir/report.md", $md );

echo "\nTotals: " . json_encode( $totals ) . "\n";
echo ( $tiptapOnlyLoss ? 'FAIL' : 'PASS' ) . ' ' . count( $rows ) . " fixtures, $tiptapOnlyLoss where Tiptap loses what ezoe alone keeps\n";
return $tiptapOnlyLoss ? 1 : 0;
