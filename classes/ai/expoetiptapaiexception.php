<?php
/**
 * File containing the expOETiptapAIException class.
 *
 * @copyright Copyright (C) 7x & Exponential Foundation. All rights reserved.
 * @license GNU General Public License v2.0 (or any later version)
 * @package exp_oe_tiptap
 */

/**
 * An error of the AI hooks whose message may be shown to the editor (ezjscore sends exception messages to
 * the browser as error_text). It never contains the edited text, the API key or the provider's answer.
 * getLogDetail() carries a technical reason for the log, equally free of content and key.
 *
 * The message is English with its placeholders filled in; getText() and getArguments() keep the English
 * text and the placeholders so translatedMessage() can translate it (context extension/exp_oe_tiptap).
 */
class expOETiptapAIException extends Exception
{
    /** @var string */
    protected $logDetail;

    /** @var string the English text with its placeholders (%max ...) */
    protected $text;

    /** @var array placeholder => value */
    protected $arguments;

    /**
     * @param string $message   text for the editor, English, with placeholders such as %max
     * @param string $logDetail technical reason for the log (no content, no key)
     * @param int $code         HTTP status of the provider, 0 when there was none
     * @param array $arguments  placeholder => value, filled into the message
     */
    public function __construct( $message, $logDetail = '', $code = 0, array $arguments = array() )
    {
        $this->text = (string) $message;
        $this->arguments = $arguments;
        parent::__construct( $arguments ? strtr( $this->text, array_map( 'strval', $arguments ) ) : $this->text, (int) $code );
        $this->logDetail = (string) $logDetail;
    }

    /** @return string */
    public function getLogDetail()
    {
        return $this->logDetail !== '' ? $this->logDetail : $this->getMessage();
    }

    /** @return string the English text with its placeholders */
    public function getText()
    {
        return $this->text;
    }

    /** @return array placeholder => value */
    public function getArguments()
    {
        return $this->arguments;
    }

    /** @return string the message in the language of the current siteaccess (English when ezpI18n is not there) */
    public function translatedMessage()
    {
        if ( !class_exists( 'ezpI18n' ) )
            return $this->getMessage();
        return ezpI18n::tr( 'extension/exp_oe_tiptap', $this->text, null, array_map( 'strval', $this->arguments ) );
    }

    /** @return expOETiptapAIException the same error with the translated message, for the browser */
    public function translated()
    {
        return new self( $this->translatedMessage(), $this->getLogDetail(), $this->getCode() );
    }
}
