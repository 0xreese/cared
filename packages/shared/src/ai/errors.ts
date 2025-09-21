import {
  AISDKError,
  APICallError,
  DownloadError,
  EmptyResponseBodyError,
  InvalidArgumentError,
  InvalidDataContentError,
  InvalidMessageRoleError,
  InvalidPromptError,
  InvalidResponseDataError,
  InvalidStreamPartError,
  InvalidToolInputError,
  JSONParseError,
  LoadAPIKeyError,
  MCPClientError,
  MessageConversionError,
  // LoadSettingError,
  NoContentGeneratedError,
  NoImageGeneratedError,
  NoObjectGeneratedError,
  NoOutputSpecifiedError,
  NoSuchModelError,
  // NoSpeechGeneratedError, // Not used
  NoSuchToolError,
  RetryError,
  // NoTranscriptGeneratedError,
  ToolCallRepairError,
  // TooManyEmbeddingValuesForCallError,
  TypeValidationError,
  UnsupportedFunctionalityError,
} from 'ai'

import { SuperJSON } from '../superjson'

type ErrorJSON = {
  className: string
} & Record<string, any>

abstract class SerializableError {
  abstract toJSON(error: Error): ErrorJSON

  static fromJSON(_json: ErrorJSON): Error {
    throw new Error('fromJSON method not implemented')
  }
}

class ErrorSerializer extends SerializableError {
  toJSON(error: Error) {
    const cause = error.cause

    const json = {
      className: 'Error',
      message: error.message,
      cause,
    }

    if (cause && (AISDKError.isInstance(cause) || cause instanceof Error)) {
      const serializer = errorSerializerRegistry[cause.name]
      if (serializer) {
        // @ts-ignore
        json.cause = new serializer().toJSON(cause)
      }
    }
    return json
  }

  static fromJSON(json: ErrorJSON): Error {
    let cause = json.cause
    if (cause && typeof cause === 'object' && 'className' in cause) {
      cause = errorSerializerRegistry[cause.className]?.fromJSON(cause)
    }
    return new Error(json.message, cause ? { cause } : undefined)
  }
}

class AISDKErrorSerializer extends ErrorSerializer {
  toJSON(error: AISDKError) {
    const json = super.toJSON(error)

    return {
      ...json,
      name: error.name,
      className: 'AISDKError',
    }
  }

  static fromJSON(json: ErrorJSON): AISDKError {
    const error = ErrorSerializer.fromJSON(json)
    return new AISDKError({
      name: json.name,
      message: error.message,
      cause: error.cause,
    })
  }
}

class InvalidDataContentErrorSerializer extends AISDKErrorSerializer {
  toJSON(error: InvalidDataContentError) {
    const json = super.toJSON(error)

    return {
      ...json,
      content: error.content,
      className: 'InvalidDataContentError',
    }
  }

  static fromJSON(json: ErrorJSON): InvalidDataContentError {
    const error = AISDKErrorSerializer.fromJSON(json)
    return new InvalidDataContentError({
      content: json.content,
      message: error.message,
      cause: error.cause,
    })
  }
}

class InvalidMessageRoleErrorSerializer extends AISDKErrorSerializer {
  toJSON(error: InvalidMessageRoleError) {
    const json = super.toJSON(error)

    return {
      ...json,
      role: error.role,
      className: 'InvalidMessageRoleError',
    }
  }

  static fromJSON(json: ErrorJSON): InvalidMessageRoleError {
    const error = AISDKErrorSerializer.fromJSON(json)
    return new InvalidMessageRoleError({
      role: json.role,
      message: error.message,
    })
  }
}

class MessageConversionErrorSerializer extends AISDKErrorSerializer {
  toJSON(error: MessageConversionError) {
    const json = super.toJSON(error)

    return {
      ...json,
      originalMessage: error.originalMessage,
      className: 'MessageConversionError',
    }
  }

  static fromJSON(json: ErrorJSON): MessageConversionError {
    const error = AISDKErrorSerializer.fromJSON(json)
    return new MessageConversionError({
      originalMessage: json.originalMessage,
      message: error.message,
    })
  }
}

class InvalidArgumentErrorSerializer extends AISDKErrorSerializer {
  toJSON(error: InvalidArgumentError) {
    const json = super.toJSON(error)

    return {
      ...json,
      parameter: error.parameter,
      value: error.value,
      className: 'InvalidArgumentError',
    }
  }

  static fromJSON(json: ErrorJSON): InvalidArgumentError {
    const error = AISDKErrorSerializer.fromJSON(json)
    return new InvalidArgumentError({
      parameter: json.parameter,
      value: json.value,
      message: error.message,
    })
  }
}

