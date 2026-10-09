<?php
/**
 * File containing the expOETiptapAIService class.
 *
 * @copyright Copyright (C) 7x & Exponential Foundation. All rights reserved.
 * @license GNU General Public License v2.0 (or any later version)
 * @package exp_oe_tiptap
 */

/**
 * The AI hooks on the server: checks, limits, prompt, provider call, answer.
 *
 * Independent of the kernel so it can be tested on its own: settings come in as an array
 * (fromINI() reads exp_oe_tiptap.ini [AISettings] and [AICommand_*]), the access facts (request method,
 * tokens, policy) are passed to checkRequest(), errors go to a logger callable. What is logged: command,
 * provider, model, input and output length, duration and the technical reason. Never the text, the
 * answer or the key.
 */
class expOETiptapAIService
{
    const LOG_FILE = 'exp_oe_tiptap_ai.log';

    /** @var array */
    protected $settings;

    /** @var expOETiptapAIProvider|null */
    protected $provider;

    /** @var callable|null function( string $message ) */
    protected $logger;

    /** @var expOETiptapAIPrompts */
    protected $prompts;

    /**
     * @param array $settings [AISettings] values plus 'CommandPrompts' => array( id => prompt )
     * @param expOETiptapAIProvider|null $provider null to create it from the settings when needed
     * @param callable|null $logger
     */
    public function __construct( array $settings, $provider = null, $logger = null )
    {
        $this->settings = array_merge( array(
            'Enabled' => 'false', 'Provider' => 'openai-compatible', 'ProviderClass' => '', 'Endpoint' => '', 'Model' => '',
            'ApiKey' => '', 'Timeout' => 30, 'MaxInputLength' => 20000, 'MaxOutputTokens' => 2000, 'Temperature' => '',
            'Commands' => array_keys( expOETiptapAIPrompts::$builtin ), 'CommandPrompts' => array(),
        ), $settings );
        $this->provider = $provider;
        $this->logger = $logger;
        $this->prompts = new expOETiptapAIPrompts( (array) $this->settings['CommandPrompts'] );
    }

    /**
     * The service with the settings of the current siteaccess. The API key may also come from an environment
     * variable named in ApiKeyEnvironment, so it need not be in any INI file.
     *
     * @return expOETiptapAIService
     */
    public static function fromINI()
    {
        $ini = eZINI::instance( 'exp_oe_tiptap.ini' );
        $settings = $ini->hasGroup( 'AISettings' ) ? $ini->group( 'AISettings' ) : array();
        if ( ( !isset( $settings['ApiKey'] ) || $settings['ApiKey'] === '' ) && !empty( $settings['ApiKeyEnvironment'] ) )
        {
            $fromEnvironment = getenv( (string) $settings['ApiKeyEnvironment'] );
            if ( is_string( $fromEnvironment ) )
                $settings['ApiKey'] = $fromEnvironment;
        }
        $prompts = array();
        foreach ( isset( $settings['Commands'] ) ? (array) $settings['Commands'] : array() as $command )
        {
            if ( $ini->hasVariable( 'AICommand_' . $command, 'Prompt' ) )
                $prompts[$command] = (string) $ini->variable( 'AICommand_' . $command, 'Prompt' );
        }
        $settings['CommandPrompts'] = $prompts;
        return new self( $settings, null, static function ( $message )
        {
            eZDebug::writeError( $message, 'exp_oe_tiptap AI' );
            eZLog::write( $message, self::LOG_FILE );
        } );
    }

    /** @return bool [AISettings] Enabled */
    public function isEnabled()
    {
        return in_array( strtolower( (string) $this->settings['Enabled'] ), array( 'true', 'enabled', '1' ), true );
    }

    /** @return string[] the commands offered, in order */
    public function commands()
    {
        $result = array();
        foreach ( (array) $this->settings['Commands'] as $command )
        {
            $command = (string) $command;
            if ( preg_match( '/^[a-z][a-z0-9_]{0,39}$/', $command ) && $this->prompts->has( $command ) && !in_array( $command, $result, true ) )
                $result[] = $command;
        }
        return $result;
    }

