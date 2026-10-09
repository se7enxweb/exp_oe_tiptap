<?php /* #?ini charset="utf-8"?

[InputSettings]
# The input handler of ezxmltext. It extends ezoe's eZOEXMLInput and only chooses the edit template
# (ezoe's TinyMCE or Tiptap); parsing and validation stay ezoe's. extension.xml declares <extends>ezoe, so these
# settings are read after ezoe's and this line replaces its AliasClasses[eZSimplifiedXMLInput]=eZOEXMLInput.
AliasClasses[eZSimplifiedXMLInput]=expOETiptapXMLInput

*/ ?>
