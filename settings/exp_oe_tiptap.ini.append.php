<?php /* #?ini charset="utf-8"?

# exp_oe_tiptap: the Tiptap online editor for ezxmltext fields, next to the Online Editor (ezoe).
# Every setting is described in doc/configuration.md. Override per siteaccess in
# settings/siteaccess/<siteaccess>/exp_oe_tiptap.ini.append.php, secrets only in
# settings/override/exp_oe_tiptap.ini.append.php (never committed).

[EditorSettings]
# The editor of ezxmltext fields for users without a preference of their own: ezoe or tiptap.
# tiptap falls back to ezoe while the built bundle (Scripts[], first entry) is missing.
DefaultEditor=ezoe

# enabled: editors with the policy exp_oe_tiptap/switch get a button below the editor to switch to the
# other editor; their choice is stored as the user preference exp_oe_editor and the draft is stored first.
# disabled: everybody gets DefaultEditor, stored preferences are ignored.
AllowSwitch=enabled

# How the bundle is put on the page.
# ezdesign: script and link tags pointing at the built files, cache-busted by their file time
#           (like ezoe's TinyMCE 8 engine; the files are never repacked or minified again).
# ezjscore: ezscript_require() / ezcss_require(), packed with the rest of the page by ezjscore.
AssetLoading=ezdesign

# The built files, as design paths below javascript/ and stylesheets/ (built by npm run build, committed).
# The first script is the bundle that defines window.ExpOETiptap.
Scripts[]
Scripts[]=exp_oe_tiptap/exp_oe_tiptap.js
Styles[]
Styles[]=exp_oe_tiptap/exp_oe_tiptap.css

# Minimum height of the editing area in pixels; the class attribute's text rows can make it taller.
MinHeight=300


[AISettings]
# The AI commands of the editor (improve, shorten, ...). Off by default. When enabled, only users with the
# policy exp_oe_tiptap/ai see them. The browser never talks to the provider: it calls the ezjscore server
# function expoetiptap::ai, which checks policy and form token and calls the provider server side.
Enabled=false

# openai-compatible: any endpoint speaking the OpenAI chat completions API (OpenAI, Azure OpenAI, Mistral,
#                    self-hosted servers such as Ollama or vLLM)
# anthropic:         the Anthropic Messages API
# tiptap-cloud:      Tiptap's hosted AI service (needs a Tiptap account; check its terms first)
Provider=openai-compatible

# The provider's API URL, e.g. https://api.openai.com/v1/chat/completions,
# https://api.anthropic.com/v1/messages or http://127.0.0.1:11434/v1/chat/completions
Endpoint=

# The model name the provider expects.
Model=

# The API key. Put it ONLY in settings/override/exp_oe_tiptap.ini.append.php, never in a committed file.
# It is never sent to the browser.
ApiKey=

# Seconds to wait for the provider.
Timeout=30

# The longest text (characters) a command may send, and the longest answer (tokens) it may ask for.
MaxInputLength=20000
MaxOutputTokens=2000

# The commands offered in the editor, in this order.
Commands[]
Commands[]=improve
Commands[]=shorten
Commands[]=extend
Commands[]=fix_spelling
Commands[]=translate
Commands[]=summarise
Commands[]=continue

*/ ?>
