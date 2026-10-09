<?php
/**
 * File containing the expOETiptapAIProvider interface.
 *
 * @copyright Copyright (C) 7x & Exponential Foundation. All rights reserved.
 * @license GNU General Public License v2.0 (or any later version)
 * @package exp_oe_tiptap
 */

/**
 * A text generation backend of the AI hooks. Implementations: expOETiptapAIOpenAIProvider (any OpenAI compatible
 * chat completions API), expOETiptapAIAnthropicProvider (Anthropic Messages API), or a class of your own named in
 * exp_oe_tiptap.ini [AISettings] ProviderClass (with Provider=custom). The constructor receives the [AISettings]
 * values as an array (keys as in the INI: Endpoint, Model, ApiKey, Timeout, ...).
 */
interface expOETiptapAIProvider
{
    /**
     * @param string $system  instructions (system prompt)
     * @param string $user    the request with the editor's text
     * @param array $options  maxTokens (int), temperature (float|null)
     * @return string the generated text
     * @throws expOETiptapAIException on any failure (message safe for the editor)
     */
    public function complete( $system, $user, array $options );

    /** @return string the model name for the answer and the log ('' when unknown) */
    public function modelName();
}
