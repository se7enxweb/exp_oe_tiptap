<?php
/**
 * File containing the expOETiptapAIOpenAIProvider class.
 *
 * @copyright Copyright (C) 7x & Exponential Foundation. All rights reserved.
 * @license GNU General Public License v2.0 (or any later version)
 * @package exp_oe_tiptap
 */

/**
 * Any provider speaking the OpenAI chat completions API: POST {Endpoint} with
 * { model, messages: [ system, user ], max_tokens, temperature }, answer choices[0].message.content.
 * Covers OpenAI, Azure OpenAI (Endpoint with api-version, ApiKeyHeader=api-key), Mistral and self-hosted
 * servers such as Ollama or vLLM (no key needed).
 */
class expOETiptapAIOpenAIProvider implements expOETiptapAIProvider
{
    /** @var array [AISettings] */
    protected $settings;

    /** @var expOETiptapAIHttpClient */
    protected $http;

    /**
     * @param array $settings Endpoint, Model, ApiKey, ApiKeyHeader (Authorization|api-key), Timeout
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
        $endpoint = isset( $this->settings['Endpoint'] ) ? trim( (string) $this->settings['Endpoint'] ) : '';
        if ( $endpoint === '' )
            $endpoint = 'https://api.openai.com/v1/chat/completions';
        if ( $this->modelName() === '' )
            throw new expOETiptapAIException( 'The AI assistant is not configured correctly.', 'Model is not set' );

        $payload = array(
            'model' => $this->modelName(),
            'messages' => array(
                array( 'role' => 'system', 'content' => (string) $system ),
                array( 'role' => 'user', 'content' => (string) $user ),
            ),
            'max_tokens' => (int) $options['maxTokens'],
        );
        if ( isset( $options['temperature'] ) && $options['temperature'] !== null )
            $payload['temperature'] = (float) $options['temperature'];

        $headers = array();
        $key = isset( $this->settings['ApiKey'] ) ? (string) $this->settings['ApiKey'] : '';
        if ( $key !== '' )
        {
            $header = isset( $this->settings['ApiKeyHeader'] ) ? strtolower( trim( (string) $this->settings['ApiKeyHeader'] ) ) : '';
            $headers[] = $header === 'api-key' ? 'api-key: ' . $key : 'Authorization: Bearer ' . $key;
        }

        $data = $this->http->postJson( $endpoint, $headers, $payload );
        if ( !isset( $data['choices'][0]['message']['content'] ) || !is_string( $data['choices'][0]['message']['content'] ) )
            throw new expOETiptapAIException( 'The answer of the AI assistant could not be read.', 'no choices[0].message.content in the answer' );
        return $data['choices'][0]['message']['content'];
    }
}
