class CustomResponse extends Response {
  constructor(
    private wait: void | Promise<void>,
    body?: any,
    init?: ResponseInit,
  ) {
    super(body, init)
  }

  arrayBuffer = async () => {
    // @ts-ignore
    // eslint-disable-next-line @typescript-eslint/await-thenable
    const [result] = await Promise.all([super.arrayBuffer(), this.wait])
    return result
  }
  blob = async () => {
    // @ts-ignore
    // eslint-disable-next-line @typescript-eslint/await-thenable
    const [result] = await Promise.all([super.blob(), this.wait])
    return result
  }
  formData = async () => {
    // @ts-ignore
    // eslint-disable-next-line @typescript-eslint/await-thenable
    const [result] = await Promise.all([super.formData(), this.wait])
    return result
  }
  json = async () => {
    // @ts-ignore
    // eslint-disable-next-line @typescript-eslint/await-thenable
    const [result] = await Promise.all([super.json(), this.wait])
    return result
  }
  text = async () => {
    // @ts-ignore
    // eslint-disable-next-line @typescript-eslint/await-thenable
    const [result] = await Promise.all([super.text(), this.wait])
    return result
  }
}

export function createCustomFetch({
  onResponse,
  onLatency,
}: {
  onResponse?: (response: Response) => void | Promise<void>
  onLatency?: (latency: number) => void
}) {
  return async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const startTime = performance.now()
    let response = await fetch(input, init)
    const endTime = performance.now()

    if (onResponse) {
      const promise = onResponse(response.clone())
      response = new CustomResponse(promise, response.body, response)
    }

    if (onLatency) {
      onLatency(Math.floor(endTime - startTime))
    }

    return response
  }
}

export function createCustomJsonFetch<T extends Record<string, any>>({
  onSuccess,
  onError,
  onLatency,
}: {
  onSuccess?: (data: T) => void
  onError?: (data: T) => void
  onLatency?: (latency: number) => void
}) {
  return createCustomFetch({
    onResponse:
      onSuccess || onError
        ? async (response: Response) => {
            if (response.ok && onSuccess) {
              onSuccess((await response.json()) as T)
            } else if (!response.ok && onError) {
              onError((await response.json()) as T)
            }
          }
        : undefined,
    onLatency,
  })
}
