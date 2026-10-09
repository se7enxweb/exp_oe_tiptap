#!/usr/bin/env bash
# Round trip test of the content mapping: fixtures (ezxml + ezoe HTML) -> Tiptap -> eZOEInputParser -> ezxml.
#
#   extension/exp_oe_tiptap/tests/php/roundtrip/run.sh <sandbox-copy.db> <work-dir>
#
# Run from the installation root. <sandbox-copy.db> is an absolute path of a COPY of the database the fixtures were
# taken from (the parser registers link URLs, the live database is refused). <work-dir> receives the HTML out of
# Tiptap, the ezxml of both paths and report.md / report.json.
# Exit code 0: Tiptap loses nothing ezoe alone keeps.
#
# License: GNU General Public License v2.0 (or any later version)
set -eu
if [ $# -ne 2 ] || [ ! -f "$1" ] || [ ! -f extension/exp_oe_tiptap/package.json ]; then
    echo "FAIL usage (from the installation root): $0 <sandbox-copy.db> <work-dir>"
    exit 2
fi
db=$(realpath "$1")
mkdir -p "$2"
work=$(realpath "$2")
( cd extension/exp_oe_tiptap && node tests/js/schema/roundtrip.mjs "$work" )
EXPOETIPTAP_SANDBOX_DB="$db" EXPOETIPTAP_TIPTAP_DIR="$work" \
    php bin/php/ezexec.php -s admin extension/exp_oe_tiptap/tests/php/roundtrip/run.php --allow-root-user