    /**
     * Everything that must hold before a provider is called. Throws with a text for the editor.
     *
     * @param string $method        the request method
     * @param string|null $given    the token of the request (POST ezxform_token or X-CSRF-Token)
     * @param string|null $expected the session's form token, null when ezformtoken is not active
     * @param bool $hasPolicy       the user has exp_oe_tiptap/ai
     * @throws expOETiptapAIException
     */
    public function checkRequest( $method, $given, $expected, $hasPolicy )
    {
        if ( !$this->isEnabled() )
            throw new expOETiptapAIException( 'The AI assistant is switched off.', 'AISettings Enabled=false' );
        if ( !$hasPolicy )
            throw new expOETiptapAIException( 'You are not allowed to use the AI assistant.', 'no policy exp_oe_tiptap/ai' );
        if ( strtoupper( (string) $method ) !== 'POST' )
            throw new expOETiptapAIException( 'The AI assistant is called with POST only.', 'method ' . preg_replace( '/[^A-Z]/', '', strtoupper( (string) $method ) ) );
        if ( $expected !== null && ( !is_string( $given ) || $given === '' || !hash_equals( (string) $expected, $given ) ) )
            throw new expOETiptapAIException( 'The form token is missing or wrong: reload the page and try again.', 'form token mismatch' );
    }

    /**
     * Runs a command. Call checkRequest() first.
     *
     * @param string $command
     * @param string $text
     * @param string $language target language for translate
     * @param string $locale   the editor's locale
     * @param string $format   'text' (default) or 'markup' (the structure keeping markup, see expOETiptapAIPrompts)
     * @param bool $strict     markup: the browser's second try after an answer that lost or invented placeholders
     * @return array( 'text' => string, 'command' => string, 'model' => string )
     * @throws expOETiptapAIException
     */
    public function run( $command, $text, $language = '', $locale = '', $format = 'text', $strict = false )
    {
        $command = (string) $command;
        $text = str_replace( "\0", '', (string) $text );
        if ( !in_array( $command, $this->commands(), true ) )
            throw new expOETiptapAIException( 'Unknown AI command.', 'command not offered: ' . substr( preg_replace( '/[^\w-]/', '?', $command ), 0, 40 ) );
        if ( !preg_match( '//u', $text ) )
            throw new expOETiptapAIException( 'The text could not be read (encoding).', 'input is not UTF-8' );
        $length = function_exists( 'mb_strlen' ) ? mb_strlen( $text, 'UTF-8' ) : strlen( $text );
        $max = max( 1, (int) $this->settings['MaxInputLength'] );
        if ( $length > $max )
            throw new expOETiptapAIException( 'The text is too long for the AI assistant (at most %max characters).', 'input ' . $length . ' > ' . $max, 0, array( '%max' => $max ) );
        if ( trim( $text ) === '' && $command !== 'continue' )
            throw new expOETiptapAIException( 'There is no text to work on.', 'empty input' );
        $language = self::cleanLanguage( $language );
        $locale = self::cleanLanguage( $locale );
        if ( $command === 'translate' && $language === '' )
            throw new expOETiptapAIException( 'Please choose the target language.', 'translate without language' );

        list( $system, $user ) = $this->prompts->build( $command, $text, $language, $locale, expOETiptapAIPrompts::cleanFormat( $format ), (bool) $strict );
        $maxTokens = max( 16, min( 32000, (int) $this->settings['MaxOutputTokens'] ) );
        $temperature = is_numeric( $this->settings['Temperature'] ) ? max( 0.0, min( 2.0, (float) $this->settings['Temperature'] ) ) : null;
        $started = microtime( true );
        $model = '';
        try
        {
            $provider = $this->provider();
            $model = $provider->modelName();
            $answer = expOETiptapAIPrompts::clean( $provider->complete( $system, $user, array( 'maxTokens' => $maxTokens, 'temperature' => $temperature ) ) );
        }
        catch ( expOETiptapAIException $e )
        {
            $this->log( $command, $model, $length, 0, $started, $e->getLogDetail() );
            throw $e;
        }
        catch ( Throwable $e )
        {
            // anything else is a bug or an unexpected library error: its text may carry details, so it is
            // logged by class only and the editor gets a generic message
            $this->log( $command, $model, $length, 0, $started, 'unexpected ' . get_class( $e ) );
            throw new expOETiptapAIException( 'The AI assistant failed. Please try again later.', 'unexpected ' . get_class( $e ) );
        }
        if ( $answer === '' )
        {
            $this->log( $command, $model, $length, 0, $started, 'empty answer' );
            throw new expOETiptapAIException( 'The AI assistant gave no answer. Please try again.', 'empty answer' );
        }
        // an answer is never longer than a generous multiple of what was asked for
        $limit = $maxTokens * 8 + 1000;
        if ( ( function_exists( 'mb_strlen' ) ? mb_strlen( $answer, 'UTF-8' ) : strlen( $answer ) ) > $limit )
            $answer = function_exists( 'mb_substr' ) ? mb_substr( $answer, 0, $limit, 'UTF-8' ) : substr( $answer, 0, $limit );
        return array( 'text' => $answer, 'command' => $command, 'model' => $model );
    }

