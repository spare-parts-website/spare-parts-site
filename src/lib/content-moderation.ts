const substitutions: Record<string, string> = {
  '0': 'o',
  '1': 'i',
  '!': 'i',
  '3': 'e',
  '4': 'a',
  '@': 'a',
  '5': 's',
  '$': 's',
  '7': 't',
}

const blockedTokens = [
  /^f+[uoa]+c+k+(?:e+r+|i+n+g+|e+d+|s+)?$/,
  /^(?:b+u+l+l+)?s+h+i+t+(?:t+y+|s+)?$/,
  /^b+i+t+c+h+(?:e+s+|y+)?$/,
  /^a+s+s+h+o+l+e+s?$/,
  /^c+u+n+t+s?$/,
  /^f+a+g+(?:g+o+t+|g+y+|s+)?$/,
  /^n+i+g+g+(?:e+r+|a+h*|a+s*)?$/,
  /^r+e+t+a+r+d+(?:e+d+|s+)?$/,
  /^(?:كس|كسم|زب|زبر|شرموط|شرموطة|قحبة|متناك|متناكة|عرص|خول)(?:ات|ين|ون|ه|ها|ك|كم)?$/u,
]

const separatedBlocked = [
  /(?<![\p{L}\p{N}])f[\s._-]*u[\s._-]*c[\s._-]*k(?![\p{L}\p{N}])/giu,
  /(?<![\p{L}\p{N}])n[\s._-]*[i1!][\s._-]*g[\s._-]*g[\s._-]*(?:e[\s._-]*r|a)(?![\p{L}\p{N}])/giu,
]

function normalizedToken(value: string) {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase('en-US')
    .replace(/[013457!@$]/g, (character) => substitutions[character] || character)
    .replace(/[\u064B-\u065F\u0670ـ]/g, '')
    .replace(/[^\p{L}\p{N}]/gu, '')
}

function isBlockedToken(value: string) {
  const normalized = normalizedToken(value)
  return normalized.length > 1 && blockedTokens.some((pattern) => pattern.test(normalized))
}

function maskToken(value: string) {
  return value.replace(/[\p{L}\p{N}]/gu, '•')
}

/** Censors abusive words while preserving spacing and punctuation for readable chat. */
export function censorChatContent(value: string) {
  let censored = false
  let text = value
  for (const pattern of separatedBlocked) {
    text = text.replace(pattern, (match) => {
      censored = true
      return maskToken(match)
    })
  }
  text = text.replace(/[\p{L}\p{N}@$]+/gu, (token) => {
    if (!isBlockedToken(token)) return token
    censored = true
    return maskToken(token)
  })
  return { text, censored }
}