class InvalidStreamPartErrorSerializer extends AISDKErrorSerializer {
  toJSON(error: InvalidStreamPartError) {
    const json = super.toJSON(error)

    return {
      ...json,
      // TODO
      chunk: error.chunk,
      className: 'InvalidStreamPartError',
    }
  }

  static fromJSON(json: ErrorJSON): InvalidStreamPartError {
    const error = AISDKErrorSerializer.fromJSON(json)
    return new InvalidStreamPartError({
      // TODO
      chunk: json.chunk,
      message: error.message,
    })
  }
}

class InvalidToolInputErrorSerializer extends AISDKErrorSerializer {
  toJSON(error: InvalidToolInputError) {
    const json = super.toJSON(error)

    return {
      ...json,
      toolName: error.toolName,
      toolInput: error.toolInput,
      className: 'InvalidToolInputError',
    }
  }

  static fromJSON(json: ErrorJSON): InvalidToolInputError {
    const error = AISDKErrorSerializer.fromJSON(json)
    return new InvalidToolInputError({
      message: error.message,
      toolInput: json.toolInput,
      toolName: json.toolName,
      cause: error.cause,
    })
  }
}

class MCPClientErrorSerializer extends AISDKErrorSerializer {
  toJSON(error: MCPClientError) {
    const json = super.toJSON(error)

    return {
      ...json,
      name: error.name,
      className: 'MCPClientError',
    }
  }

  static fromJSON(json: ErrorJSON): MCPClientError {
    const error = AISDKErrorSerializer.fromJSON(json)
    return new MCPClientError({
      name: json.name,
      message: error.message,
      cause: error.cause,
    })
  }
}

class NoImageGeneratedErrorSerializer extends AISDKErrorSerializer {
  toJSON(error: NoImageGeneratedError) {
    const json = super.toJSON(error)

    return {
      ...json,
      responses: error.responses,
      className: 'NoImageGeneratedError',
    }
  }

  static fromJSON(json: ErrorJSON): NoImageGeneratedError {
    const error = AISDKErrorSerializer.fromJSON(json)
    return new NoImageGeneratedError({
      message: error.message,
      cause: error.cause as any,
      responses: json.responses,
    })
  }
}

class NoObjectGeneratedErrorSerializer extends AISDKErrorSerializer {
  toJSON(error: NoObjectGeneratedError) {
    const json = super.toJSON(error)

    return {
      ...json,
      text: error.text,
      response: error.response,
      usage: error.usage,
      finishReason: error.finishReason,
      className: 'NoObjectGeneratedError',
    }
  }

  static fromJSON(json: ErrorJSON): NoObjectGeneratedError {
    const error = AISDKErrorSerializer.fromJSON(json)
    return new NoObjectGeneratedError({
      message: error.message,
      cause: error.cause as any,
      text: json.text,
      response: json.response,
      usage: json.usage,
      finishReason: json.finishReason,
    })
  }
}

class NoOutputSpecifiedErrorSerializer extends AISDKErrorSerializer {
  toJSON(error: NoOutputSpecifiedError) {
    const json = super.toJSON(error)
    return {
      ...json,
      className: 'NoOutputSpecifiedError',
    }
  }

  static fromJSON(json: ErrorJSON): NoOutputSpecifiedError {
    const error = AISDKErrorSerializer.fromJSON(json)
    return new NoOutputSpecifiedError({
      message: error.message,
    })
  }
}

class NoSuchToolErrorSerializer extends AISDKErrorSerializer {
  toJSON(error: NoSuchToolError) {
    const json = super.toJSON(error)

    return {
      ...json,
      toolName: error.toolName,
      availableTools: error.availableTools,
      className: 'NoSuchToolError',
    }
  }

  static fromJSON(json: ErrorJSON): NoSuchToolError {
    const error = AISDKErrorSerializer.fromJSON(json)
    return new NoSuchToolError({
      toolName: json.toolName,
      availableTools: json.availableTools,
      message: error.message,
    })
  }
}

class ToolCallRepairErrorSerializer extends AISDKErrorSerializer {
  toJSON(error: ToolCallRepairError) {
    const json = super.toJSON(error)

    const serializer = errorSerializerRegistry[error.originalError.name]
    // @ts-ignore
    const originalError = new serializer().toJSON(error.originalError)

    return {
      ...json,
      originalError,
      className: 'ToolCallRepairError',
    }
  }

  static fromJSON(json: ErrorJSON): ToolCallRepairError | AISDKError {
    const error = AISDKErrorSerializer.fromJSON(json)

    const originalError = errorSerializerRegistry[json.originalError.className]?.fromJSON(
      json.originalError,
    )

    if (originalError) {
      return new ToolCallRepairError({
        cause: error.cause,
        originalError: originalError as any,
        message: error.message,
      })
    } else {
      return new AISDKError({
        name: 'AI_ToolCallRepairError',
        message: error.message,
        cause: error.cause,
      })
    }
  }
}

