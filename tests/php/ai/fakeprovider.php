<?php
/**
 * A fake AI provider for the tests: router script for "php -S 127.0.0.1:<port> fakeprovider.php".
 * No real model, no network beyond 127.0.0.1. Every request is appended as one JSON line to the file named
 * by the environment variable FAKE_AI_LOG (method, path, the auth headers, the decoded body).
 *
 *   /v1/chat/completions   OpenAI chat completions answer: "REPLY(<model>): <last 40 characters of the user message>"
 *   /v1/messages           Anthropic Messages answer, same text
 *   /fenced                OpenAI answer wrapped in a Markdown code fence
 *   /slow                  sleeps 3 seconds first
 *   /error401              401 with an error body that echoes the Authorization header
 *   /error500              500
 *   /huge                  a 3 MB answer
 *   /notjson               plain text
 *   /refusal               Anthropic answer with stop_reason refusal and no text
 *   /redirect              302 to /v1/chat/completions (must not be followed)
 *
 * @license GNU General Public License v2.0 (or any later version)
 */

$path = parse_url( $_SERVER['REQUEST_URI'], PHP_URL_PATH );
$raw = file_get_contents( 'php://input' );
$body = json_decode( $raw, true );
$log = getenv( 'FAKE_AI_LOG' );
if ( $log )
{
    file_put_contents( $log, json_encode( array(
        'method' => $_SERVER['REQUEST_METHOD'],
        'path' => $path,
        'authorization' => isset( $_SERVER['HTTP_AUTHORIZATION'] ) ? $_SERVER['HTTP_AUTHORIZATION'] : null,
        'x-api-key' => isset( $_SERVER['HTTP_X_API_KEY'] ) ? $_SERVER['HTTP_X_API_KEY'] : null,
        'api-key' => isset( $_SERVER['HTTP_API_KEY'] ) ? $_SERVER['HTTP_API_KEY'] : null,
        'anthropic-version' => isset( $_SERVER['HTTP_ANTHROPIC_VERSION'] ) ? $_SERVER['HTTP_ANTHROPIC_VERSION'] : null,
        'body' => $body,
    ) ) . "\n", FILE_APPEND | LOCK_EX );
}

header( 'Content-Type: application/json' );
$model = is_array( $body ) && isset( $body['model'] ) ? $body['model'] : '?';
$user = '';
if ( is_array( $body ) && isset( $body['messages'] ) )
{
    foreach ( $body['messages'] as $m )
    {
        if ( $m['role'] === 'user' )
            $user = $m['content'];
    }
}
$reply = 'REPLY(' . $model . '): ' . substr( preg_replace( '/\s+/', ' ', $user ), -40 );

switch ( $path )
{
    case '/slow':
        sleep( 3 );
        // no break
    case '/v1/chat/completions':
        echo json_encode( array( 'id' => 'x', 'choices' => array( array( 'index' => 0, 'message' => array( 'role' => 'assistant', 'content' => $reply ) ) ) ) );
        break;
    case '/fenced':
        echo json_encode( array( 'choices' => array( array( 'message' => array( 'content' => "```text\nClean answer\n```" ) ) ) ) );
        break;
    case '/v1/messages':
        echo json_encode( array( 'type' => 'message', 'content' => array( array( 'type' => 'text', 'text' => $reply ) ), 'stop_reason' => 'end_turn' ) );
        break;
    case '/refusal':
        echo json_encode( array( 'type' => 'message', 'content' => array(), 'stop_reason' => 'refusal' ) );
        break;
    case '/error401':
        http_response_code( 401 );
        echo json_encode( array( 'error' => array( 'type' => 'invalid_api_key', 'message' => 'Bad key ' . ( isset( $_SERVER['HTTP_AUTHORIZATION'] ) ? $_SERVER['HTTP_AUTHORIZATION'] : '' ) ) ) );
        break;
    case '/error500':
        http_response_code( 500 );
        echo json_encode( array( 'error' => array( 'type' => 'server_error', 'message' => 'Echo: ' . $user ) ) );
        break;
    case '/huge':
        echo json_encode( array( 'choices' => array( array( 'message' => array( 'content' => str_repeat( 'x', 3 * 1024 * 1024 ) ) ) ) ) );
        break;
    case '/notjson':
        header( 'Content-Type: text/plain' );
        echo 'this is not json';
        break;
    case '/redirect':
        header( 'Location: /v1/chat/completions', true, 302 );
        break;
    default:
        http_response_code( 404 );
        echo '{}';
}
