<?php
/**
 * File containing the expOETiptapAIExpaiProvider class.
 *
 * @copyright Copyright (C) 1998 - 2026 Exponential Foundation and 7x. All rights reserved.
 * @license GNU General Public License v2.0 (or any later version)
 * @package exp_oe_tiptap
 */

/**
 * The AI commands through the extension expai (Exponential Intelligence), [AISettings] Provider=expai: the request
 * goes to the model expai is set up with, under expai's rules, instead of to a provider of this extension.
 *
 *  - model: [AISettings] ExpaiModel (an expai model alias, or a model id expai knows); empty: the model expai uses for
 *    the current user (the user's allowed choice, else the site default).
 *  - expai's permissions: the user needs expai's policy expai/write (as for every request of expai's panel and field
 *    actions; exp_oe_tiptap/ai alone does not spend expai's models), and may use the model only when expai allows it
 *    to the user (expAiConfig::mayUseModel(): the site default, and with model choice on the models of
 *    ProvidersWithoutPolicy[] and of the providers expai/model_use allows), for ExpaiModel as for the effective model.
 *  - expai's master switch ([AISettings] Enabled, DisabledSiteAccesses[] of expai.ini) is checked first, and expai's
 *    veto hook, limits and usage log apply to every request (expAiUsageRecorder, action tiptap:<command>).
 *  - expai's data policy decides for the content object of the edited field whether its text may go to the model's
 *    provider; the server function passes the object (setRequestContext()). Without an object an active data policy
 *    refuses the request, since it cannot decide.
 *  - the request is expai's (Anthropic Messages API shaped): system, one user message, max_tokens. The answer's text
 *    blocks are joined and the reasoning of reasoning models is removed (expAiText::stripReasoning()).
 *
 * The API keys, endpoints and time limits are expai's; the Endpoint, ApiKey, Temperature and Timeout of
 * exp_oe_tiptap.ini do not apply. expai must be active (ActiveExtensions) and installed, else every request fails
 * with a configuration error.
 */
class expOETiptapAIExpaiProvider implements expOETiptapAIProvider
{
    /** The prefix of the usage log action: tiptap:improve, tiptap:translate ... */
    const ACTION_PREFIX = 'tiptap:';

    /** @var array [AISettings] values */
    protected $settings;

    /** @var expAiConfig|null */
    protected $config;

    /** @var array command, object_id, attribute_id, version, language */
    protected $context = array();

    /** @var string|null the model alias, once resolved */
    protected $alias = null;

    /**
     * @param array $settings [AISettings] values (ExpaiModel)
     * @param expAiConfig|null $config expai's settings (default: expAiConfig::instance())
     */
    public function __construct( array $settings, $config = null )
    {
        $this->settings = $settings;
        $this->config = $config;
    }

    /**
     * Whether expai can be used: it is in ActiveExtensions and its classes are there.
     *
     * @param array|null $activeExtensions eZExtension::activeExtensions() when null
     * @return bool
     */
    public static function available( ?array $activeExtensions = null )
    {
        if ( $activeExtensions === null )
            $activeExtensions = class_exists( 'eZExtension' ) ? eZExtension::activeExtensions() : array();
        return in_array( 'expai', $activeExtensions, true ) && class_exists( 'expAiConfig' ) && class_exists( 'expAiUsageRecorder' );
    }

    /**
     * Whether expai's data policy has rules ([DataPolicy] of expai.ini). Then it decides on the object of the edited
     * field, and a request that names none is refused.
     *
     * @param expAiConfig|null $config
     * @return bool false when expai is not there
     */
    public static function dataPolicyActive( $config = null )
    {
        if ( !class_exists( 'expAiDataPolicy' ) || !class_exists( 'expAiConfig' ) )
            return false;
        return ( new expAiDataPolicy( $config ?: expAiConfig::instance(), array() ) )->active();
    }

    /**
     * What the request is about, for the usage log and the data policy.
     *
     * @param array $context command (string), object_id (int, the content object of the edited field), attribute_id,
     *                       version (int), language (string)
     */
    public function setRequestContext( array $context )
    {
        $this->context = $context + $this->context;
    }

    public function modelName()
    {
        if ( !$this->isAvailable() )
            return '';
        try
        {
            $model = $this->config()->registry()->getModel( $this->alias() );
            return $model ? (string) $model['id'] : '';
        }
        catch ( Exception $e )
        {
            return '';
        }
    }

