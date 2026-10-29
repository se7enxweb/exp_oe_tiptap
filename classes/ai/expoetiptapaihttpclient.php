<?php
/**
 * File containing the expOETiptapAIHttpClient class.
 *
 * @copyright Copyright (C) 1998 - 2026 Exponential Foundation and 7x. All rights reserved.
 * @license GNU General Public License v2.0 (or any later version)
 * @package exp_oe_tiptap
 */

/**
 * JSON POST to an AI provider with curl: https only (plain http only to a loopback host, for a model on the own
 * machine), no redirects, a total timeout, a connect timeout and a
 * limit on the size of the answer. Errors are expOETiptapAIException whose texts never contain the request,
 * the answer or the headers (the API key travels in a header).
 */
class expOETiptapAIHttpClient
{
    /** Longest answer accepted from a provider, in bytes */
    const DEFAULT_MAX_RESPONSE_BYTES = 2097152;

    /** @var int */
    protected $timeout;

    /** @var int */
    protected $maxResponseBytes;

    /**
     * @param int $timeout seconds for the whole request (1 to 300)
     * @param int $maxResponseBytes
     */
    public function __construct( $timeout = 30, $maxResponseBytes = self::DEFAULT_MAX_RESPONSE_BYTES )
    {
        $this->timeout = max( 1, min( 300, (int) $timeout ) );
        $this->maxResponseBytes = max( 1024, (int) $maxResponseBytes );
    }

    /**
     * Why an endpoint is refused: https without user and password; plain http only to a loopback host (127.0.0.0/8,
     * ::1, localhost), where a local model server usually listens without TLS. Anything else would send the text
     * and the key unencrypted over a network.
     *
     * @param mixed $url
     * @return string '' when the endpoint is allowed, else the reason (for the log, without the URL)
     */
    public static function endpointProblem( $url )
    {
        if ( !is_string( $url ) || !preg_match( '~^(https?)://([^\s/?#@]+?)(?::\d+)?(?:[/?#]\S*)?$~iD', $url, $m ) )
            return 'must be https without credentials';
        if ( strtolower( $m[1] ) === 'https' )
            return '';
        if ( self::isLoopbackHost( $m[2] ) )
            return '';
        return 'plain http is only allowed to a loopback host (127.0.0.0/8, ::1, localhost), use https';
    }

    /**
     * @param string $host host part of a URL, an IPv6 address in brackets
     * @return bool localhost, an address of 127.0.0.0/8 or ::1
     */
    public static function isLoopbackHost( $host )
    {
        $host = strtolower( rtrim( (string) $host, '.' ) );
        if ( $host === 'localhost' )
            return true;
        if ( $host === '[::1]' )
            return true;
        if ( filter_var( $host, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4 ) !== false )
            return strpos( $host, '127.' ) === 0;
        return false;
    }

    /**
     * @param string $url
     * @param array $headers list of "Name: value"
     * @param array $payload encoded as JSON
     * @return array decoded JSON answer
     * @throws expOETiptapAIException
     */
    public function postJson( $url, array $headers, array $payload )
    {
        $problem = self::endpointProblem( $url );
        if ( $problem !== '' )
            throw new expOETiptapAIException( 'The AI assistant is not configured correctly.', 'invalid endpoint (' . $problem . ')' );
        if ( !function_exists( 'curl_init' ) )
            throw new expOETiptapAIException( 'The AI assistant is not available on this server.', 'the PHP curl extension is missing' );

        $body = json_encode( $payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE );
        if ( $body === false )
            throw new expOETiptapAIException( 'The text could not be sent to the AI assistant.', 'json_encode failed' );

        $received = '';
        $tooLarge = false;
        $limit = $this->maxResponseBytes;
        $ch = curl_init( $url );
        curl_setopt_array( $ch, array(
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => $body,
            CURLOPT_HTTPHEADER => array_merge( array( 'Content-Type: application/json', 'Accept: application/json' ), $headers ),
            CURLOPT_FOLLOWLOCATION => false,
            CURLOPT_TIMEOUT => $this->timeout,
            CURLOPT_CONNECTTIMEOUT => min( 10, $this->timeout ),
            CURLOPT_NOSIGNAL => true,
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_SSL_VERIFYHOST => 2,
            CURLOPT_USERAGENT => 'Exponential exp_oe_tiptap',
            CURLOPT_WRITEFUNCTION => static function ( $handle, $chunk ) use ( &$received, &$tooLarge, $limit )
            {
                if ( strlen( $received ) + strlen( $chunk ) > $limit )
                {
                    $tooLarge = true;
                    return 0; // aborts the transfer
                }
                $received .= $chunk;
                return strlen( $chunk );
            },
        ) );
        // a model on the own machine: never through a proxy (http_proxy of the environment), text and key stay local
        $host = parse_url( $url, PHP_URL_HOST );
        if ( is_string( $host ) && self::isLoopbackHost( strpos( $host, ':' ) !== false && $host[0] !== '[' ? '[' . $host . ']' : $host ) )
            curl_setopt( $ch, CURLOPT_NOPROXY, '*' );
        if ( defined( 'CURLOPT_PROTOCOLS_STR' ) )
            curl_setopt( $ch, CURLOPT_PROTOCOLS_STR, 'http,https' );
        elseif ( defined( 'CURLOPT_PROTOCOLS' ) )
            curl_setopt( $ch, CURLOPT_PROTOCOLS, CURLPROTO_HTTP | CURLPROTO_HTTPS );

        $ok = curl_exec( $ch );
        $errno = curl_errno( $ch );
        $status = (int) curl_getinfo( $ch, CURLINFO_RESPONSE_CODE );
        if ( PHP_VERSION_ID < 80000 )
            curl_close( $ch );
        unset( $ch );

        if ( $tooLarge )
            throw new expOETiptapAIException( 'The answer of the AI assistant was too long.', 'response larger than ' . $limit . ' bytes', $status );
        if ( $ok === false || $errno )
        {
            if ( $errno === 28 ) // CURLE_OPERATION_TIMEDOUT
                throw new expOETiptapAIException( 'The AI assistant did not answer in time. Please try again.', 'timeout after ' . $this->timeout . ' s' );
            throw new expOETiptapAIException( 'The AI assistant could not be reached.', 'curl error ' . $errno );
        }
        $data = json_decode( $received, true );
        if ( $status < 200 || $status >= 300 )
        {
            $type = is_array( $data ) && isset( $data['error']['type'] ) && is_string( $data['error']['type'] )
                  ? preg_replace( '/[^\w.-]/', '', substr( $data['error']['type'], 0, 60 ) ) : '';
            $message = 'The AI assistant reported an error.';
            if ( $status === 401 || $status === 403 )
                $message = 'The AI assistant refused the request (access). Please tell the administrator.';
            elseif ( $status === 429 )
                $message = 'The AI assistant is busy or over its limit. Please try again later.';
            elseif ( $status === 413 )
                $message = 'The text is too long for the AI assistant.';
            throw new expOETiptapAIException( $message, 'HTTP ' . $status . ( $type !== '' ? ' ' . $type : '' ), $status );
        }
        if ( !is_array( $data ) )
            throw new expOETiptapAIException( 'The answer of the AI assistant could not be read.', 'HTTP ' . $status . ', answer is not JSON', $status );
        return $data;
    }
}
