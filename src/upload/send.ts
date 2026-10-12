/**
 * One request with real upload progress.
 *
 * XMLHttpRequest, not fetch, because fetch has no upload progress:
 * `xhr.upload.onprogress` is the only way a browser will say how much of a
 * body has actually left the phone. (LoadLab and Tulle used fetch and showed
 * staged guesses or a bare "photo 2 of 5"; the Us timeline had this.)
 */

export type SendResult = {
  status: number
  ok: boolean
  /** The body parsed as JSON, or null when it isn't JSON (an HTML error page, say). */
  json: unknown
  text: string
}

export class UploadError extends Error {
  constructor(
    message: string,
    /** network: never reached the server · aborted: cancelled · http: the server said no */
    readonly kind: 'network' | 'aborted' | 'http',
    readonly status?: number,
  ) {
    super(message)
    this.name = 'UploadError'
  }
}

export type SendOptions = {
  method?: 'POST' | 'PUT' | 'PATCH'
  headers?: Record<string, string>
  /** Bytes of the BODY sent so far, and the body's size. */
  onProgress?: (sent: number, total: number) => void
  signal?: AbortSignal
}

/**
 * Resolves for any HTTP answer, error statuses included (check `ok`), and
 * rejects with an UploadError only when there was no answer: the network
 * dropped, or `signal` cancelled it.
 */
export function send(
  url: string,
  body: XMLHttpRequestBodyInit,
  options: SendOptions = {},
): Promise<SendResult> {
  const { method = 'POST', headers, onProgress, signal } = options
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new UploadError('Upload cancelled', 'aborted'))
    const xhr = new XMLHttpRequest()
    xhr.open(method, url)
    for (const [k, v] of Object.entries(headers ?? {})) xhr.setRequestHeader(k, v)
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.(e.loaded, e.total)
    }
    const abort = () => xhr.abort()
    signal?.addEventListener('abort', abort, { once: true })
    const done = () => signal?.removeEventListener('abort', abort)
    xhr.onload = () => {
      done()
      const text = xhr.responseText ?? ''
      let json: unknown = null
      try {
        json = text ? JSON.parse(text) : null
      } catch {
        json = null
      }
      resolve({ status: xhr.status, ok: xhr.status >= 200 && xhr.status < 300, json, text })
    }
    xhr.onerror = () => {
      done()
      reject(
        new UploadError(
          'It didn’t reach the server. Check the connection and try again.',
          'network',
        ),
      )
    }
    xhr.onabort = () => {
      done()
      reject(new UploadError('Upload cancelled', 'aborted'))
    }
    xhr.send(body)
  })
}

/**
 * What to tell a person about a failed answer. The app's own `{ error }`
 * wins; otherwise the status says it - and a 413 that isn't JSON is a proxy
 * refusing the size (Cloudflare's tunnel stops bodies over 100 MB with its
 * own HTML page), which used to surface as a JSON parse error or "didn't
 * reach the server".
 */
export function failureMessage(res: SendResult): string {
  const own =
    res.json && typeof res.json === 'object' && 'error' in res.json
      ? (res.json as { error: unknown }).error
      : null
  if (typeof own === 'string' && own) return own
  if (res.status === 413) return 'That file is too big to send.'
  if (res.status === 401 || res.status === 403)
    return 'You’re not signed in for that any more. Sign in and try again.'
  if (res.status >= 500) return `The server had a problem (${res.status}). Try again in a moment.`
  return `Upload failed (${res.status}).`
}

/** `send`, then throw an UploadError with `failureMessage` unless the answer was OK. */
export async function sendOrThrow(
  url: string,
  body: XMLHttpRequestBodyInit,
  options?: SendOptions,
): Promise<SendResult> {
  const res = await send(url, body, options)
  if (!res.ok) throw new UploadError(failureMessage(res), 'http', res.status)
  return res
}