    public function complete( $system, $user, array $options )
    {
        if ( !$this->isAvailable() )
            throw new expOETiptapAIException( 'The AI assistant is not configured correctly.', 'Provider=expai, but the extension expai is not active or not installed' );
        $config = $this->config();
        try
        {
            // the master switch before anything else: a clear answer, and nothing is looked up for a request that cannot go out
            $off = expAiGate::switchedOff( $config );
            if ( $off !== '' )
                throw new expAiException( $off, 'expai master switch' );
            if ( !$this->hasExpaiPolicy() )
                throw new expOETiptapAIException( 'You do not have access to Exponential Intelligence.', 'no policy expai/write' );
            $alias = $this->alias();
            if ( !$this->mayUseModel( $config, $alias ) )
                throw new expOETiptapAIException( 'You may not use the model of the AI assistant.', 'expai does not allow the model ' . preg_replace( '/[^\w.:-]/', '', $alias ) . ' to this user' );
            if ( class_exists( 'expAiWebBudget' ) )
                expAiWebBudget::assertFits( $alias, 'field', $config );
            $provider = $this->providerFor( $config, $alias );
            $object = $this->contentObject();
            $this->checkDataPolicy( $config, $provider->providerId(), $object );
            $recorder = $this->recorder( $provider, array(
                'node_id' => $object ? $this->mainNodeID( $object ) : 0,
                'action' => self::action( isset( $this->context['command'] ) ? $this->context['command'] : '' ),
            ) );
            $answer = $recorder->send( self::request( $system, $user, $options ) );
        }
        catch ( expAiException $e )
        {
            throw self::fromExpai( $e );
        }
        return self::answerText( $answer );
    }

    /**
     * The usage log action of a command.
     *
     * @param string $command
     * @return string tiptap:<command>
     */
    public static function action( $command )
    {
        $command = preg_replace( '/[^a-z0-9_]/', '', strtolower( (string) $command ) );
        return self::ACTION_PREFIX . ( $command !== '' ? substr( $command, 0, 40 ) : 'unknown' );
    }

    /**
     * The extension's request as expai's request (the shape of the Anthropic Messages API). Temperature is left out:
     * the model's settings in expai decide.
     *
     * @param string $system
     * @param string $user
     * @param array $options maxTokens
     * @return array system, messages, max_tokens
     */
    public static function request( $system, $user, array $options )
    {
        return array(
            'system' => (string) $system,
            'messages' => array( array( 'role' => 'user', 'content' => (string) $user ) ),
            'max_tokens' => max( 16, (int) ( isset( $options['maxTokens'] ) ? $options['maxTokens'] : 2000 ) ),
        );
    }

    /**
     * The text of expai's answer: its text blocks joined, without the reasoning of a reasoning model.
     *
     * @param mixed $answer
     * @return string
     * @throws expOETiptapAIException
     */
    public static function answerText( $answer )
    {
        if ( !is_array( $answer ) || !isset( $answer['content'] ) || !is_array( $answer['content'] ) )
            throw new expOETiptapAIException( 'The answer of the AI assistant could not be read.', 'expai: no content[] in the answer' );
        $text = '';
        foreach ( $answer['content'] as $block )
        {
            if ( is_array( $block ) && isset( $block['type'], $block['text'] ) && $block['type'] === 'text' && is_string( $block['text'] ) )
                $text .= $block['text'];
        }
        if ( class_exists( 'expAiText' ) && method_exists( 'expAiText', 'stripReasoning' ) )
            $text = expAiText::stripReasoning( $text );
        if ( trim( $text ) === '' && isset( $answer['stop_reason'] ) && $answer['stop_reason'] === 'refusal' )
            throw new expOETiptapAIException( 'The AI assistant declined this request.', 'expai: stop_reason refusal' );
        // a cut answer would replace the editor's text with half of it
        if ( isset( $answer['stop_reason'] ) && $answer['stop_reason'] === 'max_tokens' )
            throw new expOETiptapAIException( 'The answer was cut off at the token limit. Select less text, or ask the administrator to raise the limit.', 'expai: stop_reason max_tokens' );
        return $text;
    }

