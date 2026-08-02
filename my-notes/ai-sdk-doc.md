https://vercel.com/blog/ai-sdk-6
https://ai-sdk.dev/docs/introduction
https://ai-sdk.dev/tools-registry

# `useChat()`

Allows you to easily create a conversational user interface for your chatbot application. It enables the streaming of chat messages from your AI provider, manages the chat state, and updates the UI automatically as new messages are received.

<Note>
  The `useChat` API has been significantly updated in AI SDK 5.0. It now uses a
  transport-based architecture and no longer manages input state internally. See
  the [migration
  guide](/docs/migration-guides/migration-guide-5-0#usechat-changes) for
  details.
</Note>

## Import

<Tabs items={['React', 'Svelte', 'Vue', 'Angular']}>
<Tab>
<Snippet
      text="import { useChat } from '@ai-sdk/react'"
      dark
      prompt={false}
    />
</Tab>
<Tab>
<Snippet text="import { Chat } from '@ai-sdk/svelte'" dark prompt={false} />
</Tab>
<Tab>
<Snippet text="import { Chat } from '@ai-sdk/vue'" dark prompt={false} />
</Tab>
<Tab>
<Snippet
      text="import { Chat } from '@ai-sdk/angular'"
      dark
      prompt={false}
    />
</Tab>
</Tabs>

## API Signature

### Parameters

<PropertiesTable
content={[
{
name: 'chat',
type: 'Chat<UIMessage>',
isOptional: true,
description:
'An existing Chat instance to use. If provided, other parameters are ignored.',
},
{
name: 'transport',
type: 'ChatTransport',
isOptional: true,
description:
'The transport to use for sending messages. Defaults to DefaultChatTransport with `/api/chat` endpoint.',
properties: [
{
type: 'DefaultChatTransport',
parameters: [
{
name: 'api',
type: "string = '/api/chat'",
isOptional: true,
description: 'The API endpoint for chat requests.',
},
{
name: 'credentials',
type: 'RequestCredentials',
isOptional: true,
description: 'The credentials mode for fetch requests.',
},
{
name: 'headers',
type: 'Record<string, string> | Headers',
isOptional: true,
description: 'HTTP headers to send with requests.',
},
{
name: 'body',
type: 'object',
isOptional: true,
description: 'Extra body object to send with requests.',
},
{
name: 'fetch',
type: 'FetchFunction',
isOptional: true,
description:
'Custom fetch implementation. You can use it as a middleware to intercept requests, or to provide a custom fetch implementation for e.g. testing.',
},
{
name: 'prepareSendMessagesRequest',
type: 'PrepareSendMessagesRequest',
isOptional: true,
description:
'A function to customize the request before chat API calls.',
properties: [
{
type: 'PrepareSendMessagesRequest',
parameters: [
{
name: 'options',
type: 'PrepareSendMessageRequestOptions',
description: 'Options for preparing the request',
properties: [
{
type: 'PrepareSendMessageRequestOptions',
parameters: [
{
name: 'id',
type: 'string',
description: 'The chat ID',
},
{
name: 'messages',
type: 'UIMessage[]',
description: 'Current messages in the chat',
},
{
name: 'requestMetadata',
type: 'unknown',
description: 'The request metadata',
},
{
name: 'body',
type: 'Record<string, any> | undefined',
description: 'The request body',
},
{
name: 'credentials',
type: 'RequestCredentials | undefined',
description: 'The request credentials',
},
{
name: 'headers',
type: 'HeadersInit | undefined',
description: 'The request headers',
},
{
name: 'api',
type: 'string',
description: `The API endpoint to use for the request. If not specified, it defaults to the transport’s API endpoint: /api/chat.`,
},
{
name: 'trigger',
type: "'submit-message' | 'regenerate-message'",
description: 'The trigger for the request',
},
{
name: 'messageId',
type: 'string | undefined',
description: 'The message ID if applicable',
},
],
},
],
},
],
},
],
},
{
name: 'prepareReconnectToStreamRequest',
type: 'PrepareReconnectToStreamRequest',
isOptional: true,
description:
'A function to customize the request before reconnect API call.',
properties: [
{
type: 'PrepareReconnectToStreamRequest',
parameters: [
{
name: 'options',
type: 'PrepareReconnectToStreamRequestOptions',
description:
'Options for preparing the reconnect request',
properties: [
{
type: 'PrepareReconnectToStreamRequestOptions',
parameters: [
{
name: 'id',
type: 'string',
description: 'The chat ID',
},
{
name: 'requestMetadata',
type: 'unknown',
description: 'The request metadata',
},
{
name: 'body',
type: 'Record<string, any> | undefined',
description: 'The request body',
},
{
name: 'credentials',
type: 'RequestCredentials | undefined',
description: 'The request credentials',
},
{
name: 'headers',
type: 'HeadersInit | undefined',
description: 'The request headers',
},
{
name: 'api',
type: 'string',
description: `The API endpoint to use for the request. If not specified, it defaults to the transport’s API endpoint combined with the chat ID: /api/chat/{chatId}/stream.`,
},
],
},
],
},
],
},
],
},
],
},
],
},
{
name: 'id',
type: 'string',
isOptional: true,
description:
'A unique identifier for the chat. If not provided, a random one will be generated.',
},
{
name: 'messages',
type: 'UIMessage[]',
isOptional: true,
description: 'Initial chat messages to populate the conversation with.',
},
{
name: 'messageMetadataSchema',
type: 'FlexibleSchema',
isOptional: true,
description: 'Schema for validating message metadata.',
},
{
name: 'dataPartSchemas',
type: 'UIDataTypesToSchemas',
isOptional: true,
description: 'Schemas for validating data parts in messages.',
},
{
name: 'generateId',
type: 'IdGenerator',
isOptional: true,
description:
'A function to generate unique IDs for messages and the chat. If not provided, the default AI SDK generateId is used.',
},
{
name: 'onToolCall',
type: '({toolCall: ToolCall}) => void | Promise<void>',
isOptional: true,
description:
'Optional callback function that is invoked when a tool call is received. You must call addToolOutput to provide the tool result.',
},
{
name: 'sendAutomaticallyWhen',
type: '(options: { messages: UIMessage[] }) => boolean | PromiseLike<boolean>',
isOptional: true,
description:
'When provided, this function will be called when the stream is finished or a tool call is added to determine if the current messages should be resubmitted. You can use the lastAssistantMessageIsCompleteWithToolCalls helper for common scenarios.',
},
{
name: 'onFinish',
type: '(options: OnFinishOptions) => void',
isOptional: true,
description: 'Called when the assistant response has finished streaming.',
properties: [
{
type: 'OnFinishOptions',
parameters: [
{
name: 'message',
type: 'UIMessage',
description: 'The response message.',
},
{
name: 'messages',
type: 'UIMessage[]',
description: 'All messages including the response message',
},
{
name: 'isAbort',
type: 'boolean',
description:
'True when the request has been aborted by the client.',
},
{
name: 'isDisconnect',
type: 'boolean',
description:
'True if the server has been disconnected, e.g. because of a network error.',
},
{
name: 'isError',
type: 'boolean',
description: `True if errors during streaming caused the response to stop early.`,
},
{
name: 'finishReason',
type: "'stop' | 'length' | 'content-filter' | 'tool-calls' | 'error' | 'other'",
isOptional: true,
description:
'The reason why the model finished generating the response. Undefined if the finish reason was not provided by the model.',
},
],
},
],
},
{
name: 'onError',
type: '(error: Error) => void',
isOptional: true,
description:
'Callback function to be called when an error is encountered.',
},
{
name: 'onData',
type: '(dataPart: DataUIPart) => void',
isOptional: true,
description:
'Optional callback function that is called when a data part is received.',
},
{
name: 'experimental_throttle',
type: 'number',
isOptional: true,
description:
'Custom throttle wait in ms for the chat messages and data updates. Default is undefined, which disables throttling.',
},
{
name: 'resume',
type: 'boolean',
isOptional: true,
description:
'Whether to resume an ongoing chat generation stream. Defaults to false.',
},
]}
/>

### Returns

<PropertiesTable
content={[
{
name: 'id',
type: 'string',
description: 'The id of the chat.',
},
{
name: 'messages',
type: 'UIMessage[]',
description: 'The current array of chat messages.',
properties: [
{
type: 'UIMessage',
parameters: [
{
name: 'id',
type: 'string',
description: 'A unique identifier for the message.',
},
{
name: 'role',
type: "'system' | 'user' | 'assistant'",
description: 'The role of the message.',
},
{
name: 'parts',
type: 'UIMessagePart[]',
description:
'The parts of the message. Use this for rendering the message in the UI.',
},
{
name: 'metadata',
type: 'unknown',
isOptional: true,
description: 'The metadata of the message.',
},
],
},
],
},
{
name: 'status',
type: "'submitted' | 'streaming' | 'ready' | 'error'",
description:
'The current status of the chat: "ready" (idle), "submitted" (request sent), "streaming" (receiving response), or "error" (request failed).',
},
{
name: 'error',
type: 'Error | undefined',
description: 'The error object if an error occurred.',
},
{
name: 'sendMessage',
type: '(message?: { text: string; files?: FileList | FileUIPart[]; metadata?; messageId?: string } | CreateUIMessage, options?: ChatRequestOptions) => Promise<void>',
description:
'Function to send a new message to the chat. This will trigger an API call to generate the assistant response. If a messageId is provided, the message will be replaced (useful for editing). If no message is provided, resubmits the current messages (useful after adding tool outputs).',
properties: [
{
type: 'ChatRequestOptions',
parameters: [
{
name: 'headers',
type: 'Record<string, string> | Headers',
isOptional: true,
description:
'Additional headers that should be to be passed to the API endpoint.',
},
{
name: 'body',
type: 'object',
isOptional: true,
description:
'Additional body JSON properties that should be sent to the API endpoint.',
},
{
name: 'metadata',
type: 'unknown',
isOptional: true,
description: 'Additional data to be sent to the API endpoint.',
},
],
},
],
},
{
name: 'regenerate',
type: '(options?: { messageId?: string } & ChatRequestOptions) => Promise<void>',
description:
'Function to regenerate the last assistant message or a specific message. If no messageId is provided, regenerates the last assistant message. Accepts ChatRequestOptions for headers, body, and metadata.',
},
{
name: 'stop',
type: '() => void',
description:
'Function to abort the current streaming response from the assistant.',
},
{
name: 'clearError',
type: '() => void',
description: 'Clears the error state.',
},
{
name: 'resumeStream',
type: '() => void',
description:
'Function to resume an interrupted streaming response. Useful when a network error occurs during streaming.',
},
{
name: 'addToolOutput',
type: '(options: { tool: string; toolCallId: string; output: unknown } | { tool: string; toolCallId: string; state: "output-error", errorText: string }) => void',
description:
'Function to add a tool result to the chat. This will update the chat messages with the tool result. If sendAutomaticallyWhen is configured, it may trigger an automatic submission.',
},
{
name: 'addToolApprovalResponse',
type: '(options: { id: string; approved: boolean; reason?: string }) => void | PromiseLike<void>',
description:
'Function to respond to a tool approval request. The id should match the approval id from the tool call. If sendAutomaticallyWhen is configured, it may trigger an automatic submission.',
},
{
name: 'addToolResult',
type: '(options: { tool: string; toolCallId: string; output: unknown } | { tool: string; toolCallId: string; state: "output-error", errorText: string }) => void',
description: 'Deprecated. Use addToolOutput instead.',
},
{
name: 'setMessages',
type: '(messages: UIMessage[] | ((messages: UIMessage[]) => UIMessage[])) => void',
description:
'Function to update the messages state locally without triggering an API call. Useful for optimistic updates.',
},
]}
/>

---

# `useCompletion()`

Allows you to create text completion based capabilities for your application. It enables the streaming of text completions from your AI provider, manages the state for chat input, and updates the UI automatically as new messages are received.

## Import

<Tabs items={['React', 'Svelte', 'Vue', 'Angular']}>
<Tab>
<Snippet
      text="import { useCompletion } from '@ai-sdk/react'"
      dark
      prompt={false}
    />
</Tab>
<Tab>
<Snippet
      text="import { Completion } from '@ai-sdk/svelte'"
      dark
      prompt={false}
    />
</Tab>
<Tab>
<Snippet
      text="import { useCompletion } from '@ai-sdk/vue'"
      dark
      prompt={false}
    />
</Tab>
<Tab>
<Snippet
      text="import { Completion } from '@ai-sdk/angular'"
      dark
      prompt={false}
    />
</Tab>
</Tabs>

## API Signature

### Parameters

<PropertiesTable
content={[
{
name: 'api',
type: "string = '/api/completion'",
description:
'The API endpoint that is called to generate text. It can be a relative path (starting with `/`) or an absolute URL.',
},
{
name: 'id',
type: 'string',
description:
'A unique identifier for the completion. If not provided, a random one will be generated. When provided, the `useCompletion` hook with the same `id` will have shared states across components. This is useful when you have multiple components showing the same chat stream',
},
{
name: 'initialInput',
type: 'string',
description: 'An optional string for the initial prompt input.',
},
{
name: 'initialCompletion',
type: 'string',
description: 'An optional string for the initial completion result.',
},
{
name: 'onFinish',
type: '(prompt: string, completion: string) => void',
description:
'An optional callback function that is called when the completion stream ends.',
},
{
name: 'onError',
type: '(error: Error) => void',
description:
'An optional callback that will be called when the chat stream encounters an error.',
},
{
name: 'headers',
type: 'Record<string, string> | Headers',
description:
'An optional object of headers to be passed to the API endpoint.',
},
{
name: 'body',
type: 'object',
description:
'An optional, additional body object to be passed to the API endpoint.',
},
{
name: 'credentials',
type: "'omit' | 'same-origin' | 'include'",
description:
'An optional literal that sets the mode of credentials to be used on the request. Defaults to same-origin.',
},
{
name: 'streamProtocol',
type: "'text' | 'data'",
isOptional: true,
description:
'An optional literal that sets the type of stream to be used. Defaults to `data`. If set to `text`, the stream will be treated as a text stream.',
},
{
name: 'fetch',
type: 'FetchFunction',
isOptional: true,
description:
'Optional. A custom fetch function to be used for the API call. Defaults to the global fetch function.',
},
{
name: 'experimental_throttle',
type: 'number',
isOptional: true,
description:
'React only. Custom throttle wait time in milliseconds for the completion and data updates. When specified, throttles how often the UI updates during streaming. Default is undefined, which disables throttling.',
},

]}
/>

### Returns

<PropertiesTable
content={[
{
name: 'completion',
type: 'string',
description: 'The current text completion.',
},
{
name: 'complete',
type: '(prompt: string, options?: { headers?: Record<string, string> | Headers, body?: object }) => Promise<string | null | undefined>',
description:
'Function to execute text completion based on the provided prompt. Returns the completion result when finished.',
},
{
name: 'error',
type: 'undefined | Error',
description: 'The error thrown during the completion process, if any.',
},
{
name: 'setCompletion',
type: '(completion: string) => void',
description: 'Function to update the `completion` state.',
},
{
name: 'stop',
type: '() => void',
description: 'Function to abort the current API request.',
},
{
name: 'input',
type: 'string',
description: 'The current value of the input field.',
},
{
name: 'setInput',
type: 'React.Dispatch<React.SetStateAction<string>>',
description: 'Function to update the input value.',
},
{
name: 'handleInputChange',
type: '(event: any) => void',
description:
"Handler for the `onChange` event of the input field to control the input's value.",
},
{
name: 'handleSubmit',
type: '(event?: { preventDefault?: () => void }) => void',
description:
'Form submission handler that automatically resets the input field and appends a user message.',
},
{
name: 'isLoading',
type: 'boolean',
description:
'Boolean flag indicating whether a fetch operation is currently in progress.',
},
]}
/>

---

# `experimental_useObject()`

<Note>
  `useObject` is an experimental feature and only available in React, Svelte,
  and Vue.
</Note>

Allows you to consume text streams that represent a JSON object and parse them into a complete object based on a schema.
You can use it together with [`streamText`](/docs/reference/ai-sdk-core/stream-text) and [`Output.object()`](/docs/reference/ai-sdk-core/output#output-object) in the backend.

```tsx
'use client';

import { experimental_useObject as useObject } from '@ai-sdk/react';

export default function Page() {
  const { object, submit } = useObject({
    api: '/api/use-object',
    schema: z.object({ content: z.string() }),
  });

  return (
    <div>
      <button onClick={() => submit('example input')}>Generate</button>
      {object?.content && <p>{object.content}</p>}
    </div>
  );
}
```

## Import

<Tabs items={['React', 'Svelte', 'Vue']}>
<Tab>
<Snippet
      text="import { experimental_useObject as useObject } from '@ai-sdk/react'"
      dark
      prompt={false}
    />
</Tab>
<Tab>
<Snippet
      text="import { Experimental_StructuredObject } from '@ai-sdk/svelte'"
      dark
      prompt={false}
    />
</Tab>
<Tab>
<Snippet
      text="import { experimental_useObject } from '@ai-sdk/vue'"
      dark
      prompt={false}
    />
</Tab>
</Tabs>

## API Signature

### Parameters

<PropertiesTable
content={[
{
name: 'api',
type: 'string',
description:
'The API endpoint that is called to generate objects. It should stream JSON that matches the schema as chunked text. It can be a relative path (starting with `/`) or an absolute URL.',
},
{
name: 'schema',
type: 'Zod Schema | JSON Schema',
description:
'A schema that defines the shape of the complete object. You can either pass in a Zod schema or a JSON schema (using the `jsonSchema` function).',
},
{
name: 'id?',
type: 'string',
description:
'A unique identifier. If not provided, a random one will be generated. When provided, the `useObject` hook with the same `id` will have shared states across components.',
},
{
name: 'initialValue',
type: 'DeepPartial<RESULT> | undefined',
isOptional: true,
description: 'An value for the initial object. Optional.',
},
{
name: 'fetch',
type: 'FetchFunction',
isOptional: true,
description:
'A custom fetch function to be used for the API call. Defaults to the global fetch function. Optional.',
},
{
name: 'headers',
type: 'Record<string, string> | Headers',
isOptional: true,
description:
'A headers object to be passed to the API endpoint. Optional.',
},
{
name: 'credentials',
type: 'RequestCredentials',
isOptional: true,
description:
'The credentials mode to be used for the fetch request. Possible values are: "omit", "same-origin", "include". Optional.',
},
{
name: 'onError',
type: '(error: Error) => void',
isOptional: true,
description:
'Callback function to be called when an error is encountered. Optional.',
},
{
name: 'onFinish',
type: '(result: OnFinishResult) => void',
isOptional: true,
description: 'Called when the streaming response has finished.',
properties: [
{
type: 'OnFinishResult',
parameters: [
{
name: 'object',
type: 'T | undefined',
description:
'The generated object (typed according to the schema). Can be undefined if the final object does not match the schema.',
},
{
name: 'error',
type: 'Error | undefined',
description:
'Optional error object. This is e.g. a TypeValidationError when the final object does not match the schema.',
},
],
},
],
},
]}
/>

### Returns

<PropertiesTable
content={[
{
name: 'submit',
type: '(input: INPUT) => void',
description: 'Calls the API with the provided input as JSON body.',
},
{
name: 'object',
type: 'DeepPartial<RESULT> | undefined',
description:
'The current value for the generated object. Updated as the API streams JSON chunks.',
},
{
name: 'error',
type: 'Error | undefined',
description: 'The error object if the API call fails.',
},
{
name: 'isLoading',
type: 'boolean',
description:
'Boolean flag indicating whether a request is currently in progress.',
},
{
name: 'stop',
type: '() => void',
description: 'Function to abort the current API request.',
},
{
name: 'clear',
type: '() => void',
description: 'Function to clear the object state.',
},
]}
/>

## Examples

<ExampleLinks
examples={[
{
title: 'Streaming Object Generation with useObject',
link: '/examples/next-pages/basics/streaming-object-generation',
},
]}
/>

---

# `DirectChatTransport`

A transport that directly communicates with an [Agent](/docs/reference/ai-sdk-core/agent) in-process, without going through HTTP. This is useful for:

- Server-side rendering scenarios
- Testing without network
- Single-process applications

Unlike `DefaultChatTransport` which sends HTTP requests to an API endpoint, `DirectChatTransport` invokes the agent's `stream()` method directly and converts the result to a UI message stream.

```tsx
import { useChat } from '@ai-sdk/react';
import { DirectChatTransport, ToolLoopAgent } from 'ai';

__PROVIDER_IMPORT__;

const agent = new ToolLoopAgent({
  model: __MODEL__,
  instructions: 'You are a helpful assistant.',
});

export default function Chat() {
  const { messages, sendMessage, status } = useChat({
    transport: new DirectChatTransport({ agent }),
  });

  // ... render chat UI
}
```

## Import

<Snippet text={`import { DirectChatTransport } from "ai"`} prompt={false} />

## Constructor

### Parameters

<PropertiesTable
content={[
{
name: 'agent',
type: 'Agent',
isRequired: true,
description:
'The Agent instance to use for generating responses. The agent will be called with `stream()` for each message.',
},
{
name: 'options',
type: 'CALL_OPTIONS',
isOptional: true,
description:
'Options to pass to the agent when calling it. These are agent-specific options defined when creating the agent.',
},
{
name: 'originalMessages',
type: 'UIMessage[]',
isOptional: true,
description:
'The original messages. If provided, persistence mode is assumed, and a message ID is provided for the response message.',
},
{
name: 'generateMessageId',
type: 'IdGenerator',
isOptional: true,
description:
'Generate a message ID for the response message. If not provided, no message ID will be set for the response message.',
},
{
name: 'messageMetadata',
type: '(options: { part: TextStreamPart }) => METADATA | undefined',
isOptional: true,
description:
'Extracts message metadata that will be sent to the client. Called on `start` and `finish` events.',
},
{
name: 'sendReasoning',
type: 'boolean',
isOptional: true,
description: 'Send reasoning parts to the client. Defaults to true.',
},
{
name: 'sendSources',
type: 'boolean',
isOptional: true,
description: 'Send source parts to the client. Defaults to false.',
},
{
name: 'sendFinish',
type: 'boolean',
isOptional: true,
description:
'Send the finish event to the client. Set to false if you are using additional streamText calls that send additional data. Defaults to true.',
},
{
name: 'sendStart',
type: 'boolean',
isOptional: true,
description:
'Send the message start event to the client. Set to false if you are using additional streamText calls and the message start event has already been sent. Defaults to true.',
},
{
name: 'onError',
type: '(error: unknown) => string',
isOptional: true,
description:
"Process an error, e.g. to log it. Defaults to `() => 'An error occurred.'`. Return the error message to include in the data stream.",
},
]}
/>

## Methods

### `sendMessages()`

Sends messages to the agent and returns a streaming response. This method validates and converts UI messages to model messages, calls the agent's `stream()` method, and returns the result as a UI message stream.

```ts
const stream = await transport.sendMessages({
  chatId: 'chat-123',
  trigger: 'submit-message',
  messages: [...],
  abortSignal: controller.signal,
});
```

<PropertiesTable
content={[
{
name: 'chatId',
type: 'string',
description: 'Unique identifier for the chat session.',
},
{
name: 'trigger',
type: "'submit-message' | 'regenerate-message'",
description:
'The type of message submission - either new message or regeneration.',
},
{
name: 'messageId',
type: 'string | undefined',
description:
'ID of the message to regenerate, or undefined for new messages.',
},
{
name: 'messages',
type: 'UIMessage[]',
description:
'Array of UI messages representing the conversation history.',
},
{
name: 'abortSignal',
type: 'AbortSignal | undefined',
description: 'Signal to abort the request if needed.',
},
{
name: 'headers',
type: 'Record<string, string> | Headers',
isOptional: true,
description: 'Additional headers (ignored by DirectChatTransport).',
},
{
name: 'body',
type: 'object',
isOptional: true,
description:
'Additional body properties (ignored by DirectChatTransport).',
},
{
name: 'metadata',
type: 'unknown',
isOptional: true,
description: 'Custom metadata (ignored by DirectChatTransport).',
},
]}
/>

#### Returns

Returns a `Promise<ReadableStream<UIMessageChunk>>` - a stream of UI message chunks that can be processed by the chat UI.

### `reconnectToStream()`

Direct transport does not support reconnection since there is no persistent server-side stream to reconnect to.

#### Returns

Always returns `Promise<null>`.

## Examples

### Basic Usage

```tsx
import { openai } from '@ai-sdk/openai';
import { useChat } from '@ai-sdk/react';
import { DirectChatTransport, ToolLoopAgent } from 'ai';

const agent = new ToolLoopAgent({
  model: openai('gpt-4o'),
  instructions: 'You are a helpful assistant.',
});

export default function Chat() {
  const { messages, sendMessage, status } = useChat({
    transport: new DirectChatTransport({ agent }),
  });

  return (
    <div>
      {messages.map((message) => (
        <div key={message.id}>
          {message.role === 'user' ? 'User: ' : 'AI: '}
          {message.parts.map((part, index) =>
            part.type === 'text' ? <span key={index}>{part.text}</span> : null,
          )}
        </div>
      ))}
      <button onClick={() => sendMessage({ text: 'Hello!' })}>Send</button>
    </div>
  );
}
```

### With Agent Tools

```tsx
import { openai } from '@ai-sdk/openai';
import { useChat } from '@ai-sdk/react';
import { DirectChatTransport, tool, ToolLoopAgent } from 'ai';
import { z } from 'zod';

const weatherTool = tool({
  description: 'Get the current weather',
  parameters: z.object({
    location: z.string().describe('The city and state'),
  }),
  execute: async ({ location }) => {
    return `The weather in ${location} is sunny and 72°F.`;
  },
});

const agent = new ToolLoopAgent({
  model: openai('gpt-4o'),
  instructions: 'You are a helpful assistant with access to weather data.',
  tools: { weather: weatherTool },
});

export default function Chat() {
  const { messages, sendMessage } = useChat({
    transport: new DirectChatTransport({ agent }),
  });

  // ... render chat UI with tool results
}
```

### With Custom Agent Options

```tsx
import { openai } from '@ai-sdk/openai';
import { useChat } from '@ai-sdk/react';
import { DirectChatTransport, ToolLoopAgent } from 'ai';

const agent = new ToolLoopAgent<{ userId: string }>({
  model: openai('gpt-4o'),
  prepareCall: ({ options, ...rest }) => ({
    ...rest,
    providerOptions: {
      openai: { user: options.userId },
    },
  }),
});

export default function Chat({ userId }: { userId: string }) {
  const { messages, sendMessage } = useChat({
    transport: new DirectChatTransport({
      agent,
      options: { userId },
    }),
  });

  // ... render chat UI
}
```

### With Reasoning

```tsx
import { openai } from '@ai-sdk/openai';
import { useChat } from '@ai-sdk/react';
import { DirectChatTransport, ToolLoopAgent } from 'ai';

const agent = new ToolLoopAgent({
  model: openai('o1-preview'),
});

export default function Chat() {
  const { messages, sendMessage } = useChat({
    transport: new DirectChatTransport({
      agent,
      sendReasoning: true,
    }),
  });

  return (
    <div>
      {messages.map((message) => (
        <div key={message.id}>
          {message.parts.map((part, index) => {
            if (part.type === 'text') {
              return <p key={index}>{part.text}</p>;
            }
            if (part.type === 'reasoning') {
              return (
                <pre key={index} style={{ opacity: 0.6 }}>
                  {part.text}
                </pre>
              );
            }
            return null;
          })}
        </div>
      ))}
    </div>
  );
}
```

---

# AI SDK

The AI SDK is the TypeScript toolkit designed to help developers build AI-powered applications and agents with React, Next.js, Vue, Svelte, Node.js, and more.

## Why use the AI SDK?

Integrating large language models (LLMs) into applications is complicated and heavily dependent on the specific model provider you use.

The AI SDK standardizes integrating artificial intelligence (AI) models across [supported providers](/docs/foundations/providers-and-models). This enables developers to focus on building great AI applications, not waste time on technical details.

For example, here’s how you can generate text with various models using the AI SDK:

<PreviewSwitchProviders />

The AI SDK has two main libraries:

- **[AI SDK Core](/docs/ai-sdk-core):** A unified API for generating text, structured objects, tool calls, and building agents with LLMs.
- **[AI SDK UI](/docs/ai-sdk-ui):** A set of framework-agnostic hooks for quickly building chat and generative user interface.

## Model Providers

The AI SDK supports [multiple model providers](/providers).

<OfficialModelCards />

## Templates

We've built some [templates](https://vercel.com/templates?type=ai) that include AI SDK integrations for different use cases, providers, and frameworks. You can use these templates to get started with your AI-powered application.

### Starter Kits

<Templates type="starter-kits" />

### Feature Exploration

<Templates type="feature-exploration" />

### Frameworks

<Templates type="frameworks" />

### Generative UI

<Templates type="generative-ui" />

### Security

<Templates type="security" />

## Join our Community

If you have questions about anything related to the AI SDK, you're always welcome to ask our community on [the Vercel Community](https://community.vercel.com/c/ai-sdk/62).

## `llms.txt` (for Cursor, Windsurf, Copilot, Claude etc.)

You can access the entire AI SDK documentation in Markdown format at [ai-sdk.dev/llms.txt](/llms.txt). This can be used to ask any LLM (assuming it has a big enough context window) questions about the AI SDK based on the most up-to-date documentation.

### Example Usage

For instance, to prompt an LLM with questions about the AI SDK:

1. Copy the documentation contents from [ai-sdk.dev/llms.txt](/llms.txt)
2. Use the following prompt format:

```prompt
Documentation:
{paste documentation here}
---
Based on the above documentation, answer the following:
{your question}
```

---

Express example

```
openai-web-search-agent.ts

import { openai, OpenAILanguageModelResponsesOptions } from '@ai-sdk/openai';
import { ToolLoopAgent } from 'ai';

export const openaiWebSearchAgent = new ToolLoopAgent({
  model: openai('gpt-5-mini'),
  tools: {
    web_search: openai.tools.webSearch({
      searchContextSize: 'low',
      userLocation: {
        type: 'approximate',
        city: 'San Francisco',
        region: 'California',
        country: 'US',
      },
    }),
  },
  providerOptions: {
    openai: {
      reasoningEffort: 'medium',
      reasoningSummary: 'detailed',
    } satisfies OpenAILanguageModelResponsesOptions,
  },
});
```

```
import { openai } from '@ai-sdk/openai';
import {
  createUIMessageStream,
  pipeAgentUIStreamToResponse,
  pipeUIMessageStreamToResponse,
  streamText,
} from 'ai';
import 'dotenv/config';
import express, { Request, Response } from 'express';
import { openaiWebSearchAgent } from './openai-web-search-agent.js';

const app = express();
app.use(express.json());

const prompt = 'Invent a new holiday and describe its traditions.';

app.get('/', (_req: Request, res: Response) => {
  res.send(
    `<html><body>
      <form method="POST">
        <button type="submit">${prompt}</button>
      </form>
    </body></html>`,
  );
});

app.post('/', async (req: Request, res: Response) => {
  const result = streamText({
    model: openai('gpt-4o'),
    prompt,
  });

  result.pipeUIMessageStreamToResponse(res);
});

app.post('/chat', async (request: Request, response: Response) => {
  pipeAgentUIStreamToResponse({
    agent: openaiWebSearchAgent,
    uiMessages: request.body.messages,
    response,
  });
});

app.post('/custom-data-parts', async (req: Request, res: Response) => {
  pipeUIMessageStreamToResponse({
    response: res,
    stream: createUIMessageStream({
      execute: async ({ writer }) => {
        writer.write({ type: 'start' });

        writer.write({
          type: 'data-custom',
          data: {
            custom: 'Hello, world!',
          },
        });

        const result = streamText({
          model: openai('gpt-4o'),
          prompt: 'Invent a new holiday and describe its traditions.',
        });

        writer.merge(result.toUIMessageStream({ sendStart: false }));
      },
    }),
  });
});

app.listen(8080, () => {
  console.log(`Example app listening on port ${8080}`);
});
```