class DownloadErrorSerializer extends AISDKErrorSerializer {
  toJSON(error: DownloadError) {
    const json = super.toJSON(error)

    return {
      ...json,
      url: error.url,
      statusCode: error.statusCode,
      statusText: error.statusText,
      className: 'DownloadError',
    }
  }

  static fromJSON(json: ErrorJSON): DownloadError {
    const error = AISDKErrorSerializer.fromJSON(json)
    return new DownloadError({
      url: json.url,
      statusCode: json.statusCode,
      statusText: json.statusText,
      message: error.message,
      cause: error.cause,
    })
  }
}

class RetryErrorSerializer extends AISDKErrorSerializer {
  toJSON(error: RetryError) {
    const json = super.toJSON(error)

    return {
      ...json,
      reason: error.reason,
      errors: error.errors,
      className: 'RetryError',
    }
  }

  static fromJSON(json: ErrorJSON): RetryError {
    const error = AISDKErrorSerializer.fromJSON(json)
    return new RetryError({
      message: error.message,
      reason: json.reason,
      errors: json.errors,
    })
  }
}

class APICallErrorSerializer extends AISDKErrorSerializer {
  toJSON(error: APICallError) {
    const json = super.toJSON(error)

    return {
      ...json,
      url: error.url,
      requestBodyValues: error.requestBodyValues,
      statusCode: error.statusCode,
      responseHeaders: error.responseHeaders,
      responseBody: error.responseBody,
      isRetryable: error.isRetryable,
      data: error.data,
      className: 'APICallError',
    }
  }

  static fromJSON(json: ErrorJSON): APICallError {
    const error = AISDKErrorSerializer.fromJSON(json)
    return new APICallError({
      message: error.message,
      url: json.url,
      requestBodyValues: json.requestBodyValues,
      statusCode: json.statusCode,
      responseHeaders: json.responseHeaders,
      responseBody: json.responseBody,
      cause: error.cause,
      isRetryable: json.isRetryable,
      data: json.data,
    })
  }
}

class EmptyResponseBodyErrorSerializer extends AISDKErrorSerializer {
  toJSON(error: EmptyResponseBodyError) {
    const json = super.toJSON(error)
    return {
      ...json,
      className: 'EmptyResponseBodyError',
    }
  }

  static fromJSON(json: ErrorJSON): EmptyResponseBodyError {
    const error = AISDKErrorSerializer.fromJSON(json)
    return new EmptyResponseBodyError({
      message: error.message,
    })
  }
}

class InvalidPromptErrorSerializer extends AISDKErrorSerializer {
  toJSON(error: InvalidPromptError) {
    const json = super.toJSON(error)

    return {
      ...json,
      prompt: error.prompt,
      className: 'InvalidPromptError',
    }
  }

  static fromJSON(json: ErrorJSON): InvalidPromptError {
    const error = AISDKErrorSerializer.fromJSON(json)
    return new InvalidPromptError({
      prompt: json.prompt,
      message: error.message,
      cause: error.cause,
    })
  }
}

class InvalidResponseDataErrorSerializer extends AISDKErrorSerializer {
  toJSON(error: InvalidResponseDataError) {
    const json = super.toJSON(error)

    return {
      ...json,
      data: error.data,
      className: 'InvalidResponseDataError',
    }
  }

  static fromJSON(json: ErrorJSON): InvalidResponseDataError {
    const error = AISDKErrorSerializer.fromJSON(json)
    return new InvalidResponseDataError({
      data: json.data,
      message: error.message,
    })
  }
}

class JSONParseErrorSerializer extends AISDKErrorSerializer {
  toJSON(error: JSONParseError) {
    const json = super.toJSON(error)

    return {
      ...json,
      text: error.text,
      className: 'JSONParseError',
    }
  }

  static fromJSON(json: ErrorJSON): JSONParseError {
    const error = AISDKErrorSerializer.fromJSON(json)
    return new JSONParseError({
      text: json.text,
      cause: error.cause,
    })
  }
}

class LoadAPIKeyErrorSerializer extends AISDKErrorSerializer {
  toJSON(error: LoadAPIKeyError) {
    const json = super.toJSON(error)
    return {
      ...json,
      className: 'LoadAPIKeyError',
    }
  }

  static fromJSON(json: ErrorJSON): LoadAPIKeyError {
    const error = AISDKErrorSerializer.fromJSON(json)
    return new LoadAPIKeyError({
      message: error.message,
    })
  }
}

