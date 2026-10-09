<?php
/**
 * Which online editor an ezxmltext field is edited with: ezoe (TinyMCE) or tiptap, and the switch between them.
 *
 *  - resolve():       the editor of the current user and request
 *                     (per-request choice > user preference exp_oe_editor > [EditorSettings] DefaultEditor)
 *  - choose():        the same decision as a pure function, for tests and callers that know every input
 *  - setUserEditor(): stores the preference (the switch) and the per-request choice
 *  - tokenValid():    the form token check of the switch view
 *  - localRedirect(): the RedirectURI of the switch view, limited to a path on this site
 *
 * @copyright Copyright (C) 1998 - 2026 7x & Exponential Foundation. All rights reserved.
 * @license GNU General Public License v2.0 (or any later version)
 * @package exp_oe_tiptap
 */

class expOETiptapEditor
{
    const EZOE = 'ezoe';
    const TIPTAP = 'tiptap';
    const PREFERENCE = 'exp_oe_editor';
    const INI_FILE = 'exp_oe_tiptap.ini';

    /** @var string|null the editor chosen in this request (by the switch action), null when none */
    protected static $requestEditor = null;

    /** @var array|null cache of policy checks: function => bool */
    protected static $access = null;

    /** @return array the editors this extension knows */
    public static function editors()
    {
        return array( self::EZOE, self::TIPTAP );
    }

    /** @return bool */
    public static function isEditor( $id )
    {
        return is_string( $id ) && in_array( $id, self::editors(), true );
    }

    /** Forgets the per-request choice and the access cache (tests, long-running processes such as Velocity). */
    public static function reset()
    {
        self::$requestEditor = null;
        self::$access = null;
    }

    /**
     * The decision itself, without reading anything.
     *
     * @param string      $default         [EditorSettings] DefaultEditor
     * @param bool        $allowSwitch     [EditorSettings] AllowSwitch=enabled and the user has exp_oe_tiptap/switch
     * @param string|null $preference      the user preference exp_oe_editor
     * @param string|null $requestEditor   the per-request choice of the switch action
     * @param bool        $tiptapAvailable whether the built bundle is present
     * @return string ezoe or tiptap
     */
    public static function choose( $default, $allowSwitch, $preference, $requestEditor, $tiptapAvailable )
    {
        $editor = self::isEditor( $default ) ? $default : self::EZOE;
        if ( $allowSwitch && self::isEditor( $preference ) )
            $editor = $preference;
        if ( $allowSwitch && self::isEditor( $requestEditor ) )
            $editor = $requestEditor;
        if ( $editor === self::TIPTAP && !$tiptapAvailable )
            $editor = self::EZOE;
        return $editor;
    }

    /** @return string the editor of the current user in this request */
    public static function resolve()
    {
        $preference = eZPreferences::value( self::PREFERENCE );
        return self::choose( self::defaultEditor(), self::switchAllowed(), is_string( $preference ) ? $preference : null,
                             self::$requestEditor, self::tiptapAvailable() );
    }

    /** @return string the other editor than $editor */
    public static function other( $editor )
    {
        return $editor === self::TIPTAP ? self::EZOE : self::TIPTAP;
    }

    /** @return string English name of an editor, translated by the caller (context extension/exp_oe_tiptap) */
    public static function label( $editor )
    {
        return $editor === self::TIPTAP ? 'Tiptap' : 'Online Editor (TinyMCE)';
    }

    /** @return string [EditorSettings] DefaultEditor, ezoe when it names no editor */
    public static function defaultEditor()
    {
        $value = self::setting( 'EditorSettings', 'DefaultEditor', self::EZOE );
        return self::isEditor( $value ) ? $value : self::EZOE;
    }

    /** @return bool [EditorSettings] AllowSwitch=enabled */
    public static function switchEnabled()
    {
        return self::setting( 'EditorSettings', 'AllowSwitch', 'enabled' ) === 'enabled';
    }

    /** @return bool whether the current user may switch: the setting and the policy exp_oe_tiptap/switch */
    public static function switchAllowed()
    {
        return self::switchEnabled() && self::currentUserHasAccess( 'switch' );
    }

    /** @return bool whether the current user may use the AI commands: [AISettings] Enabled and exp_oe_tiptap/ai */
    public static function aiAllowed()
    {
        return self::setting( 'AISettings', 'Enabled', 'false' ) === 'true' && self::currentUserHasAccess( 'ai' );
    }

