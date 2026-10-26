export const ADMIN_PASSWORD_MIN_LENGTH = 12
export const ADMIN_PASSWORD_MAX_LENGTH = 72
export const ADMIN_PASSWORD_POLICY_MESSAGE =
  'Use at least 12 characters with uppercase, lowercase, a number, and a symbol.'

const passwordGroups = [
  'abcdefghijklmnopqrstuvwxyz',
  'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  '0123456789',
  "!@#$%^&*()_+-=[]{};':\"|<>?,./`~",
]
const passwordAlphabet = passwordGroups.join('')

export function isStrongAdminPassword(password, minimumLength = ADMIN_PASSWORD_MIN_LENGTH) {
  if (typeof password !== 'string' || password.length < minimumLength || password.length > ADMIN_PASSWORD_MAX_LENGTH) {
    return false
  }

  return passwordGroups.every(group => [...password].some(character => group.includes(character)))
}

function randomIndex(maximum) {
  const cutoff = Math.floor(256 / maximum) * maximum
  let byte
  do {
    byte = crypto.getRandomValues(new Uint8Array(1))[0]
  } while (byte >= cutoff)
  return byte % maximum
}

export function randomStrongAdminPassword() {
  const characters = Array.from({ length: 60 }, () => passwordAlphabet[randomIndex(passwordAlphabet.length)])
  passwordGroups.forEach((group, index) => {
    characters[index] = group[randomIndex(group.length)]
  })
  for (let index = characters.length - 1; index > 0; index -= 1) {
    const swapIndex = randomIndex(index + 1)
    ;[characters[index], characters[swapIndex]] = [characters[swapIndex], characters[index]]
  }
  return characters.join('')
}