class NoContentGeneratedErrorSerializer extends AISDKErrorSerializer {
  toJSON(error: NoContentGeneratedError) {
    const json = super.toJSON(error)
    return {
      ...json,
      className: 'NoContentGeneratedError',
    }
  }

  static fromJSON(json: ErrorJSON): NoContentGeneratedError {
    const error = AISDKErrorSerializer.fromJSON(json)
    return new NoContentGeneratedError({
      message: error.message,
    })
  }
}

class NoSuchModelErrorSerializer extends AISDKErrorSerializer {
  toJSON(error: NoSuchModelError) {
    const json = super.toJSON(error)

    return {
      ...json,
      modelId: error.modelId,
      modelType: error.modelType,
      className: 'NoSuchModelError',
    }
  }

  static fromJSON(json: ErrorJSON): NoSuchModelError {
    const error = AISDKErrorSerializer.fromJSON(json)
    return new NoSuchModelError({
      errorName: error.name,
      modelId: json.modelId,
      modelType: json.modelType,
      message: error.message,
    })
  }
}

class TypeValidationErrorSerializer extends AISDKErrorSerializer {
  toJSON(error: TypeValidationError) {
    const json = super.toJSON(error)

    return {
      ...json,
      value: error.value,
      className: 'TypeValidationError',
    }
  }

  static fromJSON(json: ErrorJSON): TypeValidationError {
    const error = AISDKErrorSerializer.fromJSON(json)
    return new TypeValidationError({
      value: json.value,
      cause: error.cause,
    })
  }
}

class UnsupportedFunctionalityErrorSerializer extends AISDKErrorSerializer {
  toJSON(error: UnsupportedFunctionalityError) {
    const json = super.toJSON(error)

    return {
      ...json,
      functionality: error.functionality,
      className: 'UnsupportedFunctionalityError',
    }
  }

  static fromJSON(json: ErrorJSON): UnsupportedFunctionalityError {
    const error = AISDKErrorSerializer.fromJSON(json)
    return new UnsupportedFunctionalityError({
      functionality: json.functionality,
      message: error.message,
    })
  }
}

// Registry for all error serializers
export const errorSerializerRegistry: Record<string, typeof SerializableError> = {
  Error: ErrorSerializer,
  AISDKError: AISDKErrorSerializer,
  InvalidDataContentError: InvalidDataContentErrorSerializer,
  InvalidMessageRoleError: InvalidMessageRoleErrorSerializer,
  MessageConversionError: MessageConversionErrorSerializer,
  InvalidArgumentError: InvalidArgumentErrorSerializer,
  InvalidStreamPartError: InvalidStreamPartErrorSerializer,
  InvalidToolInputError: InvalidToolInputErrorSerializer,
  MCPClientError: MCPClientErrorSerializer,
  NoImageGeneratedError: NoImageGeneratedErrorSerializer,
  NoObjectGeneratedError: NoObjectGeneratedErrorSerializer,
  NoOutputSpecifiedError: NoOutputSpecifiedErrorSerializer,
  NoSuchToolError: NoSuchToolErrorSerializer,
  ToolCallRepairError: ToolCallRepairErrorSerializer,
  DownloadError: DownloadErrorSerializer,
  RetryError: RetryErrorSerializer,
  APICallError: APICallErrorSerializer,
  EmptyResponseBodyError: EmptyResponseBodyErrorSerializer,
  InvalidPromptError: InvalidPromptErrorSerializer,
  InvalidResponseDataError: InvalidResponseDataErrorSerializer,
  JSONParseError: JSONParseErrorSerializer,
  LoadAPIKeyError: LoadAPIKeyErrorSerializer,
  NoContentGeneratedError: NoContentGeneratedErrorSerializer,
  NoSuchModelError: NoSuchModelErrorSerializer,
  TypeValidationError: TypeValidationErrorSerializer,
  UnsupportedFunctionalityError: UnsupportedFunctionalityErrorSerializer,
}

function trimNonAlphanumericASCII(str: string) {
  return str.replace(/^[^a-zA-Z0-9]+|[^a-zA-Z0-9]+$/g, '')
}

export function serializeError(error: Error): string {
  const serializer =
    errorSerializerRegistry[trimNonAlphanumericASCII(error.constructor.name)] || ErrorSerializer
  // @ts-ignore
  const json = new serializer().toJSON(error)
  return SuperJSON.stringify(json)
}

export function deserializeError(string: string): Error {
  const json = SuperJSON.parse<ErrorJSON>(string)
  const deserializer = errorSerializerRegistry[json.className] || ErrorSerializer
  return deserializer.fromJSON(json)
}