    /** @return array [AISettings] Commands[] */
    public static function aiCommands()
    {
        return array_values( array_filter( (array) self::setting( 'AISettings', 'Commands', array() ), 'strlen' ) );
    }

    /** @var array the English texts of the editor every page gets translated; the bundle's strings.json adds its own */
    protected static $strings = array(
        'Switch to %editor', 'Editing with %editor', 'Online Editor (TinyMCE)', 'Tiptap',
        'Bold', 'Italic', 'Underline', 'Subscript', 'Superscript', 'Paragraph', 'Preformatted',
        'Heading 1', 'Heading 2', 'Heading 3', 'Heading 4', 'Heading 5', 'Heading 6',
        'Bullet list', 'Numbered list', 'Indent', 'Outdent', 'Undo', 'Redo', 'Link', 'Remove link', 'Unlink', 'Anchor',
        'Image', 'Object', 'File', 'Custom tag', 'Literal', 'Literal text', 'Table', 'Paste as text', 'Full screen', 'Source',
        'Format', 'Path', 'Editor toolbar', 'Drag to resize', 'OK', 'Cancel', 'Remove formatting',
        'Insert/edit link', 'Insert/edit anchor', 'Insert/edit image', 'Insert/edit object', 'Insert/edit file',
        'Insert/edit table', 'Insert custom tag', 'Insert page break', 'Insert special character', 'Table cell properties',
        'Toggle fullscreen mode', 'Store draft (Ctrl+S)', 'Send for publishing', 'Discard draft', 'Help (Alt+0)',
        'Undo (Ctrl+Z)', 'Redo (Ctrl+Y)',
        'AI', 'AI assistant', 'Accept', 'Reject', 'Improve writing', 'Make shorter', 'Make longer', 'Fix spelling and grammar',
        'Translate', 'Summarise', 'Continue writing',
    );

    /**
     * The editor's texts, translated (context extension/exp_oe_tiptap): English text => translation, the form
     * options.i18n has. The texts are the list above plus the JSON list strings.json the build may write next to
     * the bundle (every text the bundle passes to its translator). Placeholders such as %editor stay in place.
     *
     * @return array
     */
    public static function translations()
    {
        $sources = self::$strings;
        $scripts = self::scripts();
        if ( $scripts )
        {
            $file = dirname( __DIR__ ) . '/design/standard/javascript/' . dirname( ltrim( $scripts[0], '/' ) ) . '/strings.json';
            $more = is_file( $file ) ? json_decode( (string) file_get_contents( $file ), true ) : null;
            if ( is_array( $more ) )
                $sources = array_merge( $sources, array_filter( $more, 'is_string' ) );
        }
        $translations = array();
        foreach ( array_unique( $sources ) as $source )
            $translations[$source] = ezpI18n::tr( 'extension/exp_oe_tiptap', $source );
        return $translations;
    }

    /** @return array design paths below javascript/ of the built scripts ([EditorSettings] Scripts[]) */
    public static function scripts()
    {
        return array_values( array_filter( (array) self::setting( 'EditorSettings', 'Scripts', array() ), 'strlen' ) );
    }

    /** @return array design paths below stylesheets/ of the built styles ([EditorSettings] Styles[]) */
    public static function styles()
    {
        return array_values( array_filter( (array) self::setting( 'EditorSettings', 'Styles', array() ), 'strlen' ) );
    }

    /** @return string|false absolute file of the bundle (the first script), false when it is missing */
    public static function bundleFile()
    {
        $scripts = self::scripts();
        if ( !$scripts )
            return false;
        $file = dirname( __DIR__ ) . '/design/standard/javascript/' . ltrim( $scripts[0], '/' );
        return is_file( $file ) ? $file : false;
    }

    /** @return bool whether Tiptap can run: its bundle has been built */
    public static function tiptapAvailable()
    {
        return self::bundleFile() !== false;
    }

    /** @return string a short key that changes whenever a built file changes, for ?v= on the asset URLs */
    public static function cacheKey()
    {
        $times = array();
        foreach ( self::scripts() as $path )
            $times[] = @filemtime( dirname( __DIR__ ) . '/design/standard/javascript/' . ltrim( $path, '/' ) );
        foreach ( self::styles() as $path )
            $times[] = @filemtime( dirname( __DIR__ ) . '/design/standard/stylesheets/' . ltrim( $path, '/' ) );
        return substr( md5( implode( ',', $times ) ), 0, 10 );
    }

