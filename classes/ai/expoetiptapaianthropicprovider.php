<?php
/**
 * File containing the expOETiptapAIAnthropicProvider class.
 *
 * @copyright Copyright (C) 7x & Exponential Foundation. All rights reserved.
 * @license GNU General Public License v2.0 (or any later version)
 * @package exp_oe_tiptap
 */

/**
 * The Anthropic Messages API: POST {Endpoint} (default https://api.anthropic.com/v1/messages) with the headers
 * x-api-key and anthropic-version and { model, max_tokens, system, messages: [ user ] }; the answer is the
 * text blocks of content[].
 */
class expOETiptapAIAnthropicProvider implements expOETiptapAIProvider
{
    const DEFAULT_ENDPOINT = 'https://api.anthropic.com/v1/messages';
    const DEFAULT_VERSION = '2023-06-01';

    /** @var array */
    protected $settings;

    /** @var expOETiptapAIHttpClient */
    protected $http;

    /**
     * @param array $settings Endpoint, Model, ApiKey, AnthropicVersion, Timeout
     * @param expOETiptapAIHttpClient|null $http
     */
    public function __construct( array $settings, $http = null )
    {
        $this->settings = $settings;
        $this->http = $http ?: new expOETiptapAIHttpClient( isset( $settings['Timeout'] ) ? $settings['Timeout'] : 30 );
    }

    public function modelName()
    {
        return isset( $this->settings['Model'] ) ? (string) $this->settings['Model'] : '';
    }

    public function complete( $system, $user, array $options )
    {
        $endpoint = isset( $this->settings['Endpoint'] ) && trim( (string) $this->settings['Endpoint'] ) !== ''
                  ? trim( (string) $this->settings['Endpoint'] ) : self::DEFAULT_ENDPOINT;
        $key = isset( $this->settings['ApiKey'] ) ? (string) $this->settings['ApiKey'] : '';
        if ( $key === '' )
            throw new expOETiptapAIException( 'The AI assistant is not configured correctly.', 'ApiKey is not set (Anthropic needs one)' );
        if ( $this->modelName() === '' )
            throw new expOETiptapAIException( 'The AI assistant is not configured correctly.', 'Model is not set' );
        $version = isset( $this->settings['AnthropicVersion'] ) && $this->settings['AnthropicVersion'] !== ''
                 ? (string) $this->settings['AnthropicVersion'] : self::DEFAULT_VERSION;

        $payload = array(
            'model' => $this->modelName(),
            'max_tokens' => (int) $options['maxTokens'],
            'system' => (string) $system,
            'messages' => array( array( 'role' => 'user', 'content' => (string) $user ) ),
        );
        if ( isset( $options['temperature'] ) && $options['temperature'] !== null )
            $payload['temperature'] = (float) $options['temperature'];

        $headers = array( 'x-api-key: ' . $key, 'anthropic-version: ' . $version );
        // A key that is not scoped to a workspace (a user key) has to name the workspace on every request
        $workspace = isset( $this->settings['AnthropicWorkspaceId'] ) ? trim( (string) $this->settings['AnthropicWorkspaceId'] ) : '';
        if ( $workspace !== '' )
        {
            if ( !preg_match( '/^[A-Za-z0-9_-]{1,100}$/', $workspace ) )
                throw new expOETiptapAIException( 'The AI assistant is not configured correctly.', 'AnthropicWorkspaceId is not a workspace id' );
            $headers[] = 'anthropic-workspace-id: ' . $workspace;
        }

        $data = $this->http->postJson( $endpoint, $headers, $payload );
        if ( !isset( $data['content'] ) || !is_array( $data['content'] ) )
            throw new expOETiptapAIException( 'The answer of the AI assistant could not be read.', 'no content[] in the answer' );
        $text = '';
        foreach ( $data['content'] as $block )
        {
            if ( is_array( $block ) && isset( $block['type'], $block['text'] ) && $block['type'] === 'text' && is_string( $block['text'] ) )
                $text .= $block['text'];
        }
        if ( $text === '' && isset( $data['stop_reason'] ) && $data['stop_reason'] === 'refusal' )
            throw new expOETiptapAIException( 'The AI assistant declined this request.', 'stop_reason refusal' );
        return $text;
    }
}
