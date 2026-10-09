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
 */
class expOETiptapAIException extends Exception
{
    /** @var string */
    protected $logDetail;

    /**
     * @param string $message   text for the editor
     * @param string $logDetail technical reason for the log (no content, no key)
     * @param int $code         HTTP status of the provider, 0 when there was none
     */
    public function __construct( $message, $logDetail = '', $code = 0 )
    {
        parent::__construct( $message, (int) $code );
        $this->logDetail = (string) $logDetail;
    }

    /** @return string */
    public function getLogDetail()
    {
        return $this->logDetail !== '' ? $this->logDetail : $this->getMessage();
    }
}