    /**
     * Stores the editor of the current user (the preference exp_oe_editor) and makes it the editor of this request.
     *
     * @param string $editor ezoe, tiptap, or '' to go back to DefaultEditor
     * @return bool false when the editor is unknown or the user may not switch
     */
    public static function setUserEditor( $editor )
    {
        if ( $editor !== '' && !self::isEditor( $editor ) )
            return false;
        if ( !self::switchAllowed() )
            return false;
        $before = self::resolve();
        eZPreferences::setValue( self::PREFERENCE, $editor );
        self::$requestEditor = $editor === '' ? null : $editor;
        if ( class_exists( 'expAudit' ) )
        {
            expAudit::event( 'content.exp_oe_tiptap.editor.change', array(
                'object' => array( 'type' => 'user', 'id' => (int) eZUser::currentUserID() ),
                'before' => array( 'editor' => $before ),
                'after'  => array( 'editor' => self::resolve() ),
                'result' => 'success' ) );
        }
        return true;
    }

    /** Sets the editor of this request only (nothing stored). Null clears it. */
    public static function setRequestEditor( $editor )
    {
        self::$requestEditor = self::isEditor( $editor ) ? $editor : null;
    }

    /** @return string|null */
    public static function requestEditor()
    {
        return self::$requestEditor;
    }

    /**
     * Compares a posted form token with the expected one, in constant time.
     *
     * @param string|null $expected
     * @param mixed       $given
     * @return bool false when either is empty
     */
    public static function tokensMatch( $expected, $given )
    {
        return is_string( $expected ) && $expected !== '' && is_string( $given ) && $given !== ''
            && hash_equals( $expected, $given );
    }

    /** @return string|null the form token of this session (ezformtoken), null when ezformtoken is not installed */
    public static function expectedToken()
    {
        return class_exists( 'ezxFormToken' ) ? ezxFormToken::getToken() : null;
    }

    /**
     * The form token check of the switch view: the field ezxform_token, else the X-CSRF-Token header, against the
     * session's token. Without ezformtoken nothing can be checked and the switch is refused.
     *
     * @param array $post   $_POST
     * @param array $server $_SERVER
     * @param string|null $expected the token of this session, read from ezformtoken when null
     * @return bool
     */
    public static function tokenValid( array $post, array $server, $expected = null )
    {
        if ( $expected === null )
            $expected = self::expectedToken();
        $given = null;
        if ( isset( $post['ezxform_token'] ) )
            $given = $post['ezxform_token'];
        else if ( isset( $server['HTTP_X_CSRF_TOKEN'] ) )
            $given = $server['HTTP_X_CSRF_TOKEN'];
        return self::tokensMatch( $expected, $given );
    }

    /**
     * A redirect target of the switch view, limited to a path on this site (no scheme, no host, no //).
     *
     * @param mixed  $uri
     * @param string $fallback
     * @return string
     */
    public static function localRedirect( $uri, $fallback = '/' )
    {
        if ( !is_string( $uri ) || $uri === '' || $uri[0] !== '/' )
            return $fallback;
        if ( strpos( $uri, '//' ) === 0 || strpos( $uri, '/\\' ) === 0 || preg_match( '/[\x00-\x1f\x7f]/', $uri ) )
            return $fallback;
        return $uri;
    }

    /** @return bool whether the current user has the policy exp_oe_tiptap/<function> (any limitation counts) */
    public static function currentUserHasAccess( $function )
    {
        if ( isset( self::$access[$function] ) )
            return self::$access[$function];
        $allowed = false;
        $user = eZUser::currentUser();
        if ( $user instanceof eZUser )
        {
            $result = $user->hasAccessTo( 'exp_oe_tiptap', $function );
            $allowed = $result['accessWord'] !== 'no';
        }
        self::$access[$function] = $allowed;
        return $allowed;
    }

    /** @return mixed a setting of exp_oe_tiptap.ini, $default when it is not set */
    public static function setting( $block, $name, $default = null )
    {
        $ini = eZINI::instance( self::INI_FILE );
        return $ini->hasVariable( $block, $name ) ? $ini->variable( $block, $name ) : $default;
    }
}