    /**
     * The configured provider.
     *
     * @return expOETiptapAIProvider
     * @throws expOETiptapAIException
     */
    public function provider()
    {
        if ( $this->provider )
            return $this->provider;
        $name = strtolower( trim( (string) $this->settings['Provider'] ) );
        switch ( $name )
        {
            case 'openai':
            case 'openai-compatible':
                return $this->provider = new expOETiptapAIOpenAIProvider( $this->settings );
            case 'anthropic':
                return $this->provider = new expOETiptapAIAnthropicProvider( $this->settings );
            case 'custom':
                $class = (string) $this->settings['ProviderClass'];
                if ( $class === '' || !preg_match( '/^[A-Za-z_][A-Za-z0-9_\\\\]*$/', $class ) || !class_exists( $class ) ||
                     !in_array( 'expOETiptapAIProvider', class_implements( $class ), true ) )
                    throw new expOETiptapAIException( 'The AI assistant is not configured correctly.', 'ProviderClass missing or not an expOETiptapAIProvider' );
                return $this->provider = new $class( $this->settings );
            case 'tiptap-cloud':
                throw new expOETiptapAIException( 'The AI assistant is not configured correctly.', 'Provider tiptap-cloud is not implemented (owner decision, see doc/ai-hooks.md)' );
            default:
                throw new expOETiptapAIException( 'The AI assistant is not configured correctly.', 'unknown Provider' );
        }
    }

    /** Language names and codes: letters, spaces, hyphen, underscore, parentheses, at most 40 characters */
    public static function cleanLanguage( $value )
    {
        $value = trim( (string) $value );
        if ( $value === '' || !preg_match( '/^[\p{L} _()-]{1,40}$/u', $value ) )
            return '';
        return $value;
    }

    protected function log( $command, $model, $inLength, $outLength, $started, $detail )
    {
        if ( !$this->logger )
            return;
        $message = sprintf( 'AI command=%s provider=%s model=%s in=%d out=%d duration=%.2fs error=%s',
            $command, preg_replace( '/[^\w.-]/', '', (string) $this->settings['Provider'] ), preg_replace( '/[^\w.:\/-]/', '', (string) $model ),
            $inLength, $outLength, microtime( true ) - $started, $detail );
        // belt and braces: never let the key into a log line
        $key = (string) $this->settings['ApiKey'];
        if ( $key !== '' )
            $message = str_replace( $key, '[key]', $message );
        call_user_func( $this->logger, $message );
    }
}