    /**
     * An error of expai as an error of the editor: expai's message is meant for editors (switched off, refused by the
     * veto, over a limit, not allowed by the data policy ...); it is translated in expai's context with its
     * placeholders filled in. The log gets the class, the status and a cleaned, short detail, never more.
     *
     * @return expOETiptapAIException
     */
    public static function fromExpai( Exception $e )
    {
        $arguments = method_exists( $e, 'arguments' ) ? array_map( 'strval', (array) $e->arguments() ) : array();
        $message = class_exists( 'ezpI18n' ) && method_exists( $e, 'translatedMessage' ) ? (string) $e->translatedMessage() : strtr( $e->getMessage(), $arguments );
        $detail = method_exists( $e, 'detail' ) ? (string) $e->detail() : '';
        $detail = substr( preg_replace( '/[^\w .:()\/=-]/', '', $detail ), 0, 120 );
        return new expOETiptapAIException( $message, 'expai ' . get_class( $e ) . ( $e->getCode() ? ' HTTP ' . (int) $e->getCode() : '' )
                                           . ( $detail !== '' ? ': ' . $detail : '' ), (int) $e->getCode() );
    }

    /**
     * The model alias of the requests: ExpaiModel, else the model expai uses for the current user.
     *
     * @return string
     * @throws expOETiptapAIException|expAiException
     */
    protected function alias()
    {
        if ( $this->alias !== null )
            return $this->alias;
        $config = $this->config();
        $wanted = isset( $this->settings['ExpaiModel'] ) ? trim( (string) $this->settings['ExpaiModel'] ) : '';
        if ( $wanted === '' )
            $alias = $this->effectiveAlias( $config );
        else
        {
            $alias = $config->registry()->resolveAlias( $wanted );
            if ( $alias === '' )
                throw new expOETiptapAIException( 'The AI assistant is not configured correctly.', 'ExpaiModel is not a model of expai' );
        }
        if ( $alias === '' )
            throw new expOETiptapAIException( 'The AI assistant is not configured correctly.', 'expai has no model' );
        return $this->alias = $alias;
    }

    /** @return bool expai is active and installed */
    protected function isAvailable()
    {
        return self::available();
    }

    /** @return expAiConfig */
    protected function config()
    {
        if ( !$this->config )
            $this->config = expAiConfig::instance();
        return $this->config;
    }

    /** @return bool the current user has expai's policy expai/write (it has no limitations; any access counts) */
    protected function hasExpaiPolicy()
    {
        // as expAiServerFunctions::hasPolicy( 'write' ): a registered user, any access word but no
        $user = $this->currentUser();
        if ( !$user instanceof eZUser || !$user->isRegistered() )
            return false;
        $access = $user->hasAccessTo( 'expai', 'write' );
        return isset( $access['accessWord'] ) && $access['accessWord'] !== 'no';
    }

    /** @return eZUser|null */
    protected function currentUser()
    {
        return eZUser::currentUser();
    }

    /** @return bool expai lets the current user use the model (expai/model_use, ProvidersWithoutPolicy[], model choice) */
    protected function mayUseModel( expAiConfig $config, $alias )
    {
        return (bool) $config->mayUseModel( $alias );
    }

    /** @return string the model expai uses for the current user (the user's allowed choice, else the site default) */
    protected function effectiveAlias( expAiConfig $config )
    {
        return $config->effectiveModel();
    }

    /** @return expAiProvider the provider object of the model */
    protected function providerFor( expAiConfig $config, $alias )
    {
        return $config->registry()->providerFor( $alias );
    }

    /** @return eZContentObject|null the content object of the edited field, null when the request names none */
    protected function contentObject()
    {
        $id = isset( $this->context['object_id'] ) ? (int) $this->context['object_id'] : 0;
        if ( $id <= 0 )
            return null;
        $object = eZContentObject::fetch( $id );
        if ( !$object instanceof eZContentObject )
            throw new expOETiptapAIException( 'The content of this field could not be found.', 'object ' . $id . ' not found' );
        return $object;
    }

    /** @return int the main node of the object, 0 for an object without one (a new draft) */
    protected function mainNodeID( $object )
    {
        $main = $object->mainNode();
        return $main ? (int) $main->attribute( 'node_id' ) : 0;
    }

    /**
     * expai's data policy: may the text of this object go to this provider? Without an object an active policy
     * cannot decide and refuses.
     *
     * @param eZContentObject|null $object
     * @throws expAiException|expOETiptapAIException
     */
    protected function checkDataPolicy( expAiConfig $config, $providerID, $object )
    {
        $policy = expAiDataPolicy::forProvider( $config, $providerID );
        if ( $object )
            $policy->assertObject( $object );
        elseif ( $policy->active() )
            throw new expOETiptapAIException( 'This text cannot be sent: the data policy needs to know which content it belongs to.', 'expai data policy active, no object in the request' );
    }

    /** @return expAiProvider the provider wrapped in expai's usage recorder (veto hook, limits, usage log) */
    protected function recorder( expAiProvider $provider, array $context )
    {
        return new expAiUsageRecorder( $provider, $context );
    }
}
